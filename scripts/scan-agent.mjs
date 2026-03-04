#!/usr/bin/env node
/**
 * Scantient Scan Agent
 * ====================
 * Standalone ESM script — no npm dependencies, Node.js built-ins only.
 *
 * Usage:
 *   SCANTIENT_AGENT_KEY=sa_... SCANTIENT_APP_URL=https://internal.corp.example node scan-agent.mjs
 *
 * Environment variables:
 *   SCANTIENT_AGENT_KEY   Required. The sa_ agent key generated in the Scantient dashboard.
 *   SCANTIENT_APP_URL     Required. The internal URL to scan (HTTP or HTTPS).
 *   SCANTIENT_API_URL     Optional. Defaults to https://scantient.com
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const AGENT_KEY = process.env.SCANTIENT_AGENT_KEY;
const APP_URL = process.env.SCANTIENT_APP_URL;
const API_URL = process.env.SCANTIENT_API_URL ?? "https://scantient.com";
const FETCH_TIMEOUT_MS = 30_000;

/**
 * VERCEL_BYPASS_SECRET — optional.
 *
 * When set, the agent sends `x-vercel-protection-bypass: <value>` on every
 * request.  This bypasses Vercel's bot-protection challenge (Attack Challenge
 * Mode) for projects that have VERCEL_AUTOMATION_BYPASS_SECRET configured.
 *
 * Set this to the value you stored in the target project's
 * VERCEL_AUTOMATION_BYPASS_SECRET Vercel environment variable.
 */
const VERCEL_BYPASS_SECRET = process.env.VERCEL_BYPASS_SECRET ?? null;

if (!AGENT_KEY || !AGENT_KEY.startsWith("sa_")) {
  console.error("[scantient-agent] ERROR: SCANTIENT_AGENT_KEY is missing or invalid (must start with sa_)");
  process.exit(1);
}
if (!APP_URL) {
  console.error("[scantient-agent] ERROR: SCANTIENT_APP_URL is required");
  process.exit(1);
}

// ─── Security check types ─────────────────────────────────────────────────────

/**
 * @typedef {{ code: string; title: string; description: string; severity: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"; fixPrompt: string; }} Finding
 */

// ─── Security checks ─────────────────────────────────────────────────────────

/**
 * Check for missing or weak security headers.
 * @param {Headers} headers
 * @returns {Finding[]}
 */
function checkSecurityHeaders(headers) {
  /** @type {Finding[]} */
  const findings = [];
  const h = (name) => headers.get(name) ?? null;

  // Content-Security-Policy
  if (!h("content-security-policy")) {
    findings.push({
      code: "MISSING_CSP",
      title: "Content-Security-Policy header missing",
      description: "No CSP header found. This increases the risk of XSS attacks.",
      severity: "HIGH",
      fixPrompt: "Add a Content-Security-Policy header with a restrictive policy (e.g. default-src 'self').",
    });
  }

  // X-Frame-Options
  const xfo = h("x-frame-options");
  if (!xfo) {
    findings.push({
      code: "MISSING_X_FRAME_OPTIONS",
      title: "X-Frame-Options header missing",
      description: "The page can be embedded in iframes, enabling clickjacking attacks.",
      severity: "MEDIUM",
      fixPrompt: "Add X-Frame-Options: DENY or SAMEORIGIN to prevent framing.",
    });
  }

  // Strict-Transport-Security
  const hsts = h("strict-transport-security");
  if (!hsts) {
    findings.push({
      code: "MISSING_HSTS",
      title: "Strict-Transport-Security header missing",
      description: "HSTS is not set. Browsers may be vulnerable to downgrade attacks.",
      severity: "MEDIUM",
      fixPrompt: "Add Strict-Transport-Security: max-age=31536000; includeSubDomains.",
    });
  } else if (!hsts.includes("max-age")) {
    findings.push({
      code: "WEAK_HSTS",
      title: "Strict-Transport-Security header is misconfigured",
      description: "HSTS header found but lacks max-age directive.",
      severity: "MEDIUM",
      fixPrompt: "Add max-age=31536000 (at minimum) to your HSTS header.",
    });
  }

  // X-Content-Type-Options
  if (!h("x-content-type-options")) {
    findings.push({
      code: "MISSING_X_CONTENT_TYPE_OPTIONS",
      title: "X-Content-Type-Options header missing",
      description: "Missing X-Content-Type-Options: nosniff. Browsers may MIME-sniff responses.",
      severity: "LOW",
      fixPrompt: "Add X-Content-Type-Options: nosniff to all responses.",
    });
  }

  // Referrer-Policy
  if (!h("referrer-policy")) {
    findings.push({
      code: "MISSING_REFERRER_POLICY",
      title: "Referrer-Policy header missing",
      description: "No Referrer-Policy set. Sensitive URL parameters may leak in the Referer header.",
      severity: "LOW",
      fixPrompt: "Add Referrer-Policy: strict-origin-when-cross-origin or no-referrer.",
    });
  }

  // Permissions-Policy
  if (!h("permissions-policy")) {
    findings.push({
      code: "MISSING_PERMISSIONS_POLICY",
      title: "Permissions-Policy header missing",
      description: "No Permissions-Policy header. Browser features (camera, microphone, etc.) are unrestricted.",
      severity: "LOW",
      fixPrompt: "Add a Permissions-Policy header restricting unused browser features.",
    });
  }

  return findings;
}

