/**
 * Vercel Infrastructure Connector (Tier 3-A)
 *
 * Checks:
 *  1. Latest production deployment status — CRITICAL if failed, HIGH if no deploy in 7 days
 *  2. Domain health — HIGH if any production domain has errors
 *  3. Environment variable audit — MEDIUM if .env.local pattern found in any key name
 *  4. Build time trend — LOW if build time increased >50% vs 7-day average
 *
 * Credentials: { token: string, projectId?: string }
 * APIs: api.vercel.com (v6/v9)
 * All fetches use ssrfSafeFetch.
 */

import { ssrfSafeFetch } from "@/lib/ssrf-guard";
import type { ConnectorResult, SecurityFinding } from "./types";

// ─── API types ────────────────────────────────────────────────────────────────

interface VercelDeployment {
  uid: string;
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  target?: "production" | "staging" | "preview";
  createdAt: number; // epoch ms
  buildingAt?: number;
  ready?: number;
  source?: string;
}

interface VercelDomain {
  name: string;
  verified: boolean;
  redirect?: string;
  error?: { code: string; message?: string };
}

interface VercelEnvVar {
  key: string;
  target: string[] | string;
  type: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vercelHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "Scantient/1.0 (Infrastructure Connector)",
    Accept: "application/json",
  };
}

async function fetchVercel<T>(
  url: string,
  token: string,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await ssrfSafeFetch(
      url,
      {
        method: "GET",
        headers: vercelHeaders(token),
        signal: AbortSignal.timeout(15_000),
      },
      1,
    );
    if (!res.ok) {
      return { data: null, error: `Vercel API error: HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Vercel API unreachable",
    };
  }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkDeployments(
  token: string,
  projectId: string | undefined,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown>; deployments: VercelDeployment[] }> {
  const findings: SecurityFinding[] = [];

  const qs = new URLSearchParams({ limit: "20", target: "production" });
  if (projectId) qs.set("projectId", projectId);

  const { data, error } = await fetchVercel<{ deployments: VercelDeployment[] }>(
    `https://api.vercel.com/v6/deployments?${qs}`,
    token,
  );

  if (error || !data) {
    return {
      findings: [
        {
          code: "VERCEL_API_UNREACHABLE",
          title: "Vercel API unreachable",
          description: `Could not fetch deployment data from Vercel: ${error ?? "unknown error"}`,
          severity: "MEDIUM",
          fixPrompt:
            "Check your Vercel API token has the correct permissions and has not expired. Regenerate at vercel.com/account/tokens.",
        },
      ],
      data: { error },
      deployments: [],
    };
  }

  const deployments = data.deployments ?? [];
  const prodDeployments = deployments.filter((d) => d.target === "production" || !d.target);

  if (prodDeployments.length === 0) {
    findings.push({
      code: "VERCEL_NO_PRODUCTION_DEPLOYMENTS",
      title: "No production deployments found",
      description:
        "No production deployments were found in the last 20 deployments. Verify the project is actively deployed.",
      severity: "HIGH",
      fixPrompt:
        "Ensure the project is deployed to production. Check Vercel dashboard for the project status.",
    });
    return { findings, data: { deployments: [] }, deployments: [] };
  }

  const latest = prodDeployments[0];

  // Check 1: Latest deployment failed
  if (latest.state === "ERROR") {
    findings.push({
      code: "VERCEL_DEPLOY_FAILED",
      title: "Latest production deployment failed",
      description: `The most recent production deployment (${latest.uid}) failed. Your app may be serving stale content or be unavailable.`,
      severity: "CRITICAL",
      fixPrompt:
        "Check the Vercel deployment logs for the error. Fix the build error and redeploy. Review environment variable configuration.",
    });
  }

  // Check 2: No deploy in 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (latest.createdAt < sevenDaysAgo) {
    const daysAgo = Math.floor((Date.now() - latest.createdAt) / (24 * 60 * 60 * 1000));
    findings.push({
      code: "VERCEL_STALE_DEPLOYMENT",
      title: `No production deployment in ${daysAgo} days`,
      description: `The last production deployment was ${daysAgo} days ago. This may indicate a stalled deployment pipeline or abandoned project.`,
      severity: "HIGH",
      fixPrompt:
        "Verify the deployment pipeline is healthy. Check if the project is still actively maintained and if CI/CD automation is functioning.",
    });
  }

  return {
    findings,
    data: {
      latestDeployment: {
        uid: latest.uid,
        state: latest.state,
        createdAt: new Date(latest.createdAt).toISOString(),
        ageMs: Date.now() - latest.createdAt,
      },
    },
    deployments: prodDeployments,
  };
}

