/**
 * Tier 1 Auth Surface Scanner — Endpoint Discovery
 *
 * Auto-discovers auth and API endpoints from HTML, JS bundles,
 * framework fingerprinting, wordlist fuzzing, and OpenAPI specs.
 *
 * All outbound fetches go through ssrfSafeFetch.
 */

import { ssrfSafeFetch } from "@/lib/ssrf-guard";

export interface DiscoveredEndpoint {
  url: string;
  path: string;
  method: "GET" | "POST" | "OPTIONS";
  category: "auth" | "api" | "admin" | "payment" | "health" | "unknown";
  confidence: "high" | "medium" | "low";
  source: "html-form" | "js-bundle" | "wordlist" | "openapi" | "robots";
  framework?: string;
}

// ─── Framework patterns ──────────────────────────────────────────────────────

const FRAMEWORK_PATTERNS: Record<
  string,
  { signals: RegExp[]; authPaths: string[] }
> = {
  nextauth: {
    signals: [/__NEXT_DATA__/, /next-auth/, /_next\/static/],
    authPaths: [
      "/api/auth/csrf",
      "/api/auth/signin",
      "/api/auth/signout",
      "/api/auth/session",
    ],
  },
  supabase: {
    signals: [/supabase\.co/, /sb-access-token/, /@supabase/],
    authPaths: [], // Supabase uses client-side SDK — no server auth routes to probe
  },
  clerk: {
    signals: [/clerk\.accounts\.dev/, /clerk\.com/, /__clerk/],
    authPaths: [], // Clerk is external — no local routes to probe
  },
  laravel: {
    signals: [/laravel_session/, /XSRF-TOKEN/, /Laravel/],
    authPaths: [
      "/login",
      "/logout",
      "/register",
      "/sanctum/csrf-cookie",
      "/api/user",
    ],
  },
  django: {
    signals: [/csrftoken/, /csrfmiddlewaretoken/, /django/i],
    authPaths: [
      "/accounts/login/",
      "/accounts/logout/",
      "/api-auth/login/",
      "/api/auth/",
    ],
  },
  rails: {
    signals: [/authenticity_token/, /_rails_/, /action_dispatch/],
    authPaths: ["/users/sign_in", "/users/sign_out", "/users/password/new"],
  },
  express: {
    signals: [/express/i, /X-Powered-By.*Express/],
    authPaths: [
      "/auth/login",
      "/auth/signup",
      "/auth/logout",
      "/api/auth/login",
      "/api/login",
    ],
  },
};

// ─── General auth wordlist ───────────────────────────────────────────────────

const AUTH_WORDLIST = [
  "/login",
  "/signin",
  "/sign-in",
  "/signup",
  "/sign-up",
  "/register",
  "/logout",
  "/signout",
  "/api/login",
  "/api/signin",
  "/api/signup",
  "/api/auth",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/signin",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/csrf",
  "/api/v1/auth/login",
  "/api/v1/auth/signup",
  "/api/v1/login",
  "/api/v1/signup",
  "/api/users/login",
  "/api/users/signup",
  "/auth/login",
  "/auth/signup",
  "/auth/token",
  "/auth/refresh",
  "/oauth/token",
  "/oauth/authorize",
  "/api/password/reset",
  "/api/password/forgot",
  "/api/admin",
  "/admin",
  "/admin/login",
  "/api/health",
  "/health",
  "/api/status",
  "/api/stripe/webhook",
  "/api/webhooks/stripe",
  "/graphql",
  "/api/graphql",
  "/api/me",
  "/api/user",
  "/api/users/me",
];

// OpenAPI discovery paths
const OPENAPI_PATHS = [
  "/openapi.json",
  "/swagger.json",
  "/api-docs",
  "/api-docs/swagger.json",
  "/api/openapi.json",
];

// Status codes that indicate an endpoint exists (not a hard 404)
const ENDPOINT_EXISTS_CODES = new Set([200, 401, 405, 422]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categorizeByPath(
  path: string,
): "auth" | "api" | "admin" | "payment" | "health" | "unknown" {
  const p = path.toLowerCase();
  if (
    /login|signin|signup|logout|auth|session|token|password|reset|register/.test(
      p,
    )
  )
    return "auth";
  if (/admin|internal|staff|superuser/.test(p)) return "admin";
  if (/stripe|webhook|billing|checkout|subscription|payment/.test(p))
    return "payment";
  if (/health|status|ping|ready|live/.test(p)) return "health";
  if (/\/api\/|\/v\d\/|graphql/.test(p)) return "api";
  return "unknown";
}

function normalizePath(path: string): string {
  try {
    // Ensure leading slash and remove trailing slash (except root)
    const p = path.startsWith("/") ? path : `/${path}`;
    return p.length > 1 ? p.replace(/\/+$/, "") : p;
  } catch {
    return path;
  }
}

function resolveUrl(path: string, baseUrl: string): string {
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const base = new URL(baseUrl);
    return `${base.origin}${normalizePath(path)}`;
  } catch {
    return path;
  }
}

