import * as tls from "tls";
import { buildFixPrompt } from "@/lib/remediation";
import type { SecurityFinding } from "@/lib/types";
import { db } from "@/lib/db";
import { ssrfSafeFetch } from "@/lib/ssrf-guard";

// ────────────────────────────────────────────
// 1. Exposed API keys in client-side JS
// ────────────────────────────────────────────

const KEY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // AWS — AKIA is an access key ID; the pattern is consistent and well-known
  { pattern: /AKIA[0-9A-Z]{16}/g, label: "AWS access key ID" },
  // AWS secret access key (40 chars, base64url) — only flag when near an assignment
  { pattern: /aws[_\-.]?secret[_\-.]?(?:access[_\-.]?)?key\s*[:=]\s*["'`]?[A-Za-z0-9/+=]{40}["'`]?/gi, label: "AWS secret access key" },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: "OpenAI secret key" },
  { pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, label: "Anthropic secret key" },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/g, label: "Google API key" },
  // GitHub tokens
  { pattern: /ghp_[A-Za-z0-9]{36,}/g, label: "GitHub personal access token" },
  { pattern: /gho_[A-Za-z0-9]{36,}/g, label: "GitHub OAuth token" },
  { pattern: /github_pat_[A-Za-z0-9_]{22,}/g, label: "GitHub fine-grained personal access token" },
  { pattern: /ghs_[A-Za-z0-9]{36,}/g, label: "GitHub Actions secret" },
  // Slack
  { pattern: /xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{20,}/g, label: "Slack bot token" },
  { pattern: /xoxp-[0-9]{10,}-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{20,}/g, label: "Slack user token" },
  {
    pattern: /eyJhbGciOi[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
    label: "JWT token (possibly service key)",
  },
  {
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][^"'`]{20,}["'`]/g,
    label: "Supabase service role key",
  },
  {
    pattern: /SUPABASE_ANON_KEY|supabaseKey|supabase_key/g,
    label: "Supabase anon key reference (verify not service key)",
  },
  // Stripe — both live and test secret keys should not appear in client bundles
  { pattern: /stripe[_.]?secret[_.]?key\s*[:=]\s*["'`]sk_live_[^"'`]+["'`]/gi, label: "Stripe live secret key" },
  { pattern: /sk_live_[a-zA-Z0-9]{20,}/g, label: "Stripe live secret key" },
  { pattern: /sk_test_[a-zA-Z0-9]{20,}/g, label: "Stripe test secret key (should not be in client bundle)" },
  // npm auth tokens
  { pattern: /npm_[A-Za-z0-9]{36}/g, label: "npm authentication token" },
  // Twilio
  { pattern: /AC[a-fA-F0-9]{32}/g, label: "Twilio Account SID" },
  { pattern: /SK[a-fA-F0-9]{32}/g, label: "Twilio API key" },
  // SendGrid
  { pattern: /SG\.[A-Za-z0-9_\-]{22,}\.[A-Za-z0-9_\-]{43}/g, label: "SendGrid API key" },
];

// Known safe public keys to suppress false positives
// pk_test_ / pk_live_ are Stripe publishable keys — safe to expose
// AKID is a common placeholder in docs, not a real key
const SAFE_PREFIXES = ["pk_test_", "pk_live_", "sb-", "anon.", "AKID"];

function isFalsePositive(match: string): boolean {
  return SAFE_PREFIXES.some((p) => match.startsWith(p));
}

export function scanJavaScriptForKeys(jsPayloads: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  jsPayloads.forEach((payload, idx) => {
    for (const { pattern, label } of KEY_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(payload)) !== null) {
        const token = match[0];
        if (isFalsePositive(token)) continue;
        const dedupKey = `${label}:${token.slice(0, 12)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        findings.push({
          code: "EXPOSED_API_KEY",
          title: `Exposed ${label} in client-side JavaScript`,
          description: `Detected ${label} in JS asset #${idx + 1}. Token prefix: ${token.slice(0, 8)}...`,
          severity: "CRITICAL",
          fixPrompt: buildFixPrompt(
            `Exposed ${label} in frontend bundle`,
            `1. Immediately rotate this key.\n2. Move all secret usage to server-side API routes or edge functions.\n3. Add a build-time check (e.g., gitleaks) to prevent secrets from reaching the client bundle.\n4. If this is a Supabase anon key, verify Row Level Security (RLS) is enabled on all tables.`,
          ),
        });
      }
    }
  });

  return findings;
}

// ────────────────────────────────────────────
// 2. Missing security headers
// ────────────────────────────────────────────

const REQUIRED_HEADERS: Array<{
  header: string;
  severity: "HIGH" | "MEDIUM";
  action: string;
}> = [
  {
    header: "content-security-policy",
    severity: "HIGH",
    action: "Add a Content-Security-Policy header to mitigate XSS and injection attacks.",
  },
  {
    header: "x-frame-options",
    severity: "HIGH",
    action: "Set X-Frame-Options to DENY or SAMEORIGIN to prevent clickjacking.",
  },
  {
    header: "strict-transport-security",
    severity: "HIGH",
    action: "Enable HSTS (Strict-Transport-Security) with max-age of at least 31536000.",
  },
  {
    header: "x-content-type-options",
    severity: "MEDIUM",
    action: "Set X-Content-Type-Options: nosniff to prevent MIME type sniffing.",
  },
  {
    header: "permissions-policy",
    severity: "MEDIUM",
    action: "Add Permissions-Policy header to control browser feature access (camera, mic, geolocation).",
  },
  {
    header: "referrer-policy",
    severity: "MEDIUM",
    action: "Set Referrer-Policy to strict-origin-when-cross-origin or no-referrer.",
  },
];

