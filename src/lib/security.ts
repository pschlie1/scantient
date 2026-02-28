import { buildFixPrompt } from "@/lib/remediation";
import type { SecurityFinding } from "@/lib/types";

// ────────────────────────────────────────────
// 1. Exposed API keys in client-side JS
// ────────────────────────────────────────────

const KEY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: "OpenAI secret key" },
  { pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, label: "Anthropic secret key" },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/g, label: "Google API key" },
  { pattern: /ghp_[A-Za-z0-9]{36,}/g, label: "GitHub personal access token" },
  { pattern: /gho_[A-Za-z0-9]{36,}/g, label: "GitHub OAuth token" },
  { pattern: /xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{20,}/g, label: "Slack bot token" },
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
  { pattern: /stripe[_.]?secret[_.]?key\s*[:=]\s*["'`]sk_live_[^"'`]+["'`]/gi, label: "Stripe live secret key" },
  { pattern: /sk_live_[a-zA-Z0-9]{20,}/g, label: "Stripe live secret key" },
];

// Known safe public keys to suppress false positives
const SAFE_PREFIXES = ["pk_test_", "pk_live_", "sb-", "anon."];

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
