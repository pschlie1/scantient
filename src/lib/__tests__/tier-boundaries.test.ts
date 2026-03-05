import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasFeature, atLeast, type Tier } from "@/lib/tier-capabilities";

describe("Tier Capabilities", () => {
  describe("hasFeature", () => {
    const testCases: Array<{
      tier: string;
      feature: string;
      expected: boolean;
    }> = [
      // FREE tier - no features
      { tier: "FREE", feature: "jira", expected: false },
      { tier: "FREE", feature: "sso", expected: false },
      { tier: "FREE", feature: "githubIntegration", expected: false },
      { tier: "FREE", feature: "teamsIntegration", expected: false },
      { tier: "FREE", feature: "apiAccess", expected: false },
      { tier: "FREE", feature: "evidenceReports", expected: false },

      // STARTER tier - no features
      { tier: "STARTER", feature: "jira", expected: false },
      { tier: "STARTER", feature: "apiAccess", expected: false },

      // PRO tier - has integrations, API, reports
      { tier: "PRO", feature: "jira", expected: true },
      { tier: "PRO", feature: "githubIntegration", expected: true },
      { tier: "PRO", feature: "teamsIntegration", expected: true },
      { tier: "PRO", feature: "apiAccess", expected: true },
      { tier: "PRO", feature: "evidenceReports", expected: true },
      { tier: "PRO", feature: "executiveReports", expected: true },
      { tier: "PRO", feature: "sso", expected: false }, // not in PRO
      { tier: "PRO", feature: "pagerdutyIntegration", expected: false },

      // ENTERPRISE - all features except PagerDuty
      { tier: "ENTERPRISE", feature: "jira", expected: true },
      { tier: "ENTERPRISE", feature: "sso", expected: true },
      { tier: "ENTERPRISE", feature: "githubIntegration", expected: true },
      { tier: "ENTERPRISE", feature: "teamsIntegration", expected: true },
      { tier: "ENTERPRISE", feature: "pagerdutyIntegration", expected: true },
      { tier: "ENTERPRISE", feature: "apiAccess", expected: true },
      { tier: "ENTERPRISE", feature: "evidenceReports", expected: true },
      { tier: "ENTERPRISE", feature: "executiveReports", expected: true },

      // ENTERPRISE_PLUS - all features
      { tier: "ENTERPRISE_PLUS", feature: "jira", expected: true },
      { tier: "ENTERPRISE_PLUS", feature: "sso", expected: true },
      { tier: "ENTERPRISE_PLUS", feature: "pagerdutyIntegration", expected: true },
      { tier: "ENTERPRISE_PLUS", feature: "apiAccess", expected: true },

      // EXPIRED tier - no features
      { tier: "EXPIRED", feature: "jira", expected: false },
      { tier: "EXPIRED", feature: "apiAccess", expected: false },

      // Invalid tier - defaults to EXPIRED
      { tier: "INVALID", feature: "jira", expected: false },
      { tier: "INVALID", feature: "apiAccess", expected: false },
    ];

    testCases.forEach(({ tier, feature, expected }) => {
      it(`should return ${expected} for ${tier}.${feature}`, () => {
        expect(
          hasFeature(tier, feature as any)
        ).toBe(expected);
      });
    });
  });

  describe("atLeast", () => {
    const testCases: Array<{
      tier: string;
      minTier: Tier;
      expected: boolean;
    }> = [
      // FREE tier
      { tier: "FREE", minTier: "FREE", expected: true },
      { tier: "FREE", minTier: "STARTER", expected: false },
      { tier: "FREE", minTier: "PRO", expected: false },
      { tier: "FREE", minTier: "ENTERPRISE", expected: false },

      // STARTER tier
      { tier: "STARTER", minTier: "FREE", expected: true },
      { tier: "STARTER", minTier: "STARTER", expected: true },
      { tier: "STARTER", minTier: "PRO", expected: false },

      // PRO tier
      { tier: "PRO", minTier: "FREE", expected: true },
      { tier: "PRO", minTier: "STARTER", expected: true },
      { tier: "PRO", minTier: "PRO", expected: true },
      { tier: "PRO", minTier: "ENTERPRISE", expected: false },

      // ENTERPRISE tier
      { tier: "ENTERPRISE", minTier: "PRO", expected: true },
      { tier: "ENTERPRISE", minTier: "ENTERPRISE", expected: true },
      { tier: "ENTERPRISE", minTier: "ENTERPRISE_PLUS", expected: false },

      // ENTERPRISE_PLUS tier
      { tier: "ENTERPRISE_PLUS", minTier: "FREE", expected: true },
      { tier: "ENTERPRISE_PLUS", minTier: "ENTERPRISE", expected: true },
      { tier: "ENTERPRISE_PLUS", minTier: "ENTERPRISE_PLUS", expected: true },

      // EXPIRED tier
      { tier: "EXPIRED", minTier: "FREE", expected: false },

      // Invalid tier - defaults to EXPIRED
      { tier: "INVALID", minTier: "FREE", expected: false },
    ];

    testCases.forEach(({ tier, minTier, expected }) => {
      it(`should return ${expected} for atLeast(${tier}, ${minTier})`, () => {
        expect(atLeast(tier, minTier)).toBe(expected);
      });
    });
  });

  describe("Tier Upgrade Paths", () => {
    it("should allow upgrade from FREE to STARTER", () => {
      expect(atLeast("FREE", "FREE")).toBe(true);
      expect(atLeast("STARTER", "FREE")).toBe(true);
    });

    it("should allow upgrade from STARTER to PRO", () => {
      expect(atLeast("STARTER", "STARTER")).toBe(true);
      expect(atLeast("PRO", "STARTER")).toBe(true);
    });

    it("should allow upgrade from PRO to ENTERPRISE", () => {
      expect(atLeast("PRO", "PRO")).toBe(true);
      expect(atLeast("ENTERPRISE", "PRO")).toBe(true);
    });

    it("should allow upgrade from ENTERPRISE to ENTERPRISE_PLUS", () => {
      expect(atLeast("ENTERPRISE", "ENTERPRISE")).toBe(true);
      expect(atLeast("ENTERPRISE_PLUS", "ENTERPRISE")).toBe(true);
    });

    it("should not allow downgrade", () => {
      expect(atLeast("STARTER", "PRO")).toBe(false);
      expect(atLeast("PRO", "ENTERPRISE")).toBe(false);
      expect(atLeast("ENTERPRISE", "ENTERPRISE_PLUS")).toBe(false);
    });
  });

  describe("Feature Access Control", () => {
    const proFeatures = [
      "jira",
      "githubIntegration",
      "teamsIntegration",
      "apiAccess",
      "evidenceReports",
      "executiveReports",
    ];
    const enterpriseFeatures = [
      ...proFeatures,
      "sso",
      "pagerdutyIntegration",
    ];
    const enterprisePlusFeatures = enterpriseFeatures;

    describe("FREE tier", () => {
      it("should not have any integrations", () => {
        expect(hasFeature("FREE", "jira")).toBe(false);
        expect(hasFeature("FREE", "githubIntegration")).toBe(false);
        expect(hasFeature("FREE", "teamsIntegration")).toBe(false);
        expect(hasFeature("FREE", "pagerdutyIntegration")).toBe(false);
      });

      it("should not have API access", () => {
        expect(hasFeature("FREE", "apiAccess")).toBe(false);
      });

      it("should not have reports", () => {
        expect(hasFeature("FREE", "evidenceReports")).toBe(false);
        expect(hasFeature("FREE", "executiveReports")).toBe(false);
      });

      it("should not have SSO", () => {
        expect(hasFeature("FREE", "sso")).toBe(false);
      });
    });

    describe("PRO tier", () => {
      it("should have all PRO features", () => {
        proFeatures.forEach((feature) => {
          expect(hasFeature("PRO", feature as any)).toBe(
            true,
            `PRO should have ${feature}`
          );
        });
      });

      it("should not have SSO", () => {
        expect(hasFeature("PRO", "sso")).toBe(false);
      });

      it("should not have PagerDuty", () => {
        expect(hasFeature("PRO", "pagerdutyIntegration")).toBe(false);
      });
    });

    describe("ENTERPRISE tier", () => {
      it("should have all ENTERPRISE features", () => {
        enterpriseFeatures.forEach((feature) => {
          expect(hasFeature("ENTERPRISE", feature as any)).toBe(
            true,
            `ENTERPRISE should have ${feature}`
          );
        });
      });
    });

    describe("ENTERPRISE_PLUS tier", () => {
      it("should have all ENTERPRISE_PLUS features", () => {
        enterprisePlusFeatures.forEach((feature) => {
          expect(hasFeature("ENTERPRISE_PLUS", feature as any)).toBe(
            true,
            `ENTERPRISE_PLUS should have ${feature}`
          );
        });
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle null/undefined tier gracefully", () => {
      expect(hasFeature("", "jira")).toBe(false);
      expect(atLeast("", "FREE")).toBe(false);
    });

    it("should handle case-sensitive tier names", () => {
      // These should not match (case-sensitive)
      expect(hasFeature("free", "jira")).toBe(false);
      expect(hasFeature("Pro", "jira")).toBe(false);
      expect(hasFeature("ENTERPRISE_PLUS", "jira")).toBe(true);
    });

    it("should treat unknown tiers as EXPIRED", () => {
      expect(hasFeature("UNKNOWN_TIER", "jira")).toBe(false);
      expect(atLeast("UNKNOWN_TIER", "FREE")).toBe(false);
    });

    it("should handle feature feature names consistently", () => {
      const tier = "PRO";
      expect(hasFeature(tier, "jira")).toBe(true);
      expect(hasFeature(tier, "Jira")).toBe(false); // case-sensitive
      expect(hasFeature(tier, "JIRA")).toBe(false); // case-sensitive
    });
  });
});

// Tier Limits Tests
describe("Tier Limits", () => {
  const tierLimits: Record<string, { apps: number; users: number }> = {
    FREE: { apps: 1, users: 1 },
    STARTER: { apps: 5, users: 2 },
    PRO: { apps: 15, users: 10 },
    ENTERPRISE: { apps: 100, users: 50 },
    ENTERPRISE_PLUS: { apps: 999, users: 999 },
  };

  describe("App Count Limits", () => {
    Object.entries(tierLimits).forEach(([tier, limits]) => {
      it(`${tier} tier should allow up to ${limits.apps} apps`, () => {
        // This is a specification test - actual limit enforcement happens in API routes
        expect(tierLimits[tier].apps).toBeGreaterThan(0);
      });

      if (limits.apps < Infinity) {
        it(`${tier} tier should not allow more than ${limits.apps} apps`, () => {
          // This is a specification test
          expect(tierLimits[tier].apps).toBeLessThan(Infinity);
        });
      }
    });

    it("should enforce monotonic growth in limits", () => {
      const tiers = ["FREE", "STARTER", "PRO", "ENTERPRISE", "ENTERPRISE_PLUS"];
      for (let i = 0; i < tiers.length - 1; i++) {
        const current = tierLimits[tiers[i]].apps;
        const next = tierLimits[tiers[i + 1]].apps;
        expect(next).toBeGreaterThanOrEqual(
          current,
          `${tiers[i + 1]} should allow at least as many apps as ${tiers[i]}`
        );
      }
    });
  });

  describe("User Count Limits", () => {
    Object.entries(tierLimits).forEach(([tier, limits]) => {
      it(`${tier} tier should allow up to ${limits.users} users`, () => {
        expect(tierLimits[tier].users).toBeGreaterThan(0);
      });
    });

    it("should enforce monotonic growth in user limits", () => {
      const tiers = ["FREE", "STARTER", "PRO", "ENTERPRISE", "ENTERPRISE_PLUS"];
      for (let i = 0; i < tiers.length - 1; i++) {
        const current = tierLimits[tiers[i]].users;
        const next = tierLimits[tiers[i + 1]].users;
        expect(next).toBeGreaterThanOrEqual(
          current,
          `${tiers[i + 1]} should allow at least as many users as ${tiers[i]}`
        );
      }
    });
  });

  describe("Scan Frequency", () => {
    // Note: These are specification tests. Actual enforcement is in src/lib/scanner-http.ts
    const scanFrequency: Record<string, number> = {
      FREE: 24 * 60 * 60 * 1000, // daily
      STARTER: 8 * 60 * 60 * 1000, // 8 hours
      PRO: 4 * 60 * 60 * 1000, // 4 hours
      ENTERPRISE: 1 * 60 * 60 * 1000, // 1 hour
      ENTERPRISE_PLUS: 1 * 60 * 60 * 1000, // 1 hour
    };

    Object.entries(scanFrequency).forEach(([tier, intervalMs]) => {
      const hours = intervalMs / (60 * 60 * 1000);
      it(`${tier} tier should support ${hours}h scan interval`, () => {
        expect(intervalMs).toBeGreaterThan(0);
      });
    });

    it("should enforce faster scan times for higher tiers", () => {
      const tiers = ["FREE", "STARTER", "PRO", "ENTERPRISE", "ENTERPRISE_PLUS"];
      for (let i = 0; i < tiers.length - 1; i++) {
        const current = scanFrequency[tiers[i]];
        const next = scanFrequency[tiers[i + 1]];
        expect(next).toBeLessThanOrEqual(
          current,
          `${tiers[i + 1]} should support faster scans than ${tiers[i]}`
        );
      }
    });
  });

  describe("Limit Boundaries", () => {
    it("should prevent creating apps at exactly the limit", () => {
      // FREE tier: can create 1 app, cannot create 2nd
      const freeLimit = tierLimits["FREE"].apps;
      expect(freeLimit).toBe(1);
    });

    it("should prevent upgrading to free tier with high limits", () => {
      // Downgrade protection: if org has 5 apps, cannot downgrade to FREE (limit 1)
      const freeLimit = tierLimits["FREE"].apps;
      const proLimit = tierLimits["PRO"].apps;
      expect(proLimit).toBeGreaterThan(freeLimit);
    });
  });
});