/**
 * Check cookie security flags (Secure, HttpOnly, SameSite).
 * @param {Headers} headers
 * @returns {Finding[]}
 */
function checkCookieSecurity(headers) {
  /** @type {Finding[]} */
  const findings = [];
  const raw = headers.get("set-cookie");
  if (!raw) return findings;

  // Headers API returns set-cookie joined; we split on a heuristic
  const cookies = raw.split(/,(?=[^\s])/);

  for (const cookie of cookies) {
    const lower = cookie.toLowerCase();

    if (!lower.includes("httponly")) {
      findings.push({
        code: "COOKIE_MISSING_HTTPONLY",
        title: "Cookie missing HttpOnly flag",
        description: `A cookie does not have the HttpOnly flag set: "${cookie.split(";")[0].trim()}"`,
        severity: "MEDIUM",
        fixPrompt: "Add HttpOnly flag to all session cookies to prevent JavaScript access.",
      });
    }

    if (!lower.includes("secure")) {
      findings.push({
        code: "COOKIE_MISSING_SECURE",
        title: "Cookie missing Secure flag",
        description: `A cookie does not have the Secure flag set: "${cookie.split(";")[0].trim()}"`,
        severity: "MEDIUM",
        fixPrompt: "Add Secure flag to ensure cookies are only sent over HTTPS.",
      });
    }

    if (!lower.includes("samesite")) {
      findings.push({
        code: "COOKIE_MISSING_SAMESITE",
        title: "Cookie missing SameSite attribute",
        description: `A cookie is missing SameSite: "${cookie.split(";")[0].trim()}"`,
        severity: "LOW",
        fixPrompt: "Add SameSite=Strict or SameSite=Lax to protect against CSRF.",
      });
    }
  }

  return findings;
}

/**
 * Check for CORS misconfiguration.
 * @param {Headers} headers
 * @returns {Finding[]}
 */
function checkCORSMisconfiguration(headers) {
  /** @type {Finding[]} */
  const findings = [];
  const acao = headers.get("access-control-allow-origin");

  if (acao === "*") {
    findings.push({
      code: "CORS_WILDCARD",
      title: "CORS wildcard origin (Access-Control-Allow-Origin: *)",
      description: "Any origin can make cross-origin requests to this resource.",
      severity: "HIGH",
      fixPrompt: "Restrict Access-Control-Allow-Origin to specific trusted origins.",
    });
  }

  const acac = headers.get("access-control-allow-credentials");
  if (acao === "*" && acac === "true") {
    findings.push({
      code: "CORS_CREDENTIALS_WILDCARD",
      title: "CORS wildcard with credentials allowed",
      description: "Credentials (cookies, auth headers) can be sent from any origin — critical misconfiguration.",
      severity: "CRITICAL",
      fixPrompt: "Never combine Access-Control-Allow-Origin: * with Access-Control-Allow-Credentials: true.",
    });
  }

  return findings;
}

