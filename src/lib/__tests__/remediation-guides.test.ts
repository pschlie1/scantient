import { describe, it, expect } from "vitest";
import { getRemediationGuide, getQuickFix, REMEDIATION_GUIDES } from "@/lib/remediation-guides";

describe("Remediation Guides", () => {
  it("returns guide for known finding codes", () => {
    const codes = [
      "EXPOSED_API_KEY",
      "CLIENT_SIDE_AUTH_BYPASS",
      "MISSING_HSTS",
      "PERMISSIVE_CORS",
    ];

    codes.forEach((code) => {
      const guide = getRemediationGuide(code);
      expect(guide).toBeDefined();
      expect(guide.title).toBeTruthy();
      expect(guide.steps).toBeInstanceOf(Array);
      expect(guide.steps.length).toBeGreaterThan(0);
    });
  });

  it("returns fallback guide for unknown finding code", () => {
    const guide = getRemediationGuide("UNKNOWN_CODE_XYZ");
    expect(guide.title).toBeDefined();
    expect(guide.steps).toBeInstanceOf(Array);
    expect(guide.steps.some((step) => step.includes("UNKNOWN_CODE_XYZ"))).toBe(
      true,
    );
  });

  it("all remediation steps are non-empty strings", () => {
    Object.entries(REMEDIATION_GUIDES).forEach(([code, guide]) => {
      expect(guide.title).toBeTruthy();
      expect(guide.steps.length).toBeGreaterThan(0);
      guide.steps.forEach((step) => {
        expect(typeof step).toBe("string");
        expect(step.trim().length).toBeGreaterThan(0);
      });
    });
  });

  it("getQuickFix returns the first step of remediation", () => {
    const guide = getRemediationGuide("EXPOSED_API_KEY");
    const quickFix = getQuickFix("EXPOSED_API_KEY");
    expect(quickFix).toBe(guide.steps[0]);
  });

  it("covers all major security categories", () => {
    const majorCategories = [
      // Auth & API
      "EXPOSED_API_KEY",
      "CLIENT_SIDE_AUTH_BYPASS",
      "AUTH_MISSING_CSRF",
      "AUTH_COOKIE_MISSING_FLAGS",
      // Headers
      "MISSING_HSTS",
      "MISSING_CSP_HEADER",
      // CORS
      "PERMISSIVE_CORS",
      "CORS_WILDCARD_CREDENTIALS",
      // Endpoints
      "ADMIN_ENDPOINT_UNAUTHED",
      "ADMIN_DEBUG_ENDPOINT_EXPOSED",
      // Files
      "DEPENDENCY_FILE_EXPOSED",
      "SENSITIVE_FILE_EXPOSED",
      // Dependencies
      "DEP_JQUERY_OUTDATED",
      // Performance & Content
      "PERF_REGRESSION_DOUBLED",
      "CONTENT_CHANGED",
      // SSL
      "SSL_CERT_EXPIRED",
      // Forms
      "FORM_GET_API_ENDPOINT",
      "FORM_PASSWORD_NO_CSRF",
    ];

    majorCategories.forEach((code) => {
      const guide = getRemediationGuide(code);
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.title).toMatch(
        /^[A-Z]/,
        `Title for ${code} should start with a capital letter`,
      );
    });
  });

  it("remediation steps are action-oriented (verb-first)", () => {
    const guide = getRemediationGuide("EXPOSED_API_KEY");
    const actionVerbs = [
      "Add",
      "Move",
      "Remove",
      "Check",
      "Verify",
      "Update",
      "Use",
      "Implement",
      "Deploy",
      "Test",
      "Find",
      "Identify",
      "Change",
      "Configure",
      "Disable",
      "Enable",
    ];

    guide.steps.forEach((step) => {
      const startsWithNumber = /^\d+\./.test(step);
      const hasActionVerb = actionVerbs.some((verb) =>
        step.slice(3).match(new RegExp(`^${verb}`)),
      );
      expect(startsWithNumber || hasActionVerb).toBe(
        true,
        `Step "${step.slice(0, 50)}" should start with a number or action verb`,
      );
    });
  });

  it("includes code examples where appropriate", () => {
    const codesWithExamples = [
      "AUTH_COOKIE_MISSING_FLAGS",
      "MISSING_HSTS",
      "MISSING_CSP_HEADER",
    ];

    codesWithExamples.forEach((code) => {
      const guide = getRemediationGuide(code);
      const steps = guide.steps.join(" ");
      // Check for code-like content: Example, code, braces, backticks, angle brackets
      expect(steps).toMatch(/[Ee]xample|code|[<>{`]/);
    });
  });
});
