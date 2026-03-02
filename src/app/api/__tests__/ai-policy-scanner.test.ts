/**
 * ai-policy-scanner.test.ts
 *
 * Tests for the AI Policy Scanner feature (Item 8).
 * Covers:
 *   - checkAITools() detection logic across all 5 vectors
 *   - parseAiPolicyMeta() helper
 *   - isAiFinding() helper
 *   - Finding structure (code, severity, description JSON)
 */

import { describe, expect, it } from "vitest";
import {
  checkAITools,
  isAiFinding,
  parseAiPolicyMeta,
  AI_TOOLS,
} from "@/lib/ai-policy-scanner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

const emptyHeaders = makeHeaders({});
const emptyHtml = "";
const emptyJs: string[] = [];

// ─── isAiFinding ─────────────────────────────────────────────────────────────

describe("isAiFinding", () => {
  it("returns true for AI_TOOL_DETECTED code", () => {
    expect(isAiFinding("AI_TOOL_DETECTED")).toBe(true);
  });

  it("returns false for other codes", () => {
    expect(isAiFinding("MISSING_HEADER_CONTENT_SECURITY_POLICY")).toBe(false);
    expect(isAiFinding("EXPOSED_API_KEY")).toBe(false);
    expect(isAiFinding("")).toBe(false);
  });
});

// ─── parseAiPolicyMeta ────────────────────────────────────────────────────────