/**
 * Check for information disclosure via response headers.
 * @param {Headers} headers
 * @returns {Finding[]}
 */
function checkInformationDisclosure(headers) {
  /** @type {Finding[]} */
  const findings = [];

  const server = headers.get("server");
  if (server && /\d/.test(server)) {
    findings.push({
      code: "SERVER_VERSION_DISCLOSED",
      title: "Server header reveals version information",
      description: `The Server header exposes: "${server}". This helps attackers target known vulnerabilities.`,
      severity: "LOW",
      fixPrompt: "Configure your server to suppress or genericize the Server header.",
    });
  }

  const poweredBy = headers.get("x-powered-by");
  if (poweredBy) {
    findings.push({
      code: "X_POWERED_BY_DISCLOSED",
      title: "X-Powered-By header leaks technology stack",
      description: `X-Powered-By: "${poweredBy}" reveals the technology stack.`,
      severity: "LOW",
      fixPrompt: "Remove or suppress the X-Powered-By header in your framework configuration.",
    });
  }

  return findings;
}

/**
 * Check SSL/HTTPS enforcement.
 * @param {string} url
 * @param {Headers} headers
 * @returns {Finding[]}
 */
function checkSSLIssues(url, headers) {
  /** @type {Finding[]} */
  const findings = [];

  if (url.startsWith("http://")) {
    findings.push({
      code: "HTTP_NOT_HTTPS",
      title: "App is served over HTTP, not HTTPS",
      description: "Traffic is unencrypted. Credentials and session tokens can be intercepted.",
      severity: "CRITICAL",
      fixPrompt: "Serve all traffic over HTTPS and redirect HTTP requests to HTTPS.",
    });
  }

  const hsts = headers.get("strict-transport-security");
  if (url.startsWith("https://") && !hsts) {
    // Already covered by header checks, skip duplicate
  }

  return findings;
}

/**
 * Check for inline scripts (CSP bypass risk).
 * @param {string} html
 * @returns {Finding[]}
 */
function checkInlineScripts(html) {
  /** @type {Finding[]} */
  const findings = [];
  const inlineScriptPattern = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
  const matches = html.match(inlineScriptPattern);

  if (matches && matches.length > 0) {
    findings.push({
      code: "INLINE_SCRIPTS_PRESENT",
      title: "Inline JavaScript scripts detected",
      description: `Found ${matches.length} inline <script> block(s). Inline scripts make CSP 'unsafe-inline' necessary, weakening XSS protection.`,
      severity: "LOW",
      fixPrompt: "Move inline scripts to external files and use nonce-based or hash-based CSP.",
    });
  }

  return findings;
}

/**
 * Check uptime status.
 * @param {number} statusCode
 * @param {number} responseTimeMs
 * @returns {Finding[]}
 */
function checkUptimeStatus(statusCode, responseTimeMs) {
  /** @type {Finding[]} */
  const findings = [];

  if (statusCode >= 500) {
    findings.push({
      code: "HTTP_SERVER_ERROR",
      title: `Server error: HTTP ${statusCode}`,
      description: "The app is returning a server error. It may be partially or fully down.",
      severity: "CRITICAL",
      fixPrompt: "Investigate server logs and fix the underlying error causing 5xx responses.",
    });
  } else if (statusCode >= 400 && statusCode !== 401 && statusCode !== 403) {
    findings.push({
      code: "HTTP_CLIENT_ERROR",
      title: `HTTP ${statusCode} response`,
      description: `The app returned HTTP ${statusCode}. This may indicate a misconfiguration.`,
      severity: "MEDIUM",
      fixPrompt: "Check the URL and server configuration for the cause of this 4xx error.",
    });
  }

  if (responseTimeMs > 5000) {
    findings.push({
      code: "SLOW_RESPONSE",
      title: "Slow response time",
      description: `The app responded in ${responseTimeMs}ms, which exceeds the 5s threshold.`,
      severity: "MEDIUM",
      fixPrompt: "Investigate server performance. Check database queries, caching, and resource usage.",
    });
  }

  return findings;
}

/**
 * Check for form security (missing CSRF indicators).
 * @param {string} html
 * @returns {Finding[]}
 */
