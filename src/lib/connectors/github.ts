/**
 * GitHub Infrastructure Connector (Tier 3-B)
 *
 * Checks:
 *  1. Open Dependabot security alerts — CRITICAL if any CRITICAL, HIGH if any HIGH
 *  2. Failed CI checks on main branch — HIGH if any required check is failing
 *  3. Open PRs older than 7 days — LOW (stale review backlog)
 *  4. No branch protection on main — HIGH if main has no required reviews/status checks
 *
 * Credentials: { token: string, owner: string, repo: string }
 * API: GitHub REST API v3 (https://api.github.com)
 * All fetches use ssrfSafeFetch.
 */

import { ssrfSafeFetch } from "@/lib/ssrf-guard";
import type { ConnectorResult, SecurityFinding } from "./types";

// ─── API types ────────────────────────────────────────────────────────────────

interface DependabotAlert {
  number: number;
  state: string;
  security_vulnerability?: {
    severity: "low" | "medium" | "high" | "critical";
    vulnerable_version_range?: string;
    package?: { name?: string; ecosystem?: string };
  };
  security_advisory?: { summary?: string };
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  required?: boolean;
}

interface PullRequest {
  number: number;
  title: string;
  created_at: string;
  draft: boolean;
}

interface BranchProtection {
  required_status_checks?: {
    strict: boolean;
    contexts: string[];
  } | null;
  required_pull_request_reviews?: {
    required_approving_review_count?: number;
    require_code_owner_reviews?: boolean;
  } | null;
  enforce_admins?: { enabled: boolean } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Scantient/1.0 (Infrastructure Connector)",
  };
}

async function fetchGitHub<T>(
  url: string,
  token: string,
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const res = await ssrfSafeFetch(
      url,
      {
        method: "GET",
        headers: githubHeaders(token),
        signal: AbortSignal.timeout(15_000),
      },
      1,
    );
    if (!res.ok) {
      return { data: null, error: `GitHub API error: HTTP ${res.status}`, status: res.status };
    }
    const data = (await res.json()) as T;
    return { data, error: null, status: res.status };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "GitHub API unreachable",
      status: 0,
    };
  }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkDependabotAlerts(
  token: string,
  owner: string,
  repo: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown> }> {
  const findings: SecurityFinding[] = [];

  const { data, error, status } = await fetchGitHub<DependabotAlert[]>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dependabot/alerts?state=open&per_page=100`,
    token,
  );

  if (status === 403 || status === 404) {
    // Dependabot alerts not enabled or no access — not a finding, just skip
    return { findings: [], data: { dependabotStatus: "not-accessible" } };
  }

  if (error || !data) {
    return { findings: [], data: { dependabotError: error } };
  }

  const alerts = Array.isArray(data) ? data : [];

  const critical = alerts.filter(
    (a) => a.security_vulnerability?.severity === "critical",
  );
  const high = alerts.filter((a) => a.security_vulnerability?.severity === "high");
  const medium = alerts.filter((a) => a.security_vulnerability?.severity === "medium");

  if (critical.length > 0) {
    const packages = critical
      .map((a) => a.security_vulnerability?.package?.name ?? `alert #${a.number}`)
      .slice(0, 5)
      .join(", ");
    findings.push({
      code: "GITHUB_DEPENDABOT_CRITICAL",
      title: `${critical.length} critical Dependabot security alert${critical.length === 1 ? "" : "s"}`,
      description: `${critical.length} critical severity dependency vulnerability${critical.length === 1 ? "" : "ies"} detected: ${packages}${critical.length > 5 ? " and more" : ""}. These require immediate attention.`,
      severity: "CRITICAL",
      fixPrompt:
        "Review the Dependabot security alerts in GitHub and update the vulnerable dependencies. Run `npm audit fix` or update package versions manually. Consider enabling automated Dependabot security updates.",
    });
  }

  if (high.length > 0) {
    const packages = high
      .map((a) => a.security_vulnerability?.package?.name ?? `alert #${a.number}`)
      .slice(0, 5)
      .join(", ");
    findings.push({
      code: "GITHUB_DEPENDABOT_HIGH",
      title: `${high.length} high-severity Dependabot alert${high.length === 1 ? "" : "s"}`,
      description: `${high.length} high severity dependency vulnerability${high.length === 1 ? "" : "ies"} detected: ${packages}${high.length > 5 ? " and more" : ""}.`,
      severity: "HIGH",
      fixPrompt:
        "Update the vulnerable dependencies identified in GitHub Dependabot alerts. Prioritize these updates in your next sprint.",
    });
  }

  return {
    findings,
    data: {
      dependabotAlerts: {
        critical: critical.length,
        high: high.length,
        medium: medium.length,
        total: alerts.length,
      },
    },
  };
}