function isApiLikePath(s: string): boolean {
  return /^\/?(api\/|auth\/|v\d+\/|graphql)/i.test(s) || /\/(api|auth|login|signup|logout)\b/i.test(s);
}

// ─── A. HTML form parsing ────────────────────────────────────────────────────

function extractFromHtml(
  html: string,
  baseUrl: string,
): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];

  // Extract form actions
  const formMatches = html.matchAll(/<form[^>]*\baction=["']([^"']+)["'][^>]*>/gi);
  for (const m of formMatches) {
    const action = m[1];
    if (!action || action.startsWith("javascript:") || action.startsWith("mailto:")) continue;

    const normalized = normalizePath(action.startsWith("http") ? new URL(action).pathname : action);
    if (!/login|signin|auth|session|token|register|signup|password/i.test(normalized)) continue;

    endpoints.push({
      url: resolveUrl(action, baseUrl),
      path: normalized,
      method: "POST",
      category: categorizeByPath(normalized),
      confidence: "high",
      source: "html-form",
    });
  }

  // Extract <a href> links suggesting auth routes
  const linkMatches = html.matchAll(/<a[^>]*\bhref=["']([^"']+)["'][^>]*>/gi);
  for (const m of linkMatches) {
    const href = m[1];
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("#")) continue;

    let path: string;
    if (href.startsWith("http://") || href.startsWith("https://")) {
      try {
        path = new URL(href).pathname;
      } catch {
        continue;
      }
    } else {
      path = href.split("?")[0] ?? href;
    }

    const normalized = normalizePath(path);
    if (!/login|signin|auth|logout|register|signup|password|account/i.test(normalized)) continue;

    endpoints.push({
      url: resolveUrl(href, baseUrl),
      path: normalized,
      method: "GET",
      category: categorizeByPath(normalized),
      confidence: "medium",
      source: "html-form",
    });
  }

  return endpoints;
}

// ─── B. JS bundle scanning ───────────────────────────────────────────────────

function extractFromJsBundles(
  jsPayloads: string[],
  baseUrl: string,
): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];

  const patterns: RegExp[] = [
    // fetch('...')
    /fetch\s*\(\s*["'`]([^"'`\s]+)["'`]/g,
    // axios.get/post/etc.('...')
    /(?:axios|api|client)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*["'`]([^"'`\s]+)["'`]/gi,
    // Bare string literals that look like API paths
    /["'`](\/(?:api|auth|v\d+|graphql|oauth|login|signup|logout|register|admin)[^"'`\s]*)/g,
  ];

  for (const payload of jsPayloads) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(payload)) !== null) {
        const raw = m[1];
        if (!raw) continue;

        // Skip template literal placeholders and data URIs
        if (/\$\{|data:|undefined/.test(raw)) continue;

        // Must look like an API path
        if (!isApiLikePath(raw) && !raw.startsWith("/")) continue;

        const normalized = normalizePath(
          raw.startsWith("http") ? (() => { try { return new URL(raw).pathname; } catch { return raw; } })() : raw,
        );

        endpoints.push({
          url: resolveUrl(raw, baseUrl),
          path: normalized,
          method: "POST",
          category: categorizeByPath(normalized),
          confidence: "medium",
          source: "js-bundle",
        });
      }
    }
  }

  return endpoints;
}

// ─── C. Framework fingerprinting ─────────────────────────────────────────────

export function detectFramework(html: string): string | undefined {
  for (const [name, { signals }] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (signals.some((sig) => sig.test(html))) {
      return name;
    }
  }
  return undefined;
}

function endpointsFromFramework(
  framework: string,
  baseUrl: string,
): DiscoveredEndpoint[] {
  const pattern = FRAMEWORK_PATTERNS[framework];
  if (!pattern || pattern.authPaths.length === 0) return [];

  return pattern.authPaths.map((path) => ({
    url: resolveUrl(path, baseUrl),
    path: normalizePath(path),
    method: "POST" as const,
    category: categorizeByPath(path),
    confidence: "high" as const,
    source: "wordlist" as const,
    framework,
  }));
}

// ─── D. Wordlist fuzzing ─────────────────────────────────────────────────────

