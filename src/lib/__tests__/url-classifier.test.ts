/**
 * url-classifier.test.ts
 * Unit tests for the classifyUrl() URL context classifier.
 */
import { describe, expect, it } from "vitest";
import { classifyUrl } from "@/lib/scanner-http";
import type { UrlContext } from "@/lib/scanner-http";

describe("classifyUrl", () => {
  // ── API endpoints ────────────────────────────────────────────────────────

  it("classifies /api/* as api-endpoint", () => {
    expect(classifyUrl("https://example.com/api/users")).toBe<UrlContext>("api-endpoint");
  });

  it("classifies /api (root) as api-endpoint", () => {
    expect(classifyUrl("https://example.com/api")).toBe<UrlContext>("api-endpoint");
  });

  it("classifies /v1/* as api-endpoint", () => {
    expect(classifyUrl("https://example.com/v1/products")).toBe<UrlContext>("api-endpoint");
  });

  it("classifies /v2/* as api-endpoint", () => {
    expect(classifyUrl("https://example.com/v2/auth")).toBe<UrlContext>("api-endpoint");
  });

  it("classifies /graphql as api-endpoint", () => {
    expect(classifyUrl("https://example.com/graphql")).toBe<UrlContext>("api-endpoint");
  });

  it("classifies /rpc as api-endpoint", () => {
    expect(classifyUrl("https://example.com/rpc/query")).toBe<UrlContext>("api-endpoint");
  });

  // ── Health / monitoring endpoints ────────────────────────────────────────

  it("classifies /health as health-endpoint", () => {
    expect(classifyUrl("https://example.com/health")).toBe<UrlContext>("health-endpoint");
  });

  it("classifies /ping as health-endpoint", () => {
    expect(classifyUrl("https://example.com/ping")).toBe<UrlContext>("health-endpoint");
  });

  it("classifies /status as health-endpoint", () => {
    expect(classifyUrl("https://example.com/status")).toBe<UrlContext>("health-endpoint");
  });

  it("classifies /ready as health-endpoint", () => {
    expect(classifyUrl("https://example.com/ready")).toBe<UrlContext>("health-endpoint");
  });

  it("classifies /live as health-endpoint", () => {
    expect(classifyUrl("https://example.com/live")).toBe<UrlContext>("health-endpoint");
  });

  // ── Login pages ──────────────────────────────────────────────────────────

  it("classifies /login as login-page", () => {
    expect(classifyUrl("https://example.com/login")).toBe<UrlContext>("login-page");
  });

  it("classifies /signin as login-page", () => {
    expect(classifyUrl("https://example.com/signin")).toBe<UrlContext>("login-page");
  });

  it("classifies /sign-in as login-page", () => {
    expect(classifyUrl("https://example.com/sign-in")).toBe<UrlContext>("login-page");
  });

  it("classifies /auth/login as login-page", () => {
    expect(classifyUrl("https://example.com/auth/login")).toBe<UrlContext>("login-page");
  });

  // ── Admin pages ──────────────────────────────────────────────────────────

  it("classifies /admin as admin-page", () => {
    expect(classifyUrl("https://example.com/admin")).toBe<UrlContext>("admin-page");
  });

  it("classifies /admin/users as admin-page", () => {
    expect(classifyUrl("https://example.com/admin/users")).toBe<UrlContext>("admin-page");
  });

  it("classifies /management as admin-page", () => {
    expect(classifyUrl("https://example.com/management")).toBe<UrlContext>("admin-page");
  });

  // ── Homepage / catch-all ─────────────────────────────────────────────────

  it("classifies root / as homepage", () => {
    expect(classifyUrl("https://example.com/")).toBe<UrlContext>("homepage");
  });

  it("classifies marketing page as homepage", () => {
    expect(classifyUrl("https://example.com/pricing")).toBe<UrlContext>("homepage");
  });

  it("classifies blog post as homepage", () => {
    expect(classifyUrl("https://example.com/blog/my-post")).toBe<UrlContext>("homepage");
  });

  it("classifies dashboard app page as homepage", () => {
    expect(classifyUrl("https://example.com/dashboard")).toBe<UrlContext>("homepage");
  });

  it("handles unparseable URL gracefully (returns homepage)", () => {
    expect(classifyUrl("not-a-valid-url")).toBe<UrlContext>("homepage");
  });

  // ── Priority: API beats everything (API is matched first) ────────────────

  it("API path beats login in URL priority", () => {
    // /api/login is an API endpoint, not a login page
    expect(classifyUrl("https://example.com/api/login")).toBe<UrlContext>("api-endpoint");
  });
});