describe("parseAiPolicyMeta", () => {
  it("parses valid JSON description", () => {
    const meta = {
      aiTool: "OpenAI",
      detectedVia: "CSP header",
      evidence: "Domain openai.com in CSP",
      policyStatus: "unclassified" as const,
      recommendation: "Classify this tool",
    };
    const result = parseAiPolicyMeta(JSON.stringify(meta));
    expect(result).toEqual(meta);
  });

  it("returns null for non-JSON description", () => {
    expect(parseAiPolicyMeta("plain text description")).toBeNull();
  });

  it("returns null for JSON missing required fields", () => {
    expect(parseAiPolicyMeta(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAiPolicyMeta("")).toBeNull();
  });
});

// ─── checkAITools — no detections ─────────────────────────────────────────────

describe("checkAITools — no AI tools present", () => {
  it("returns empty array for clean page", () => {
    const findings = checkAITools(emptyHtml, emptyHeaders, emptyJs);
    expect(findings).toHaveLength(0);
  });

  it("returns empty array for unrelated CSP headers", () => {
    const headers = makeHeaders({
      "content-security-policy": "default-src 'self'; script-src 'self' https://cdn.example.com",
    });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    expect(findings).toHaveLength(0);
  });
});

// ─── checkAITools — CSP header detection ────────────────────────────────────

describe("checkAITools — CSP header vector", () => {
  it("detects OpenAI via CSP connect-src domain", () => {
    const headers = makeHeaders({
      "content-security-policy":
        "default-src 'self'; connect-src 'self' https://api.openai.com",
    });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("AI_TOOL_DETECTED");
    expect(findings[0].severity).toBe("MEDIUM");
    expect(findings[0].title).toContain("OpenAI");

    const meta = parseAiPolicyMeta(findings[0].description);
    expect(meta).not.toBeNull();
    expect(meta!.aiTool).toBe("OpenAI");
    expect(meta!.policyStatus).toBe("unclassified");
    expect(meta!.detectedVia).toContain("Content-Security-Policy");
  });

  it("detects Anthropic via CSP bare domain", () => {
    const headers = makeHeaders({
      "content-security-policy": "connect-src 'self' api.anthropic.com",
    });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    const anthropicFindings = findings.filter((f) => f.title.includes("Anthropic"));
    expect(anthropicFindings).toHaveLength(1);
  });

  it("detects Hugging Face via CSP wildcard subdomain", () => {
    const headers = makeHeaders({
      "content-security-policy":
        "connect-src 'self' https://api-inference.huggingface.co",
    });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    const hfFindings = findings.filter((f) => f.title.includes("Hugging Face"));
    expect(hfFindings).toHaveLength(1);
  });

  it("detects multiple AI tools from a single CSP", () => {
    const headers = makeHeaders({
      "content-security-policy":
        "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.cohere.ai",
    });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    const toolNames = findings.map((f) => {
      const meta = parseAiPolicyMeta(f.description);
      return meta?.aiTool;
    });
    expect(toolNames).toContain("OpenAI");
    expect(toolNames).toContain("Anthropic");
    expect(toolNames).toContain("Cohere");
  });
});

// ─── checkAITools — script src detection ─────────────────────────────────────

describe("checkAITools — script-src vector", () => {
  it("detects OpenAI SDK script tag", () => {
    const html = `<html><head>
      <script src="https://openai.com/scripts/sdk.js"></script>
    </head><body></body></html>`;
    const findings = checkAITools(html, emptyHeaders, emptyJs);
    const openaiFindings = findings.filter((f) => f.title.includes("OpenAI"));
    expect(openaiFindings).toHaveLength(1);

    const meta = parseAiPolicyMeta(openaiFindings[0].description);
    expect(meta!.detectedVia).toContain("script");
  });

  it("detects Stability AI from script src", () => {
    const html = `<script src="https://api.stability.ai/v1/generation"></script>`;
    const findings = checkAITools(html, emptyHeaders, emptyJs);
    const stabilityFindings = findings.filter((f) => f.title.includes("Stability"));
    expect(stabilityFindings).toHaveLength(1);
  });
});

// ─── checkAITools — HTML fetch reference detection ───────────────────────────

describe("checkAITools — html-fetch vector", () => {
  it("detects OpenAI from inline fetch call in HTML", () => {
    const html = `<html><body>
      <script>
        fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
      </script>
    </body></html>`;
    const findings = checkAITools(html, emptyHeaders, emptyJs);
    const openaiFindings = findings.filter((f) => f.title.includes("OpenAI"));
    expect(openaiFindings).toHaveLength(1);
    const meta = parseAiPolicyMeta(openaiFindings[0].description);
    expect(meta!.detectedVia).toContain("HTML");
  });

  it("detects Cohere from inline reference in HTML", () => {
    const html = `<script>const url = "https://api.cohere.ai/generate";</script>`;
    const findings = checkAITools(html, emptyHeaders, emptyJs);
    const cohereFindings = findings.filter((f) => f.title.includes("Cohere"));
    expect(cohereFindings).toHaveLength(1);
  });

  it("detects Mistral AI from HTML reference", () => {
    const html = `<script>const endpoint = "https://api.mistral.ai/v1/chat/completions";</script>`;
    const findings = checkAITools(html, emptyHeaders, emptyJs);
    const mistralFindings = findings.filter((f) => f.title.includes("Mistral"));
    expect(mistralFindings).toHaveLength(1);
  });
});

// ─── checkAITools — JS bundle detection ─────────────────────────────────────

describe("checkAITools — js-bundle vector", () => {
  it("detects OpenAI from API URL in JS bundle", () => {
    const js = [
      `const client = new OpenAI({ baseURL: "https://api.openai.com/v1" });`,
    ];
    const findings = checkAITools(emptyHtml, emptyHeaders, js);
    const openaiFindings = findings.filter((f) => f.title.includes("OpenAI"));
    expect(openaiFindings).toHaveLength(1);
    const meta = parseAiPolicyMeta(openaiFindings[0].description);
    expect(meta!.detectedVia).toContain("JavaScript bundle");
  });

  it("detects Anthropic SDK import in JS bundle", () => {
    const js = [`import Anthropic from '@anthropic-ai/sdk';`];
    const findings = checkAITools(emptyHtml, emptyHeaders, js);
    const anthropicFindings = findings.filter((f) => f.title.includes("Anthropic"));
    expect(anthropicFindings).toHaveLength(1);
  });

  it("detects Hugging Face inference API in JS bundle", () => {
    const js = [
      `const response = await fetch("https://api-inference.huggingface.co/models/gpt2");`,
    ];
    const findings = checkAITools(emptyHtml, emptyHeaders, js);
    const hfFindings = findings.filter((f) => f.title.includes("Hugging Face"));
    expect(hfFindings).toHaveLength(1);
  });

  it("detects Azure OpenAI from JS bundle", () => {
    const js = [
      `const endpoint = "https://my-resource.openai.azure.com/openai/deployments/gpt-4";`,
    ];
    const findings = checkAITools(emptyHtml, emptyHeaders, js);
    const azureFindings = findings.filter((f) => f.title.includes("Azure"));
    expect(azureFindings).toHaveLength(1);
  });
});

// ─── checkAITools — response header detection ────────────────────────────────

describe("checkAITools — response-header vector", () => {
  it("detects OpenAI proxy from x-powered-by header", () => {
    const headers = makeHeaders({ "x-powered-by": "openai-proxy/1.0" });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    const openaiFindings = findings.filter((f) => f.title.includes("OpenAI"));
    expect(openaiFindings).toHaveLength(1);
    const meta = parseAiPolicyMeta(openaiFindings[0].description);
    expect(meta!.detectedVia).toContain("HTTP response header");
  });

  it("detects Anthropic from via header", () => {
    const headers = makeHeaders({ via: "1.1 anthropic-gateway" });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    const anthropicFindings = findings.filter((f) => f.title.includes("Anthropic"));
    expect(anthropicFindings).toHaveLength(1);
  });
});

// ─── checkAITools — deduplication ────────────────────────────────────────────

describe("checkAITools — deduplication", () => {
  it("only creates one finding per AI tool even if detected in multiple vectors", () => {
    // OpenAI detected in both CSP AND JS bundle
    const headers = makeHeaders({
      "content-security-policy": "connect-src https://api.openai.com",
    });
    const js = [`fetch("https://api.openai.com/v1/chat/completions")`];
    const findings = checkAITools(emptyHtml, headers, js);
    const openaiFindings = findings.filter((f) => f.title.includes("OpenAI"));
    expect(openaiFindings).toHaveLength(1);
  });
});

// ─── Finding structure validation ─────────────────────────────────────────────

describe("checkAITools — finding structure", () => {
  it("produces findings with correct code and severity", () => {
    const headers = makeHeaders({
      "content-security-policy": "connect-src https://api.openai.com",
    });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.code).toBe("AI_TOOL_DETECTED");
      expect(f.severity).toBe("MEDIUM");
      expect(f.title).toContain("policy unclassified");
      expect(f.fixPrompt).toContain("AI Tool Policy Gap");
      expect(f.fixPrompt).toContain("data processing agreement");
    }
  });

  it("fixPrompt contains actionable steps", () => {
    const headers = makeHeaders({
      "content-security-policy": "connect-src https://api.anthropic.com",
    });
    const findings = checkAITools(emptyHtml, headers, emptyJs);
    expect(findings[0].fixPrompt).toContain("business justification");
    expect(findings[0].fixPrompt).toContain("data sent");
    expect(findings[0].fixPrompt).toContain("Set Policy");
  });
});

// ─── AI_TOOLS export ─────────────────────────────────────────────────────────

describe("AI_TOOLS catalog", () => {
  it("contains expected AI providers", () => {
    const names = AI_TOOLS.map((t) => t.name);
    expect(names).toContain("OpenAI");
    expect(names).toContain("Anthropic");
    expect(names).toContain("Hugging Face");
    expect(names).toContain("Cohere");
    expect(names).toContain("Stability AI");
    expect(names).toContain("Mistral AI");
    expect(names).toContain("Google AI / Gemini");
    expect(names).toContain("Azure OpenAI");
  });

  it("each tool has at least one domain", () => {
    for (const tool of AI_TOOLS) {
      expect(tool.domains.length).toBeGreaterThan(0);
    }
  });
});