function checkFormSecurity(html) {
  /** @type {Finding[]} */
  const findings = [];
  const formPattern = /<form[^>]*method=["']post["'][^>]*>/gi;
  const forms = html.match(formPattern);

  if (!forms || forms.length === 0) return findings;

  // Check if any form lacks a CSRF token (hidden input with csrf-like name)
  const csrfPattern = /<input[^>]+name=["'][^"']*(csrf|token|_token|authenticity)[^"']*["'][^>]*>/i;
  const hasCsrf = csrfPattern.test(html);

  if (!hasCsrf) {
    findings.push({
      code: "MISSING_CSRF_TOKEN",
      title: "POST forms lack CSRF protection",
      description: `Found ${forms.length} POST form(s) with no apparent CSRF token. Forms may be vulnerable to cross-site request forgery.`,
      severity: "HIGH",
      fixPrompt: "Add anti-CSRF tokens to all state-changing forms. Use the Synchronizer Token Pattern or SameSite cookies.",
    });
  }

  return findings;
}

// ─── Main scan logic ──────────────────────────────────────────────────────────

async function scan() {
  console.log(`[scantient-agent] Starting scan of ${APP_URL}`);
  const start = Date.now();

  const fetchHeaders = {
    "User-Agent": "Scantient-Agent/1.0 (Security Scanner; https://scantient.com)",
    Accept: "text/html,application/xhtml+xml,*/*",
    ...(VERCEL_BYPASS_SECRET ? { "x-vercel-protection-bypass": VERCEL_BYPASS_SECRET } : {}),
  };

  let response;
  try {
    response = await fetch(APP_URL, {
      method: "GET",
      headers: fetchHeaders,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (err) {
    console.error(`[scantient-agent] ERROR: Failed to fetch ${APP_URL}: ${err.message}`);
    process.exit(1);
  }

  if (response.status === 403 && response.headers.get("x-vercel-mitigated")) {
    console.error(`[scantient-agent] ERROR: Vercel bot protection challenge received (HTTP 403). Set VERCEL_BYPASS_SECRET env var to bypass.`);
    process.exit(1);
  }

  const responseTimeMs = Date.now() - start;
  const statusCode = response.status;
  const headers = response.headers;
  const html = await response.text();

  console.log(`[scantient-agent] Fetched ${APP_URL} — HTTP ${statusCode} in ${responseTimeMs}ms`);

  // Run all checks
  const findings = [
    ...checkSecurityHeaders(headers),
    ...checkCookieSecurity(headers),
    ...checkCORSMisconfiguration(headers),
    ...checkInformationDisclosure(headers),
    ...checkSSLIssues(APP_URL, headers),
    ...checkInlineScripts(html),
    ...checkUptimeStatus(statusCode, responseTimeMs),
    ...checkFormSecurity(html),
  ];

  console.log(`[scantient-agent] Found ${findings.length} finding(s):`);
  for (const f of findings) {
    const icon = f.severity === "CRITICAL" ? "🔴" : f.severity === "HIGH" ? "🟠" : f.severity === "MEDIUM" ? "🟡" : "🔵";
    console.log(`  ${icon} [${f.severity}] ${f.title} (${f.code})`);
  }

  // POST results to Scantient API
  const endpoint = `${API_URL}/api/agent/scan`;
  console.log(`[scantient-agent] Posting results to ${endpoint}`);

  let apiRes;
  try {
    apiRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_KEY}`,
      },
      body: JSON.stringify({ findings, responseTimeMs, statusCode }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error(`[scantient-agent] ERROR: Failed to post results: ${err.message}`);
    process.exit(1);
  }

  if (!apiRes.ok) {
    const body = await apiRes.text();
    console.error(`[scantient-agent] ERROR: API returned ${apiRes.status}: ${body}`);
    process.exit(1);
  }

  const result = await apiRes.json();
  console.log(`[scantient-agent] ✅ Scan submitted — runId: ${result.runId}, status: ${result.status}, findings: ${result.findingsCount}`);
  process.exit(0);
}

scan().catch((err) => {
  console.error(`[scantient-agent] FATAL: ${err.message}`);
  process.exit(1);
});
