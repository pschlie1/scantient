export type Tier = "FREE" | "STARTER" | "PRO" | "ENTERPRISE" | "ENTERPRISE_PLUS" | "EXPIRED";
export type FeatureKey =
  | "jira"
  | "sso"
  | "githubIntegration"
  | "teamsIntegration"
  | "pagerdutyIntegration"
  | "apiAccess"
  | "evidenceReports"
  | "executiveReports";

const rank: Record<Tier, number> = {
  EXPIRED: 0,
  FREE: 1,
  STARTER: 2,
  PRO: 3,
  ENTERPRISE: 4,
  ENTERPRISE_PLUS: 5,
};

export const tierCapabilities: Record<Tier, Record<FeatureKey, boolean>> = {
  EXPIRED: {
    jira: false,
    sso: false,
    githubIntegration: false,
    teamsIntegration: false,
    pagerdutyIntegration: false,
    apiAccess: false,
    evidenceReports: false,
    executiveReports: false,
  },
  FREE: {
    jira: false,
    sso: false,
    githubIntegration: false,
    teamsIntegration: false,
    pagerdutyIntegration: false,
    apiAccess: false,
    evidenceReports: false,
    executiveReports: false,
  },
  STARTER: {
    jira: false,
    sso: false,
    githubIntegration: false,
    teamsIntegration: false,
    pagerdutyIntegration: false,
    apiAccess: false,
    evidenceReports: false,
    executiveReports: false,
  },
  PRO: {
    jira: true,
    sso: false,
    githubIntegration: true,
    teamsIntegration: true,
    pagerdutyIntegration: false,
    apiAccess: true,
    evidenceReports: true,
    executiveReports: true,
  },
  ENTERPRISE: {
    jira: true,
    sso: true,
    githubIntegration: true,
    teamsIntegration: true,
    pagerdutyIntegration: true,
    apiAccess: true,
    evidenceReports: true,
    executiveReports: true,
  },
  ENTERPRISE_PLUS: {
    jira: true,
    sso: true,
    githubIntegration: true,
    teamsIntegration: true,
    pagerdutyIntegration: true,
    apiAccess: true,
    evidenceReports: true,
    executiveReports: true,
  },
};

export function hasFeature(tier: string, feature: FeatureKey): boolean {
  const t = (tier in tierCapabilities ? tier : "EXPIRED") as Tier;
  return Boolean(tierCapabilities[t][feature]);
}

export function atLeast(tier: string, minTier: Tier): boolean {
  const t = (tier in rank ? tier : "EXPIRED") as Tier;
  return rank[t] >= rank[minTier];
}