export function checkSecurityHeaders(headers: Headers): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const { header, severity, action } of REQUIRED_HEADERS) {
    if (!headers.get(header)) {
      findings.push({
        code: `MISSING_HEADER_${header.toUpperCase().replace(/-/g, "_")}`,
        title: `Missing security header: ${header}`,
        description: `The ${header} header is absent from the response. ${action}`,
        severity,
        fixPrompt: buildFixPrompt(
          `Missing ${header} header`,
          `Add the following to your Next.js config (next.config.ts):\n\nheaders() {\n  return [{ source: "/(.*)", headers: [{ key: "${header}", value: "<appropriate-value>" }] }];\n}\n\nOr add it in middleware.ts for all responses.`,
        ),
      });
    }
  }

  // Check for overly permissive CORS
  const acao = headers.get("access-control-allow-origin");
  if (acao === "*") {
    findings.push({
      code: "PERMISSIVE_CORS",
      title: "Overly permissive CORS: Access-Control-Allow-Origin is *",
      description:
        "Any origin can make authenticated requests to this app. Restrict to specific trusted origins.",
      severity: "HIGH",
      fixPrompt: buildFixPrompt(
        "Open CORS policy (Access-Control-Allow-Origin: *)",
        "Replace wildcard CORS with an allowlist of specific trusted origins. In Next.js, configure CORS in middleware.ts or API route handlers.",
      ),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 3. Client-side auth bypass patterns
// ────────────────────────────────────────────

const AUTH_BYPASS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /localStorage\.(getItem|setItem)\(['"](?:isAdmin|isAuthenticated|is_admin|role|user_role)['"]/, 
    description: "Auth/role state stored in localStorage and used for access control decisions.",
  },
  {
    pattern: /sessionStorage\.(getItem|setItem)\(['"](?:isAdmin|isAuthenticated|is_admin|role|user_role)['"]/, 
    description: "Auth/role state stored in sessionStorage and used for access control decisions.",
  },
  {
    pattern: /if\s*\(\s*(?:user|currentUser|auth)\.(?:role|isAdmin|is_admin)\s*(?:===?|!==?)\s*['"]admin['"]/,
    description: "Client-side admin role check — authorization decisions should be server-enforced.",
  },
  {
    pattern: /document\.cookie\.(?:includes|indexOf|match)\(['"](?:admin|role|auth_token)['"]/,
    description: "Cookie-based auth check in client code — validate on server instead.",
  },
];

export function checkClientSideAuthBypass(html: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const { pattern, description } of AUTH_BYPASS_PATTERNS) {
    if (pattern.test(html)) {
      findings.push({
        code: "CLIENT_SIDE_AUTH_BYPASS",
        title: "Client-side authorization pattern detected",
        description,
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          "Client-side auth bypass risk",
          "1. Move all authorization checks to server-side middleware or API route handlers.\n2. Use signed, httpOnly cookies or JWTs validated server-side.\n3. Never trust client-side state (localStorage, sessionStorage, cookies read via JS) for access control.\n4. Add server-side middleware that validates the user session and role before returning protected data.",
        ),
      });
    }
  }

  return findings;
}

// ────────────────────────────────────────────
// 4. Inline script analysis
// ────────────────────────────────────────────

export function checkInlineScripts(html: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check for inline scripts with potential secrets
  const inlineScripts = Array.from(
    html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi),
  ).map((m) => m[1]);

  if (inlineScripts.length > 0) {
    const inlineKeyFindings = scanJavaScriptForKeys(inlineScripts);
    findings.push(...inlineKeyFindings);
  }

  // Check for dangerouslySetInnerHTML patterns (React-specific XSS risk)
  if (/dangerouslySetInnerHTML/i.test(html)) {
    findings.push({
      code: "DANGEROUS_INNER_HTML",
      title: "dangerouslySetInnerHTML usage detected",
      description:
        "Usage of dangerouslySetInnerHTML can lead to XSS if the content isn't sanitized server-side.",
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt(
        "dangerouslySetInnerHTML XSS risk",
        "1. Sanitize all HTML content server-side using a library like DOMPurify or sanitize-html.\n2. If possible, replace dangerouslySetInnerHTML with safe React rendering.\n3. Ensure a strict Content-Security-Policy is in place.",
      ),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 5. Meta and configuration checks
// ────────────────────────────────────────────

export function checkMetaAndConfig(html: string, headers: Headers): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check for source maps exposed in production
  if (/\/\/# sourceMappingURL=/.test(html)) {
    findings.push({
      code: "SOURCE_MAP_EXPOSED",
      title: "Source maps exposed in production",
      description:
        "Source maps are accessible in production, which exposes original source code to anyone inspecting the page.",
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt(
        "Source maps exposed in production",
        "1. Set `productionBrowserSourceMaps: false` in next.config.ts (Next.js default).\n2. Remove sourceMappingURL comments from production builds.\n3. If source maps are needed for error tracking, use hidden source maps uploaded to your error tracking service.",
      ),
    });
  }

  // Check for debug/development indicators
  if (
    /React\.StrictMode|__NEXT_DATA__.*\"isDevServer\":true|NODE_ENV.*development/i.test(html)
  ) {
    findings.push({
      code: "DEV_MODE_INDICATORS",
      title: "Development mode indicators detected",
      description:
        "The page contains markers suggesting it may be running in development mode, which exposes additional debug information.",
      severity: "LOW",
      fixPrompt: buildFixPrompt(
        "Development mode indicators in production",
        "1. Ensure NODE_ENV=production in your deployment.\n2. Run `next build` followed by `next start` for production.\n3. Verify no development-only environment variables leak to the client.",
      ),
    });
  }

  // Check for server info disclosure
  const server = headers.get("server");
  const powered = headers.get("x-powered-by");
  if (server || powered) {
    findings.push({
      code: "SERVER_INFO_DISCLOSURE",
      title: "Server technology disclosed in headers",
      description: `Server information exposed: ${[server && `Server: ${server}`, powered && `X-Powered-By: ${powered}`].filter(Boolean).join(", ")}. This helps attackers fingerprint your stack.`,
      severity: "LOW",
      fixPrompt: buildFixPrompt(
        "Server information disclosure",
        "1. Remove or mask the Server and X-Powered-By headers.\n2. In Next.js, add `poweredByHeader: false` to next.config.ts.\n3. Configure your hosting platform to suppress the Server header.",
      ),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 6. Open Redirect Detection
// ────────────────────────────────────────────

const REDIRECT_PARAMS = ["url", "redirect", "next", "return", "returnTo", "redirect_uri", "continue", "dest", "destination", "rurl", "target"];

export function checkOpenRedirects(html: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  for (const param of REDIRECT_PARAMS) {
    const pattern = new RegExp(`[?&]${param}=https?(%3A|:)(%2F|/){2}`, "gi");
    if (pattern.test(html)) {
      if (seen.has(param)) continue;
      seen.add(param);
      findings.push({
        code: "OPEN_REDIRECT",
        title: `Potential open redirect via "${param}" parameter`,
        description: `Found a redirect parameter "${param}" that accepts an external URL. Attackers can use this for phishing.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt(
          `Open redirect via ${param} parameter`,
          "1. Validate redirect URLs against an allowlist of trusted domains.\n2. Use relative paths instead of absolute URLs for redirects.\n3. Implement a server-side redirect validation middleware.",
        ),
      });
    }
  }

  if (/window\.location\s*=\s*(?:params|query|searchParams|req\.query)/.test(html) ||
      /location\.(?:href|assign|replace)\s*\(\s*(?:params|query|searchParams|req\.query)/.test(html)) {
    findings.push({
      code: "OPEN_REDIRECT_JS",
      title: "JavaScript-based open redirect detected",
      description: "User-controlled input is used directly in a location redirect without validation.",
      severity: "HIGH",
      fixPrompt: buildFixPrompt(
        "JavaScript open redirect",
        "1. Never assign user input directly to window.location.\n2. Validate the URL against a whitelist of allowed domains.\n3. Use relative paths or a server-side redirect endpoint.",
      ),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 7. Cookie Security
// ────────────────────────────────────────────

export function checkCookieSecurity(headers: Headers): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const setCookieHeader = headers.get("set-cookie");
  if (!setCookieHeader) return findings;

  const cookies = setCookieHeader.split(/,(?=\s*\w+=)/);
  for (const cookie of cookies) {
    const cookieName = cookie.trim().split("=")[0];
    const lower = cookie.toLowerCase();

    if (!lower.includes("secure")) {
      findings.push({
        code: "COOKIE_MISSING_SECURE",
        title: `Cookie "${cookieName}" missing Secure flag`,
        description: `The "${cookieName}" cookie is not marked Secure, meaning it can be sent over unencrypted HTTP connections.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt("Cookie missing Secure flag", "Add the Secure attribute to all cookies to ensure they are only sent over HTTPS."),
      });
    }

    if (!lower.includes("httponly")) {
      findings.push({
        code: "COOKIE_MISSING_HTTPONLY",
        title: `Cookie "${cookieName}" missing HttpOnly flag`,
        description: `The "${cookieName}" cookie is not marked HttpOnly, making it accessible to JavaScript and vulnerable to XSS theft.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt("Cookie missing HttpOnly flag", "Add the HttpOnly attribute to prevent JavaScript access to the cookie."),
      });
    }

    if (!lower.includes("samesite")) {
      findings.push({
        code: "COOKIE_MISSING_SAMESITE",
        title: `Cookie "${cookieName}" missing SameSite flag`,
        description: `The "${cookieName}" cookie lacks a SameSite attribute, potentially allowing CSRF attacks.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt("Cookie missing SameSite flag", "Add SameSite=Strict or SameSite=Lax to protect against CSRF."),
      });
    }
  }

  return findings;
}

// ────────────────────────────────────────────
// 8. CORS Misconfiguration (deep check)
// ────────────────────────────────────────────

export function checkCORSMisconfiguration(headers: Headers): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const origin = headers.get("access-control-allow-origin");
  const credentials = headers.get("access-control-allow-credentials");

  if (origin === "*" && credentials?.toLowerCase() === "true") {
    findings.push({
      code: "CORS_WILDCARD_CREDENTIALS",
      title: "CORS: wildcard origin with credentials allowed",
      description: "Access-Control-Allow-Origin is * while Access-Control-Allow-Credentials is true. This is a critical misconfiguration.",
      severity: "CRITICAL",
      fixPrompt: buildFixPrompt("CORS wildcard with credentials", "Never combine Access-Control-Allow-Origin: * with Access-Control-Allow-Credentials: true. Use a specific origin allowlist."),
    });
  }

  if (origin?.toLowerCase() === "null") {
    findings.push({
      code: "CORS_NULL_ORIGIN",
      title: "CORS: null origin allowed",
      description: "Access-Control-Allow-Origin is set to 'null'. This can be exploited via sandboxed iframes and data: URIs.",
      severity: "HIGH",
      fixPrompt: buildFixPrompt("CORS null origin", "Never allow 'null' as a CORS origin. Use specific trusted origins instead."),
    });
  }

  const methods = headers.get("access-control-allow-methods");
  if (methods && /\*/.test(methods)) {
    findings.push({
      code: "CORS_WILDCARD_METHODS",
      title: "CORS: wildcard methods allowed",
      description: "Access-Control-Allow-Methods contains a wildcard, allowing any HTTP method.",
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt("CORS wildcard methods", "Restrict allowed methods to only those needed (e.g., GET, POST)."),
    });
  }

  const allowHeaders = headers.get("access-control-allow-headers");
  if (allowHeaders && /\*/.test(allowHeaders)) {
    findings.push({
      code: "CORS_WILDCARD_HEADERS",
      title: "CORS: wildcard headers allowed",
      description: "Access-Control-Allow-Headers contains a wildcard, allowing any custom header.",
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt("CORS wildcard headers", "Restrict allowed headers to only those needed."),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 9. Information Disclosure
// ────────────────────────────────────────────

const DEBUG_PAGE_PATTERNS = [
  /\/__debug/i,
  /\/phpinfo/i,
  /\/elmah\.axd/i,
  /\/server-status/i,
  /\/server-info/i,
];

export function checkInformationDisclosure(html: string, headers: Headers): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (/at\s+\S+\s+\([\w/.\\]+:\d+:\d+\)/m.test(html) ||
      /Traceback \(most recent call last\)/i.test(html) ||
      /Exception in thread/i.test(html)) {
    findings.push({
      code: "STACK_TRACE_EXPOSED",
      title: "Stack trace exposed in response",
      description: "The response contains a stack trace, revealing internal code paths and line numbers.",
      severity: "HIGH",
      fixPrompt: buildFixPrompt("Stack trace exposure", "1. Implement custom error pages for production.\n2. Set NODE_ENV=production.\n3. Never return raw error objects to clients."),
    });
  }

  for (const pattern of DEBUG_PAGE_PATTERNS) {
    if (pattern.test(html)) {
      findings.push({
        code: "DEBUG_PAGE_EXPOSED",
        title: "Debug/admin page reference detected",
        description: `Found a reference to a debug or admin page (${pattern.source}) in the response.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt("Debug page exposed", "Remove debug page references from production. Restrict access with authentication."),
      });
      break;
    }
  }

  const versionHeaders = ["x-aspnet-version", "x-aspnetmvc-version", "x-runtime", "x-version"];
  for (const h of versionHeaders) {
    const val = headers.get(h);
    if (val) {
      findings.push({
        code: "VERSION_HEADER_DISCLOSURE",
        title: `Version information disclosed via ${h} header`,
        description: `The ${h} header reveals: ${val}. This helps attackers identify vulnerable software versions.`,
        severity: "LOW",
        fixPrompt: buildFixPrompt("Version header disclosure", `Remove the ${h} header from responses.`),
      });
    }
  }

  return findings;
}

// ────────────────────────────────────────────
// 10. SSL/TLS Issues
// ────────────────────────────────────────────

export function checkSSLIssues(html: string, headers: Headers, url?: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const mixedContentPattern = /(?:src|href|action)\s*=\s*["']http:\/\/(?!localhost)/gi;
  if (mixedContentPattern.test(html)) {
    findings.push({
      code: "MIXED_CONTENT",
      title: "Mixed content detected",
      description: "The page loads resources over insecure HTTP while served over HTTPS, undermining TLS protection.",
      severity: "HIGH",
      fixPrompt: buildFixPrompt("Mixed content", "1. Update all resource URLs to use HTTPS.\n2. Use protocol-relative URLs or relative paths.\n3. Add Content-Security-Policy: upgrade-insecure-requests."),
    });
  }

  const hsts = headers.get("strict-transport-security");
  if (hsts) {
    if (!hsts.includes("includeSubDomains")) {
      findings.push({
        code: "HSTS_NO_SUBDOMAINS",
        title: "HSTS missing includeSubDomains directive",
        description: "Strict-Transport-Security does not include subdomains, leaving them vulnerable to downgrade attacks.",
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt("HSTS missing includeSubDomains", "Add includeSubDomains to your HSTS header."),
      });
    }
    if (!hsts.includes("preload")) {
      findings.push({
        code: "HSTS_NO_PRELOAD",
        title: "HSTS missing preload directive",
        description: "Without the preload directive, the site cannot be submitted to the HSTS preload list.",
        severity: "LOW",
        fixPrompt: buildFixPrompt("HSTS missing preload", "Add preload to your HSTS header and submit to hstspreload.org."),
      });
    }
  }

  if (url && url.startsWith("http://") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    findings.push({
      code: "NO_HTTPS",
      title: "Site not using HTTPS",
      description: "The site is served over plain HTTP without TLS encryption.",
      severity: "CRITICAL",
      fixPrompt: buildFixPrompt("No HTTPS", "1. Obtain a TLS certificate (e.g., Let's Encrypt).\n2. Configure your server to use HTTPS.\n3. Redirect all HTTP traffic to HTTPS."),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 11. Dependency Exposure
// ────────────────────────────────────────────

const DEPENDENCY_FILES = [
  "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "composer.json", "composer.lock", "Gemfile", "Gemfile.lock",
  "requirements.txt", ".env", ".env.local", ".env.production",
];

export function checkDependencyExposure(html: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  for (const file of DEPENDENCY_FILES) {
    const escaped = file.replace(/\./g, "\\.");
    const pattern = new RegExp(`(?:href|src)=["']/?${escaped}["']`, "gi");
    if (pattern.test(html)) {
      if (seen.has(file)) continue;
      seen.add(file);
      findings.push({
        code: "DEPENDENCY_FILE_EXPOSED",
        title: `Dependency file "${file}" is linked in the page`,
        description: `The file "${file}" appears to be publicly accessible, exposing dependency versions and potential vulnerabilities.`,
        severity: file.startsWith(".env") ? "CRITICAL" : "HIGH",
        fixPrompt: buildFixPrompt(`Exposed ${file}`, `Block public access to ${file} via server configuration.`),
      });
    }
  }

  if (/(?:href|src)=["'][^"']*node_modules/gi.test(html)) {
    findings.push({
      code: "NODE_MODULES_EXPOSED",
      title: "node_modules directory appears accessible",
      description: "References to node_modules found in the page, suggesting the directory may be publicly served.",
      severity: "HIGH",
      fixPrompt: buildFixPrompt("Exposed node_modules", "Never serve node_modules publicly. Use a bundler to package dependencies."),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 12. API Security
// ────────────────────────────────────────────

export function checkAPISecurity(html: string, headers: Headers): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const rateLimitHeaders = ["x-ratelimit-limit", "x-rate-limit-limit", "ratelimit-limit", "retry-after"];
  const hasRateLimit = rateLimitHeaders.some((h) => headers.get(h));
  if (!hasRateLimit) {
    findings.push({
      code: "NO_RATE_LIMITING",
      title: "No rate limiting headers detected",
      description: "The response lacks rate limiting headers, suggesting API endpoints may not be rate-limited.",
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt("Missing rate limiting", "Implement rate limiting on all API endpoints using middleware."),
    });
  }

  if (/__schema|IntrospectionQuery|introspection/i.test(html) ||
      /graphql.*playground|graphiql|altair/i.test(html)) {
    findings.push({
      code: "GRAPHQL_INTROSPECTION_EXPOSED",
      title: "GraphQL introspection or playground exposed",
      description: "GraphQL introspection or a playground interface appears enabled in production, exposing the entire API schema.",
      severity: "HIGH",
      fixPrompt: buildFixPrompt("GraphQL introspection exposed", "Disable introspection in production and remove GraphQL playground."),
    });
  }

  if (/swagger-ui|openapi|api-docs|\/swagger\b/i.test(html)) {
    findings.push({
      code: "API_DOCS_EXPOSED",
      title: "API documentation publicly accessible",
      description: "Swagger/OpenAPI documentation appears publicly accessible, revealing API endpoints and data models.",
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt("API docs exposed", "Protect API documentation with authentication or remove from production."),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 13. SSL Certificate Expiry
// ────────────────────────────────────────────

export async function checkSSLCertExpiry(url: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return findings;
  }

  // Only check HTTPS URLs
  if (!url.startsWith("https://")) return findings;

  try {
    const cert = await new Promise<tls.PeerCertificate | null>((resolve) => {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false },
        () => {
          const peerCert = socket.getPeerCertificate();
          socket.destroy();
          resolve(peerCert ?? null);
        },
      );
      socket.on("error", () => resolve(null));
      socket.setTimeout(10000, () => {
        socket.destroy();
        resolve(null);
      });
    });

    if (!cert || !cert.valid_to) return findings;

    const expiresAt = new Date(cert.valid_to);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      findings.push({
        code: "SSL_CERT_EXPIRED",
        title: "SSL certificate has expired",
        description: `The SSL certificate for ${hostname} expired ${Math.abs(daysUntilExpiry)} day(s) ago. Users see security warnings and browsers block access.`,
        severity: "CRITICAL",
        fixPrompt: buildFixPrompt(
          "SSL certificate expired",
          "1. Renew your TLS certificate immediately.\n2. If using Let's Encrypt, run: certbot renew.\n3. Verify auto-renewal is configured and working.\n4. Check your hosting platform for certificate management tools.",
        ),
      });
    } else if (daysUntilExpiry <= 7) {
      findings.push({
        code: "SSL_CERT_EXPIRING_CRITICAL",
        title: `SSL certificate expires in ${daysUntilExpiry} day(s)`,
        description: `The SSL certificate for ${hostname} expires in ${daysUntilExpiry} day(s). Renew immediately to prevent outages.`,
        severity: "CRITICAL",
        fixPrompt: buildFixPrompt(
          "SSL certificate expiring soon",
          "1. Renew your TLS certificate now.\n2. If using Let's Encrypt, run: certbot renew.\n3. Enable auto-renewal to prevent future expiry.",
        ),
      });
    } else if (daysUntilExpiry <= 14) {
      findings.push({
        code: "SSL_CERT_EXPIRING_HIGH",
        title: `SSL certificate expires in ${daysUntilExpiry} days`,
        description: `The SSL certificate for ${hostname} expires in ${daysUntilExpiry} days. Schedule renewal this week.`,
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          "SSL certificate expiring soon",
          "1. Renew your TLS certificate this week.\n2. Verify auto-renewal is configured.\n3. Test renewal with: certbot renew --dry-run.",
        ),
      });
    } else if (daysUntilExpiry <= 30) {
      findings.push({
        code: "SSL_CERT_EXPIRING_MEDIUM",
        title: `SSL certificate expires in ${daysUntilExpiry} days`,
        description: `The SSL certificate for ${hostname} expires in ${daysUntilExpiry} days. Plan renewal soon.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt(
          "SSL certificate expiring",
          "1. Schedule certificate renewal before expiry.\n2. Verify auto-renewal is configured and working.",
        ),
      });
    }
  } catch {
    // Cannot connect or read cert — skip silently
  }

  return findings;
}

// ────────────────────────────────────────────
// 14. Uptime Status
// ────────────────────────────────────────────

export function checkUptimeStatus(statusCode: number, responseTimeMs: number): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (statusCode >= 500) {
    findings.push({
      code: "UPTIME_SERVER_ERROR",
      title: `Site returned server error (HTTP ${statusCode})`,
      description: `The site responded with HTTP ${statusCode}, indicating a server-side failure. Users are likely seeing an error page.`,
      severity: "CRITICAL",
      fixPrompt: buildFixPrompt(
        `Server error HTTP ${statusCode}`,
        "1. Check your server logs for the root cause.\n2. Verify your deployment is healthy.\n3. Check database connections and dependent services.\n4. Roll back the last deployment if the error started recently.",
      ),
    });
  } else if (statusCode >= 400 && statusCode !== 401 && statusCode !== 403) {
    findings.push({
      code: "UPTIME_CLIENT_ERROR",
      title: `Site returned client error (HTTP ${statusCode})`,
      description: `The site responded with HTTP ${statusCode}. This suggests a misconfigured URL, missing resource, or routing issue.`,
      severity: "HIGH",
      fixPrompt: buildFixPrompt(
        `Client error HTTP ${statusCode}`,
        "1. Verify the monitored URL is correct.\n2. Check for broken routes or missing pages in your deployment.\n3. Review your redirect configuration.",
      ),
    });
  }

  if (responseTimeMs > 10000) {
    findings.push({
      code: "UPTIME_VERY_SLOW",
      title: `Response time exceeds 10s (${responseTimeMs}ms)`,
      description: `The site took ${responseTimeMs}ms to respond. Users experience severe latency and search rankings drop.`,
      severity: "HIGH",
      fixPrompt: buildFixPrompt(
        "Very slow response time",
        "1. Profile your server for slow database queries or blocking operations.\n2. Add caching at the edge or application layer.\n3. Check if your hosting region matches your user base.\n4. Review recent deployments for performance regressions.",
      ),
    });
  } else if (responseTimeMs > 5000) {
    findings.push({
      code: "UPTIME_SLOW",
      title: `Slow response time (${responseTimeMs}ms)`,
      description: `The site took ${responseTimeMs}ms to respond. Google recommends under 200ms for Time to First Byte.`,
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt(
        "Slow response time",
        "1. Investigate slow database queries or API calls.\n2. Enable caching for static and dynamic content.\n3. Consider a CDN for static assets.\n4. Profile server-side rendering performance.",
      ),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 15. Third-party script risk scoring
// ────────────────────────────────────────────

const COMPROMISED_CDNS = [
  "eval.js",
  "cdn.polyfill.io",
  "polyfill.io",
  "bootcss.com",
  "staticfile.org",
  "cdnjson.com",
];

export function checkThirdPartyScripts(html: string, baseUrl: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  let baseDomain: string;
  try {
    baseDomain = new URL(baseUrl).hostname;
  } catch {
    return findings;
  }

  const scriptSrcs = Array.from(html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)).map(
    (m) => m[1],
  );

  const externalDomains = new Set<string>();

  for (const src of scriptSrcs) {
    // Flag data: URI scripts
    if (src.startsWith("data:")) {
      findings.push({
        code: "THIRD_PARTY_SCRIPT_DATA_URI",
        title: "Inline data: URI script detected",
        description:
          "A script tag uses a data: URI as its source. This bypasses Content Security Policy and can execute arbitrary code.",
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          "Inline data: URI script",
          "Remove data: URI scripts. Host scripts as static files and reference them by URL. Review CSP to block data: script sources.",
        ),
      });
      continue;
    }

    // Only analyse absolute URLs
    if (!src.startsWith("http://") && !src.startsWith("https://")) continue;

    let srcHostname: string;
    try {
      srcHostname = new URL(src).hostname;
    } catch {
      continue;
    }

    // Skip same-domain scripts
    if (srcHostname === baseDomain) continue;

    externalDomains.add(srcHostname);

    // HTTP (not HTTPS) third-party script
    if (src.startsWith("http://")) {
      findings.push({
        code: "THIRD_PARTY_SCRIPT_HTTP",
        title: "Third-party script loaded over HTTP",
        description: `The script at "${src}" loads over unencrypted HTTP. Attackers on the network can replace it with malicious code.`,
        severity: "CRITICAL",
        fixPrompt: buildFixPrompt(
          "Third-party script loaded over HTTP",
          "Switch the script URL to HTTPS. If the CDN does not support HTTPS, find a secure alternative.",
        ),
      });
    }

    // Known compromised CDN
    const isCompromised = COMPROMISED_CDNS.some(
      (bad) => srcHostname === bad || srcHostname.endsWith(`.${bad}`),
    );
    if (isCompromised) {
      findings.push({
        code: "THIRD_PARTY_SCRIPT_COMPROMISED_CDN",
        title: `Third-party script from known compromised CDN: ${srcHostname}`,
        description: `The script domain "${srcHostname}" is a known compromised or malicious CDN. Remove or replace this dependency immediately.`,
        severity: "CRITICAL",
        fixPrompt: buildFixPrompt(
          `Third-party script from compromised CDN: ${srcHostname}`,
          "Remove the script tag referencing this CDN. Host the library yourself via npm or a trusted CDN such as unpkg or cdnjs.",
        ),
      });
    }
  }

  // High number of external script domains
  if (externalDomains.size > 10) {
    findings.push({
      code: "THIRD_PARTY_SCRIPT_HIGH_COUNT",
      title: `High number of third-party script domains (${externalDomains.size}). Each is a potential supply chain risk.`,
      description: `This page loads scripts from ${externalDomains.size} distinct external domains. Each domain is an attack surface for supply chain compromise.`,
      severity: "MEDIUM",
      fixPrompt: buildFixPrompt(
        "High number of third-party script domains",
        "Audit all external scripts and remove unnecessary ones. Consider self-hosting critical dependencies.",
      ),
    });
  }

  return findings;
}

// ────────────────────────────────────────────
// 16. Form security analysis
// ────────────────────────────────────────────

const CSRF_TOKEN_NAMES = [
  "csrf",
  "_token",
  "authenticity_token",
  "__RequestVerificationToken",
  "nonce",
];

const API_ENDPOINT_PATTERN = /^\/?api[/\\]/i;

export function checkFormSecurity(html: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const formMatches = Array.from(html.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/gi));

  for (const [, attrs, body] of formMatches) {
    const methodMatch = /\bmethod=["']([^"']+)["']/i.exec(attrs);
    const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";

    const actionMatch = /\baction=["']([^"']+)["']/i.exec(attrs);
    const action = actionMatch ? actionMatch[1] : "";

    // GET method with API action
    if (method === "GET" && API_ENDPOINT_PATTERN.test(action)) {
      findings.push({
        code: "FORM_GET_API_ENDPOINT",
        title: "Form uses GET method for data submission",
        description: `A form with action "${action}" uses the GET method. Form data appears in the URL, which may expose it in logs and browser history.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt(
          "Form uses GET method for API endpoint",
          "Change the form method to POST. GET parameters appear in URLs and server logs, leaking user data.",
        ),
      });
    }

    // Password field without CSRF token
    const hasPasswordInput = /<input[^>]*\btype=["']password["'][^>]*>/i.test(body);
    if (hasPasswordInput) {
      const hasCsrfToken = CSRF_TOKEN_NAMES.some((name) => {
        const pattern = new RegExp(
          `<input[^>]*type=["']hidden["'][^>]*name=["'][^"']*${name}[^"']*["']`,
          "i",
        );
        return pattern.test(body);
      });

      if (!hasCsrfToken) {
        findings.push({
          code: "FORM_PASSWORD_NO_CSRF",
          title: "Form with password field missing CSRF token",
          description:
            "A form containing a password input has no detectable CSRF token. Without CSRF protection, attackers can trick users into submitting credentials to your app.",
          severity: "HIGH",
          fixPrompt: buildFixPrompt(
            "Password form missing CSRF token",
            "Add a hidden CSRF token input to all forms with sensitive fields. Validate the token server-side on every POST request.",
          ),
        });
      }
    }

    // External form action
    if (action.startsWith("http://") || action.startsWith("https://")) {
      let actionDomain: string;
      try {
        actionDomain = new URL(action).hostname;
      } catch {
        continue;
      }

      findings.push({
        code: "FORM_EXTERNAL_ACTION",
        title: `Form submits to external domain: ${actionDomain}`,
        description: `A form's action attribute points to "${action}", an external domain. This may send user data to a third party.`,
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          `Form submits to external domain: ${actionDomain}`,
          "Verify this external submission is intentional. If not, change the action to an internal endpoint. If it is a payment form, ensure the third party is PCI-compliant.",
        ),
      });
    }
  }

  return findings;
}

// ────────────────────────────────────────────
// 17. Broken link and redirect chain detection
// ────────────────────────────────────────────

async function followRedirects(
  url: string,
  maxHops: number,
  timeoutMs: number,
): Promise<{ finalStatus: number; hops: number }> {
  let current = url;
  let hops = 0;
  let finalStatus = 0;

  while (hops <= maxHops) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { finalStatus: 0, hops };
    }

    finalStatus = res.status;

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      current = location.startsWith("http") ? location : new URL(location, current).toString();
      hops++;
    } else {
      break;
    }
  }

  return { finalStatus, hops };
}

export async function checkBrokenLinks(
  html: string,
  baseUrl: string,
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    return findings;
  }

  const hrefs = Array.from(html.matchAll(/href=["']([^"'#?]+)["']/gi)).map((m) => m[1]);

  const internalLinks: string[] = [];
  for (const href of hrefs) {
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    if (href.startsWith("http://") || href.startsWith("https://")) {
      // External — skip
      try {
        const linkOrigin = new URL(href).origin;
        if (linkOrigin !== baseOrigin) continue;
        internalLinks.push(href);
      } catch {
        continue;
      }
    } else {
      // Relative link
      try {
        internalLinks.push(new URL(href, baseUrl).toString());
      } catch {
        continue;
      }
    }
    if (internalLinks.length >= 10) break;
  }

  const results = await Promise.allSettled(
    internalLinks.map((url) => followRedirects(url, 5, 8000)),
  );

  for (let i = 0; i < internalLinks.length; i++) {
    const settled = results[i];
    if (settled.status !== "fulfilled") continue;
    const { finalStatus, hops } = settled.value;

    if (finalStatus >= 400) {
      findings.push({
        code: "BROKEN_INTERNAL_LINK",
        title: `Broken internal link: ${internalLinks[i]} returned HTTP ${finalStatus}`,
        description: `The internal link "${internalLinks[i]}" returns HTTP ${finalStatus}. Users clicking this link see an error page.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt(
          `Broken internal link (HTTP ${finalStatus})`,
          `Fix or remove the link "${internalLinks[i]}". Check for routing changes in recent deployments.`,
        ),
      });
    } else if (hops > 3) {
      findings.push({
        code: "LONG_REDIRECT_CHAIN",
        title: `Long redirect chain on internal link: ${internalLinks[i]}`,
        description: `The internal link "${internalLinks[i]}" follows ${hops} redirects before reaching the final page. Long redirect chains slow page loads.`,
        severity: "LOW",
        fixPrompt: buildFixPrompt(
          "Long redirect chain on internal link",
          `Update the link "${internalLinks[i]}" to point directly to the final destination URL.`,
        ),
      });
    }
  }

  return findings;
}

// ────────────────────────────────────────────
// 18. Performance baseline and regression alerting
// ────────────────────────────────────────────

export async function checkPerformanceRegression(
  appId: string,
  currentResponseTimeMs: number,
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    const recentRuns = await db.monitorRun.findMany({
      where: { appId },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: { responseTimeMs: true },
    });

    const validTimes = recentRuns
      .map((r) => r.responseTimeMs)
      .filter((t): t is number => t !== null && t > 0);

    if (validTimes.length === 0) return findings;

    const avg = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;

    if (currentResponseTimeMs > avg * 2 && avg > 500) {
      findings.push({
        code: "PERF_REGRESSION_DOUBLED",
        title: `Response time doubled vs recent average (current: ${currentResponseTimeMs}ms, avg: ${Math.round(avg)}ms)`,
        description: `Response time is ${currentResponseTimeMs}ms, more than double the recent average of ${Math.round(avg)}ms. This signals a performance regression or infrastructure issue.`,
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          "Response time regression (doubled)",
          "Profile the app for slow database queries, memory leaks, or recent deployment changes. Check hosting infrastructure health.",
        ),
      });
    } else if (currentResponseTimeMs > avg * 1.5 && avg > 1000) {
      findings.push({
        code: "PERF_REGRESSION_ELEVATED",
        title: `Response time 50% above recent average (current: ${currentResponseTimeMs}ms, avg: ${Math.round(avg)}ms)`,
        description: `Response time is ${currentResponseTimeMs}ms, 50% above the recent average of ${Math.round(avg)}ms.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt(
          "Response time elevated vs baseline",
          "Review recent deployments and server metrics. Add caching or optimize slow queries.",
        ),
      });
    }
  } catch {
    // Database unavailable — skip silently
  }

  return findings;
}

// ────────────────────────────────────────────
// 19. API endpoint fuzzing
// ────────────────────────────────────────────

const SENSITIVE_CONTENT_PATTERNS = [
  /password/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /api_key/i,
  /AWS_/,
  /DATABASE_URL/i,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const SENSITIVE_FILE_PATHS = ["/.env", "/.env.local", "/.env.production", "/.git/HEAD", "/phpinfo.php"];
const ADMIN_DEBUG_PATHS = ["/api/admin", "/api/debug"];

const PROBE_PATHS = [
  "/.env",
  "/.env.local",
  "/.env.production",
  "/config.json",
  "/settings.json",
  "/api/admin",
  "/api/debug",
  "/api/config",
  "/api/users",
  "/api/keys",
  "/phpinfo.php",
  "/server-status",
  "/actuator",
  "/actuator/health",
  "/actuator/env",
  "/graphql",
  "/.git/HEAD",
  "/robots.txt",
].slice(0, 15);

function looksLikeJson(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function containsSensitiveData(body: string): boolean {
  return SENSITIVE_CONTENT_PATTERNS.some((p) => p.test(body));
}

export async function checkExposedEndpoints(baseUrl: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return findings;
  }

  const results = await Promise.allSettled(
    PROBE_PATHS.map(async (path) => {
      const url = `${origin}${path}`;
      // Use ssrfSafeFetch so every redirect hop is validated against the
      // SSRF guard — prevents a probe path redirecting to 169.254.169.254.
      const res = await ssrfSafeFetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const body = res.status === 200 ? await res.text() : "";
      return { path, url, status: res.status, body };
    }),
  );

  for (const settled of results) {
    if (settled.status !== "fulfilled") continue;
    const { path, url, status, body } = settled.value;

    if (status !== 200) continue;

    // Sensitive file publicly accessible
    if (SENSITIVE_FILE_PATHS.includes(path)) {
      findings.push({
        code: "SENSITIVE_FILE_EXPOSED",
        title: `Sensitive file publicly accessible: ${path}`,
        description: `The file "${path}" returned HTTP 200 and is publicly accessible. This file may contain secrets or internal configuration.`,
        severity: "CRITICAL",
        fixPrompt: buildFixPrompt(
          `Sensitive file exposed: ${path}`,
          `Block public access to "${path}" in your web server or CDN configuration. Never deploy environment files to publicly accessible directories.`,
        ),
      });
      continue;
    }

    // Admin/debug endpoint accessible
    if (ADMIN_DEBUG_PATHS.includes(path) && looksLikeJson(body)) {
      findings.push({
        code: "ADMIN_DEBUG_ENDPOINT_EXPOSED",
        title: `Admin/debug endpoint accessible without authentication: ${path}`,
        description: `The endpoint "${url}" is publicly accessible and returns JSON data. This may expose sensitive application internals.`,
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          `Admin/debug endpoint accessible: ${path}`,
          "Add authentication middleware to all admin and debug endpoints. Remove debug endpoints in production environments.",
        ),
      });
      continue;
    }

    // robots.txt: look for sensitive disallow paths
    if (path === "/robots.txt") {
      const disallowMatches = Array.from(body.matchAll(/^Disallow:\s*(.+)$/gm)).map((m) =>
        m[1].trim(),
      );
      const sensitivePaths = disallowMatches.filter((p) =>
        /admin|api|internal|private|secret|config/i.test(p),
      );
      if (sensitivePaths.length > 0) {
        findings.push({
          code: "ROBOTS_TXT_REVEALS_PATHS",
          title: `robots.txt reveals internal paths: ${sensitivePaths.join(", ")}`,
          description: `The robots.txt file disallows paths that suggest internal or sensitive routes: ${sensitivePaths.join(", ")}. Attackers use robots.txt to map attack surfaces.`,
          severity: "LOW",
          fixPrompt: buildFixPrompt(
            "robots.txt reveals internal paths",
            "Remove sensitive path references from robots.txt. Use authentication to protect internal routes instead of relying on robots.txt.",
          ),
        });
      }
      continue;
    }

    // Sensitive data in response body
    if (containsSensitiveData(body)) {
      findings.push({
        code: "SENSITIVE_DATA_EXPOSED",
        title: `Sensitive data exposed at ${path}`,
        description: `The endpoint "${url}" returned HTTP 200 and the response body contains patterns matching secrets or credentials.`,
        severity: "CRITICAL",
        fixPrompt: buildFixPrompt(
          `Sensitive data exposed at ${path}`,
          "Immediately restrict access to this endpoint. Rotate any exposed credentials. Add authentication or remove the endpoint.",
        ),
      });
    }
  }

  return findings;
}

// ────────────────────────────────────────────
// 20. Dependency version risk
// ────────────────────────────────────────────

function parseVersion(vStr: string): { major: number; minor: number; patch: number } {
  const [major = 0, minor = 0, patch = 0] = vStr.split(".").map(Number);
  return { major, minor, patch };
}

function isJQueryOutdated(version: string): boolean {
  const { major, minor, patch } = parseVersion(version);
  if (major < 3) return true;
  if (major === 3 && minor < 5) return true;
  if (major === 3 && minor === 5 && patch < 0) return true;
  return false;
}

function isLodashOutdated(version: string): boolean {
  const { major, minor, patch } = parseVersion(version);
  if (major < 4) return true;
  if (major === 4 && minor < 17) return true;
  if (major === 4 && minor === 17 && patch < 21) return true;
  return false;
}

export function checkDependencyVersions(jsPayloads: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const detected = new Set<string>();

  const combined = jsPayloads.join("\n");

  // jQuery
  if (!detected.has("jquery")) {
    const m = /jquery[^"'\d\n]*v?([\d]+\.[\d]+\.[\d]+)/i.exec(combined);
    if (m) {
      detected.add("jquery");
      if (isJQueryOutdated(m[1])) {
        findings.push({
          code: "DEP_JQUERY_OUTDATED",
          title: `Outdated jQuery version detected (v${m[1]}). Known XSS vulnerabilities.`,
          description: `jQuery v${m[1]} is outdated and contains known XSS vulnerabilities. Upgrade to v3.5.0 or later.`,
          severity: "HIGH",
          fixPrompt: buildFixPrompt(
            `Outdated jQuery v${m[1]}`,
            "Upgrade jQuery to the latest v3.x release. Run: npm install jquery@latest",
          ),
        });
      }
    }
  }

  // React (flag major < 16)
  if (!detected.has("react")) {
    const m = /react[^"']{0,30}v?(1[0-5]\.\d+\.\d+)/i.exec(combined);
    if (m) {
      const { major } = parseVersion(m[1]);
      if (major < 16) {
        detected.add("react");
        findings.push({
          code: "DEP_REACT_OUTDATED",
          title: `Outdated React version detected (v${m[1]})`,
          description: `React v${m[1]} is outdated. Upgrade to v16 or later for security patches and lifecycle improvements.`,
          severity: "MEDIUM",
          fixPrompt: buildFixPrompt(
            `Outdated React v${m[1]}`,
            "Upgrade React to v18 or later. Run: npm install react@latest react-dom@latest",
          ),
        });
      }
    }
  }

  // Angular (flag major < 12)
  if (!detected.has("angular")) {
    const m = /angular[^"'\d\n]*v?(\d+\.\d+)/i.exec(combined);
    if (m) {
      const { major } = parseVersion(m[1]);
      if (major > 0 && major < 12) {
        detected.add("angular");
        findings.push({
          code: "DEP_ANGULAR_OUTDATED",
          title: `Outdated Angular version detected (v${m[1]})`,
          description: `Angular v${m[1]} is outdated and no longer supported. Upgrade to v12 or later.`,
          severity: "MEDIUM",
          fixPrompt: buildFixPrompt(
            `Outdated Angular v${m[1]}`,
            "Upgrade Angular to the latest supported major version using the Angular Update Guide: https://update.angular.io/",
          ),
        });
      }
    }
  }

  // Lodash
  if (!detected.has("lodash")) {
    const m = /lodash[^"'\d\n]*v?([\d]+\.[\d]+\.[\d]+)/i.exec(combined);
    if (m) {
      detected.add("lodash");
      if (isLodashOutdated(m[1])) {
        findings.push({
          code: "DEP_LODASH_OUTDATED",
          title: `Potentially outdated Lodash version detected (v${m[1]}). Prototype pollution risk.`,
          description: `Lodash v${m[1]} is outdated and vulnerable to prototype pollution attacks. Upgrade to v4.17.21 or later.`,
          severity: "MEDIUM",
          fixPrompt: buildFixPrompt(
            `Outdated Lodash v${m[1]}`,
            "Upgrade Lodash to v4.17.21 or later. Run: npm install lodash@latest",
          ),
        });
      }
    }
  }

  // Bootstrap (flag major < 4)
  if (!detected.has("bootstrap")) {
    const m = /bootstrap[^"'\d\n]*v?([\d]+\.[\d]+)/i.exec(combined);
    if (m) {
      const { major } = parseVersion(m[1]);
      if (major > 0 && major < 4) {
        detected.add("bootstrap");
        findings.push({
          code: "DEP_BOOTSTRAP_OUTDATED",
          title: `Bootstrap v${m[1]} or earlier detected. Known XSS vulnerabilities.`,
          description: `Bootstrap v${m[1]} is outdated and contains known XSS vulnerabilities. Upgrade to v4 or later.`,
          severity: "LOW",
          fixPrompt: buildFixPrompt(
            `Outdated Bootstrap v${m[1]}`,
            "Upgrade Bootstrap to v5.x. Run: npm install bootstrap@latest",
          ),
        });
      }
    }
  }

  // Moment.js (flag if present at all)
  if (!detected.has("moment")) {
    const m = /moment[^"'\d\n]*v?([\d]+\.[\d]+\.[\d]+)/i.exec(combined);
    if (m) {
      detected.add("moment");
      findings.push({
        code: "DEP_MOMENTJS_DETECTED",
        title: `Moment.js detected (v${m[1]}). Consider migrating to a maintained date library.`,
        description:
          "Moment.js is in maintenance mode and no longer receives feature updates. Consider migrating to date-fns, Day.js, or Luxon.",
        severity: "LOW",
        fixPrompt: buildFixPrompt(
          "Moment.js detected",
          "Migrate from Moment.js to a maintained library such as date-fns or Day.js. See https://momentjs.com/docs/#/-project-status/",
        ),
      });
    }
  }

  return findings;
}