async function fuzzWordlist(
  baseUrl: string,
  paths: string[],
  framework?: string,
): Promise<DiscoveredEndpoint[]> {
  const found: DiscoveredEndpoint[] = [];
  const origin = new URL(baseUrl).origin;

  // Process in batches of 10 concurrent requests
  const CONCURRENCY = 10;
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (path) => {
        const url = `${origin}${path}`;
        try {
          const res = await ssrfSafeFetch(
            url,
            {
              method: "HEAD",
              headers: { "User-Agent": "Scantient/1.0 (Security Monitor)" },
              signal: AbortSignal.timeout(8000),
            },
            0, // no redirects for fuzzing — check the immediate response
          );
          return { path, url, status: res.status };
        } catch {
          return { path, url, status: 0 };
        }
      }),
    );

    for (const settled of results) {
      if (settled.status !== "fulfilled") continue;
      const { path, url, status } = settled.value;
      if (status === 0 || status === 404 || status >= 500) continue;
      if (!ENDPOINT_EXISTS_CODES.has(status) && status !== 200 && status !== 301 && status !== 302) continue;
      // Treat 301/302 as "might exist" — low confidence
      const confidence = status === 200 ? "medium" : status === 401 || status === 405 ? "high" : "low";
      found.push({
        url,
        path: normalizePath(path),
        method: "POST",
        category: categorizeByPath(path),
        confidence,
        source: "wordlist",
        ...(framework ? { framework } : {}),
      });
    }
  }

  return found;
}

// ─── E. OpenAPI / Swagger discovery ─────────────────────────────────────────

interface OpenApiSpec {
  paths?: Record<string, Record<string, unknown>>;
  basePath?: string;
}

async function discoverOpenApi(
  baseUrl: string,
): Promise<{ endpoints: DiscoveredEndpoint[]; found: boolean }> {
  const origin = new URL(baseUrl).origin;
  const results: DiscoveredEndpoint[] = [];
  let found = false;

  for (const specPath of OPENAPI_PATHS) {
    try {
      const url = `${origin}${specPath}`;
      const res = await ssrfSafeFetch(
        url,
        {
          method: "GET",
          headers: { "User-Agent": "Scantient/1.0 (Security Monitor)" },
          signal: AbortSignal.timeout(8000),
        },
        2,
      );

      if (res.status !== 200) continue;

      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json") && !ct.includes("yaml") && specPath !== "/api-docs") continue;

      let spec: OpenApiSpec;
      try {
        spec = (await res.json()) as OpenApiSpec;
      } catch {
        continue;
      }

      if (!spec?.paths || typeof spec.paths !== "object") continue;

      found = true;

      for (const [apiPath, methods] of Object.entries(spec.paths)) {
        if (typeof methods !== "object" || !methods) continue;
        for (const method of Object.keys(methods)) {
          const httpMethod = method.toUpperCase();
          if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(httpMethod)) continue;

          const normalized = normalizePath(apiPath);
          results.push({
            url: `${origin}${normalized}`,
            path: normalized,
            method: (["GET", "POST", "OPTIONS"].includes(httpMethod) ? httpMethod : "POST") as "GET" | "POST" | "OPTIONS",
            category: categorizeByPath(normalized),
            confidence: "high",
            source: "openapi",
          });
        }
      }

      // Stop after first successful spec
      break;
    } catch {
      // ignore individual path failures
    }
  }

  return { endpoints: results, found };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function discoverEndpoints(
  html: string,
  jsPayloads: string[],
  baseUrl: string,
): Promise<DiscoveredEndpoint[]> {
  // Validate baseUrl
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  void origin;

  // Run all discovery strategies
  const [openApiResult] = await Promise.all([discoverOpenApi(baseUrl)]);

  const fromHtml = extractFromHtml(html, baseUrl);
  const fromJs = extractFromJsBundles(jsPayloads, baseUrl);

  const framework = detectFramework(html);
  const fromFramework = framework ? endpointsFromFramework(framework, baseUrl) : [];

  // For wordlist: use framework paths if detected, always run general wordlist
  const wordlistPaths = framework && FRAMEWORK_PATTERNS[framework]?.authPaths.length
    ? [...new Set([...FRAMEWORK_PATTERNS[framework].authPaths, ...AUTH_WORDLIST])]
    : AUTH_WORDLIST;

  const fromWordlist = await fuzzWordlist(baseUrl, wordlistPaths, framework);

  // Combine all
  const all = [
    ...fromHtml,
    ...fromJs,
    ...fromFramework,
    ...fromWordlist,
    ...openApiResult.endpoints,
  ];

  // Deduplicate by normalized path
  const seen = new Map<string, DiscoveredEndpoint>();
  for (const ep of all) {
    const key = normalizePath(ep.path).toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, ep);
    } else {
      // Prefer higher confidence
      const CONF_RANK = { high: 3, medium: 2, low: 1 } as const;
      if (CONF_RANK[ep.confidence] > CONF_RANK[existing.confidence]) {
        seen.set(key, { ...ep, framework: ep.framework ?? existing.framework });
      }
    }
  }

  // Sort: high → medium → low
  const CONF_ORDER = { high: 0, medium: 1, low: 2 } as const;
  const sorted = Array.from(seen.values()).sort(
    (a, b) => CONF_ORDER[a.confidence] - CONF_ORDER[b.confidence],
  );

  // Cap at 50 endpoints
  return sorted.slice(0, 50);
}