async function checkDomains(
  token: string,
  projectId: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown> }> {
  const findings: SecurityFinding[] = [];

  const { data, error } = await fetchVercel<{ domains: VercelDomain[] }>(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains`,
    token,
  );

  if (error || !data) {
    // Non-fatal if domains can't be fetched
    return { findings: [], data: { domainsError: error } };
  }

  const domains = data.domains ?? [];
  const problemDomains = domains.filter((d) => d.error || !d.verified);

  for (const domain of problemDomains) {
    findings.push({
      code: "VERCEL_DOMAIN_ERROR",
      title: `Domain configuration issue: ${domain.name}`,
      description: domain.error
        ? `Production domain "${domain.name}" has an error: ${domain.error.message ?? domain.error.code}.`
        : `Production domain "${domain.name}" is not verified. DNS propagation may be incomplete.`,
      severity: "HIGH",
      fixPrompt:
        "Go to Vercel Dashboard → Project → Domains and resolve the domain issue. Check DNS records are correctly configured with your registrar.",
    });
  }

  return {
    findings,
    data: {
      domains: domains.map((d) => ({
        name: d.name,
        verified: d.verified,
        hasError: !!d.error,
      })),
    },
  };
}

async function checkEnvVars(
  token: string,
  projectId: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown> }> {
  const findings: SecurityFinding[] = [];

  const { data, error } = await fetchVercel<{ envs: VercelEnvVar[] }>(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env`,
    token,
  );

  if (error || !data) {
    return { findings: [], data: { envVarsError: error } };
  }

  const envs = data.envs ?? [];

  // Check for .env.local naming patterns in production env var keys
  // This suggests local config was accidentally promoted to production
  const suspiciousEnvs = envs.filter((e) => {
    const key = e.key.toLowerCase();
    const targets = Array.isArray(e.target) ? e.target : [e.target];
    const isProduction = targets.includes("production");
    return (
      isProduction &&
      (key.includes("local") ||
        key.includes("dev_") ||
        key.includes("_dev") ||
        key.startsWith("local_"))
    );
  });

  for (const env of suspiciousEnvs) {
    findings.push({
      code: "VERCEL_LOCAL_ENV_IN_PROD",
      title: `Local/dev environment variable found in production: ${env.key}`,
      description: `Environment variable "${env.key}" appears to be a local or development-specific variable but is configured for production. This suggests local config may have leaked to production.`,
      severity: "MEDIUM",
      fixPrompt: `Review the "${env.key}" environment variable. If it's development-only, remove it from the production environment in Vercel Dashboard → Project → Settings → Environment Variables.`,
    });
  }

  return {
    findings,
    data: { envVarsChecked: envs.length, suspiciousCount: suspiciousEnvs.length },
  };
}

function checkBuildTimeTrend(deployments: VercelDeployment[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (deployments.length < 3) return findings; // Need at least 3 data points

  // Calculate build duration for deployments that have both buildingAt and ready
  const buildDurations = deployments
    .filter((d) => d.buildingAt && d.ready && d.ready > d.buildingAt)
    .map((d) => ({
      durationMs: d.ready! - d.buildingAt!,
      createdAt: d.createdAt,
    }));

  if (buildDurations.length < 3) return findings;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = buildDurations.filter((d) => d.createdAt >= sevenDaysAgo);
  const older = buildDurations.filter((d) => d.createdAt < sevenDaysAgo);

  if (recent.length === 0 || older.length === 0) return findings;

  const avgRecent = recent.reduce((s, d) => s + d.durationMs, 0) / recent.length;
  const avgOlder = older.reduce((s, d) => s + d.durationMs, 0) / older.length;

  const increaseRatio = (avgRecent - avgOlder) / avgOlder;

  if (increaseRatio > 0.5) {
    const increasePercent = Math.round(increaseRatio * 100);
    findings.push({
      code: "VERCEL_BUILD_TIME_REGRESSION",
      title: `Build time increased by ${increasePercent}% in the last 7 days`,
      description: `Average build time has increased from ${Math.round(avgOlder / 1000)}s to ${Math.round(avgRecent / 1000)}s (a ${increasePercent}% increase). This may indicate growing bundle size, dependency bloat, or inefficient build configuration.`,
      severity: "LOW",
      fixPrompt:
        "Audit your build process for regressions: check for new large dependencies, misconfigured caching, or CI step changes. Use Vercel build logs to identify the slowest steps.",
    });
  }

  return findings;
}

// ─── Main connector export ────────────────────────────────────────────────────

/**
 * Run all Vercel infrastructure checks.
 * @param credentials - { token: string, projectId?: string }
 */
export async function run(
  credentials: Record<string, string>,
): Promise<ConnectorResult> {
  const { token, projectId } = credentials;
  const checkedAt = new Date().toISOString();

  if (!token) {
    return {
      ok: false,
      findings: [
        {
          code: "VERCEL_MISSING_CREDENTIALS",
          title: "Vercel API token not configured",
          description: "A Vercel API token is required to run Vercel infrastructure checks.",
          severity: "MEDIUM",
          fixPrompt: "Add a Vercel API token in the connector settings. Generate one at vercel.com/account/tokens.",
        },
      ],
      data: {},
      checkedAt,
    };
  }

  const allFindings: SecurityFinding[] = [];
  const allData: Record<string, unknown> = {};

  // Check deployments (always)
  const deployResult = await checkDeployments(token, projectId);
  allFindings.push(...deployResult.findings);
  Object.assign(allData, deployResult.data);

  const deployments = deployResult.deployments;

  // Checks that require a projectId
  if (projectId) {
    const [domainResult, envResult] = await Promise.all([
      checkDomains(token, projectId),
      checkEnvVars(token, projectId),
    ]);
    allFindings.push(...domainResult.findings, ...envResult.findings);
    Object.assign(allData, domainResult.data, envResult.data);
  } else {
    allData.note = "projectId not provided — domain and env var checks skipped";
  }

  // Build time trend check (uses deployment data, no extra API call)
  const buildTrendFindings = checkBuildTimeTrend(deployments);
  allFindings.push(...buildTrendFindings);

  const hasCritical = allFindings.some((f) => f.severity === "CRITICAL");
  const hasHigh = allFindings.some((f) => f.severity === "HIGH");

  return {
    ok: !hasCritical && !hasHigh,
    findings: allFindings,
    data: allData,
    checkedAt,
  };
}