async function checkCIStatus(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown> }> {
  const findings: SecurityFinding[] = [];

  // Get latest commit on main/default branch
  const { data: branchData } = await fetchGitHub<{ commit?: { sha?: string } }>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(defaultBranch)}`,
    token,
  );

  const sha = branchData?.commit?.sha;
  if (!sha) {
    return { findings: [], data: { ciStatus: "branch-not-found" } };
  }

  // Get check runs for latest commit
  const { data: checksData } = await fetchGitHub<{ check_runs: CheckRun[] }>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${sha}/check-runs?per_page=50`,
    token,
  );

  const checkRuns = checksData?.check_runs ?? [];

  const failedChecks = checkRuns.filter(
    (c) =>
      c.status === "completed" &&
      c.conclusion !== null &&
      c.conclusion !== "success" &&
      c.conclusion !== "skipped" &&
      c.conclusion !== "neutral",
  );

  if (failedChecks.length > 0) {
    const checkNames = failedChecks
      .slice(0, 5)
      .map((c) => c.name)
      .join(", ");
    findings.push({
      code: "GITHUB_CI_FAILING",
      title: `${failedChecks.length} CI check${failedChecks.length === 1 ? "" : "s"} failing on ${defaultBranch}`,
      description: `The following CI checks are failing on the ${defaultBranch} branch: ${checkNames}${failedChecks.length > 5 ? " and more" : ""}. Failing CI on the main branch blocks safe deployments.`,
      severity: "HIGH",
      fixPrompt:
        "Fix the failing CI checks. Review the check logs in GitHub Actions for error details. Do not merge PRs until CI is green on the main branch.",
    });
  }

  return {
    findings,
    data: {
      ci: {
        sha: sha.slice(0, 8),
        totalChecks: checkRuns.length,
        failedChecks: failedChecks.length,
        failedNames: failedChecks.slice(0, 5).map((c) => c.name),
      },
    },
  };
}

