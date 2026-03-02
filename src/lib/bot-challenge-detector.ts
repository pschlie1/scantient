/**
 * Detects bot protection challenges from HTTP responses.
 * Returns the provider name if challenged, null if clean.
 */
export type BotProvider = "vercel" | "cloudflare" | "aws-waf" | "ddos-guard" | "generic";

export interface BotChallengeResult {
  challenged: boolean;
  provider: BotProvider | null;
  confidence: "high" | "medium";
}

export function detectBotChallenge(
  status: number,
  headers: Headers,
  bodySnippet: string,
): BotChallengeResult {
  // Vercel bot challenge
  if (headers.get("x-vercel-mitigated") === "challenge") {
    return { challenged: true, provider: "vercel", confidence: "high" };
  }

  // Cloudflare — challenge or managed challenge
  const cfMitigated = headers.get("cf-mitigated");
  if (cfMitigated === "challenge") {
    return { challenged: true, provider: "cloudflare", confidence: "high" };
  }
  if (status === 403 && /cf-browser-verification|cloudflare|__cf_bm/i.test(bodySnippet)) {
    return { challenged: true, provider: "cloudflare", confidence: "medium" };
  }

  // AWS WAF
  if (headers.get("x-amzn-waf-action") === "CAPTCHA" || /aws[- ]waf/i.test(bodySnippet)) {
    return { challenged: true, provider: "aws-waf", confidence: "high" };
  }

  // DDoS-Guard
  if (headers.get("server") === "ddos-guard") {
    return { challenged: true, provider: "ddos-guard", confidence: "high" };
  }

  // Generic: 403 with very short body (typical of challenge pages)
  if (
    status === 403 &&
    bodySnippet.length < 2000 &&
    /security|challenge|captcha|checking|bot/i.test(bodySnippet)
  ) {
    return { challenged: true, provider: "generic", confidence: "medium" };
  }

  return { challenged: false, provider: null, confidence: "high" };
}
