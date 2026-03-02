import { describe, expect, it } from "vitest";
import { createAppSchema } from "@/lib/types";

describe("createAppSchema", () => {
  it("validates a correct app input", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "https://example.com",
      ownerEmail: "owner@example.com",
      criticality: "high",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid URL", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "not-a-url",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "https://example.com",
      ownerEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("applies default criticality", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "https://example.com",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.criticality).toBe("medium");
    }
  });
});

// ── URL protocol validation (audit-15: H3 fix) ──────────────────────────────
describe("createAppSchema — strict URL protocol enforcement", () => {
  it("rejects file:// URLs", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "file:///etc/passwd",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects ftp:// URLs", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "ftp://files.example.com",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects data: URLs", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "data:text/html,<h1>hello</h1>",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts http:// URLs", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "http://example.com",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts https:// URLs", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "https://example.com/path?q=1",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(true);
  });
});

// ── String length limits (audit-15: M1 fix) ─────────────────────────────────
describe("createAppSchema — string length limits", () => {
  it("rejects app name over 100 characters", () => {
    const result = createAppSchema.safeParse({
      name: "A".repeat(101),
      url: "https://example.com",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts app name at exactly 100 characters", () => {
    const result = createAppSchema.safeParse({
      name: "A".repeat(100),
      url: "https://example.com",
      ownerEmail: "owner@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects ownerName over 100 characters", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "https://example.com",
      ownerEmail: "owner@example.com",
      ownerName: "N".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts ownerName at exactly 100 characters", () => {
    const result = createAppSchema.safeParse({
      name: "Test App",
      url: "https://example.com",
      ownerEmail: "owner@example.com",
      ownerName: "N".repeat(100),
    });
    expect(result.success).toBe(true);
  });
});
