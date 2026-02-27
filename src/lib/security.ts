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
