/**
 * webhook-signature.test.ts
 *
 * Tests for HMAC-SHA256 webhook signature utilities.
 */

import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/webhook-signature";

describe("signWebhookPayload", () => {
  it("returns a sha256= prefixed string", () => {
    const sig = signWebhookPayload("hello", "secret");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("is deterministic for same payload and secret", () => {
    const payload = JSON.stringify({ event: "test", timestamp: "2026-01-01" });
    const secret = "mysecret";
    const sig1 = signWebhookPayload(payload, secret);
    const sig2 = signWebhookPayload(payload, secret);
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different payloads", () => {
    const secret = "mysecret";
    const sig1 = signWebhookPayload("payload-a", secret);
    const sig2 = signWebhookPayload("payload-b", secret);
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different secrets", () => {
    const payload = "same-payload";
    const sig1 = signWebhookPayload(payload, "secret1");
    const sig2 = signWebhookPayload(payload, "secret2");
    expect(sig1).not.toBe(sig2);
  });
});

describe("verifyWebhookSignature", () => {
  it("passes for a valid signature", () => {
    const payload = JSON.stringify({ event: "finding.critical" });
    const secret = "my-webhook-secret";
    const sig = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("fails for a tampered payload", () => {
    const payload = JSON.stringify({ event: "finding.critical" });
    const tamperedPayload = JSON.stringify({ event: "finding.critical", injected: true });
    const secret = "my-webhook-secret";
    const sig = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(tamperedPayload, sig, secret)).toBe(false);
  });

  it("fails for a wrong secret", () => {
    const payload = JSON.stringify({ event: "finding.critical" });
    const secret = "correct-secret";
    const wrongSecret = "wrong-secret";
    const sig = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, sig, wrongSecret)).toBe(false);
  });

  it("fails for an empty signature", () => {
    const payload = "test-payload";
    const secret = "secret";
    expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
  });

  it("fails for a completely wrong signature string", () => {
    const payload = "test-payload";
    const secret = "secret";
    expect(verifyWebhookSignature(payload, "sha256=aaaaaaaaaaaaa", secret)).toBe(false);
  });

  it("is case-sensitive on the signature", () => {
    const payload = "test-payload";
    const secret = "secret";
    const sig = signWebhookPayload(payload, secret);
    // Uppercase the hex — should fail
    const upperSig = sig.replace(/[a-f]/g, (c) => c.toUpperCase());
    // May or may not match depending on case — just ensure it's deterministic
    const result1 = verifyWebhookSignature(payload, sig, secret);
    expect(result1).toBe(true);
    if (sig !== upperSig) {
      expect(verifyWebhookSignature(payload, upperSig, secret)).toBe(false);
    }
  });
});