async function checkStalePRs(
  token: string,
  owner: string,
  repo: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown> }> {
  const findings: SecurityFinding[] = [];

  const { data, error } = await fetchGitHub<PullRequest[]>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=50`,
    token,
  );

  if (error || !data) {
    return { findings: [], data: { stalePRsError: error } };
  }

  const prs = Array.isArray(data) ? data : [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const stalePRs = prs.filter(
    (pr) => !pr.draft && new Date(pr.created_at) < sevenDaysAgo,
  );

  if (stalePRs.length > 0) {
    findings.push({
      code: "GITHUB_STALE_PRS",
      title: `${stalePRs.length} open PR${stalePRs.length === 1 ? "" : "s"} older than 7 days`,
      description: `${stalePRs.length} pull request${stalePRs.length === 1 ? "" : "s"} have been open for more than 7 days without being merged or closed. Stale PRs indicate review backlog or blocked work.`,
      severity: "LOW",
      fixPrompt:
        "Review open pull requests and either merge, request changes, or close stale ones. Consider establishing a PR review SLA for your team.",
    });
  }

  return {
    findings,
    data: {
      pullRequests: {
        open: prs.length,
        stale: stalePRs.length,
      },
    },
  };
}

async function checkBranchProtection(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown> }> {
  const findings: SecurityFinding[] = [];

  const { data, status } = await fetchGitHub<BranchProtection>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(defaultBranch)}/protection`,
    token,
  );

  if (status === 404) {
    // 404 means branch protection is not enabled at all
    findings.push({
      code: "GITHUB_NO_BRANCH_PROTECTION",
      title: `No branch protection rules on ${defaultBranch}`,
      description: `The ${defaultBranch} branch has no branch protection rules. Anyone with write access can force-push or merge without review.`,
      severity: "HIGH",
      fixPrompt: `Enable branch protection in GitHub → Settings → Branches → Add rule for "${defaultBranch}". Require at least 1 PR review and enable status checks.`,
    });
    return { findings, data: { branchProtection: false } };
  }

  if (!data) {
    return { findings: [], data: { branchProtectionError: "Could not fetch branch protection data" } };
  }

  const issues: string[] = [];

  if (!data.required_pull_request_reviews) {
    issues.push("no required PR reviews");
  } else {
    const reviewCount = data.required_pull_request_reviews.required_approving_review_count ?? 0;
    if (reviewCount < 1) {
      issues.push("requires 0 approving reviews");
    }
  }

  if (!data.required_status_checks || data.required_status_checks.contexts.length === 0) {
    issues.push("no required status checks");
  }

  if (issues.length > 0) {
    findings.push({
      code: "GITHUB_WEAK_BRANCH_PROTECTION",
      title: `Weak branch protection on ${defaultBranch}: ${issues.join(", ")}`,
      description: `Branch protection for ${defaultBranch} is missing key settings: ${issues.join(", ")}. This allows merges without adequate review or CI gate.`,
      severity: "HIGH",
      fixPrompt: `Strengthen branch protection in GitHub → Settings → Branches. Enable: required PR reviews (≥1 approver), required status checks (all CI jobs), and dismiss stale reviews on new commits.`,
    });
  }

  return {
    findings,
    data: {
      branchProtection: {
        enabled: true,
        requiredReviews: data.required_pull_request_reviews?.required_approving_review_count ?? 0,
        requiredStatusChecks: data.required_status_checks?.contexts ?? [],
      },
    },
  };
}

// ─── Main connector export ────────────────────────────────────────────────────

/**
 * Run all GitHub infrastructure checks.
 * @param credentials - { token: string, owner: string, repo: string }
 */
export async function run(
  credentials: Record<string, string>,
): Promise<ConnectorResult> {
  const { token, owner, repo } = credentials;
  const checkedAt = new Date().toISOString();

  if (!token || !owner || !repo) {
    return {
      ok: false,
      findings: [
        {
          code: "GITHUB_MISSING_CREDENTIALS",
          title: "GitHub connector credentials incomplete",
          description: "A GitHub token, owner, and repository name are all required.",
          severity: "MEDIUM",
          fixPrompt:
            "Configure the GitHub connector with a personal access token (with repo scope), the repository owner (user or org name), and the repository name.",
        },
      ],
      data: {},
      checkedAt,
    };
  }

  // Get default branch from repo metadata
  const { data: repoData } = await fetchGitHub<{ default_branch?: string }>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
  );
  const defaultBranch = repoData?.default_branch ?? "main";

  // Run all checks in parallel
  const [dependabotResult, ciResult, stalePRResult, branchProtResult] = await Promise.all([
    checkDependabotAlerts(token, owner, repo),
    checkCIStatus(token, owner, repo, defaultBranch),
    checkStalePRs(token, owner, repo),
    checkBranchProtection(token, owner, repo, defaultBranch),
  ]);

  const allFindings = [
    ...dependabotResult.findings,
    ...ciResult.findings,
    ...stalePRResult.findings,
    ...branchProtResult.findings,
  ];

  const allData = {
    repo: `${owner}/${repo}`,
    defaultBranch,
    ...dependabotResult.data,
    ...ciResult.data,
    ...stalePRResult.data,
    ...branchProtResult.data,
  };

  const hasCritical = allFindings.some((f) => f.severity === "CRITICAL");
  const hasHigh = allFindings.some((f) => f.severity === "HIGH");

  return {
    ok: !hasCritical && !hasHigh,
    findings: allFindings,
    data: allData,
    checkedAt,
  };
}
