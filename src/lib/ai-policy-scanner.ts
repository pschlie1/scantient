/**
 * AI Policy Scanner
 *
 * Detects known AI tool fingerprints in a monitored app's HTTP response,
 * HTML content, JavaScript bundles, and CSP headers.
 *
 * If an AI tool is detected with no formal policy classification, a finding
 * of code AI_TOOL_DETECTED (severity MEDIUM) is created.
 *
 * Detection vectors:
 *   1. CSP header — connect-src / script-src domains mentioning AI providers
 *   2. HTML/JS script src — <script src="..."> pointing to AI CDN domains
 *   3. JS bundle content — fetch/XHR calls to AI API endpoints
 *   4. Response headers — x-powered-by or via headers revealing AI proxies
 */

import type { SecurityFinding } from "@/lib/types";

// ─── Known AI Tool Fingerprints ──────────────────────────────────────────────

export interface AiTool {
  /** Human-readable name, e.g. "OpenAI" */
  name: string;
  /** Domains that indicate this tool is in use */
  domains: string[];
  /** URL path fragments that indicate this tool */
  paths?: string[];
  /** Response header values that reveal this tool */
  headerHints?: string[];
}

export const AI_TOOLS: AiTool[] = [
  {
    name: "OpenAI",
    domains: ["openai.com", "api.openai.com", "oaidalleapiprodscus.blob.core.windows.net"],
    paths: ["/v1/chat/completions", "/v1/embeddings", "/v1/models"],
    headerHints: ["openai"],
  },
  {
    name: "Anthropic",
    domains: ["anthropic.com", "api.anthropic.com"],
    paths: ["/v1/messages", "/v1/complete"],
    headerHints: ["anthropic"],
  },
  {
    name: "Hugging Face",
    domains: ["huggingface.co", "api-inference.huggingface.co", "huggingface.spaces"],
    paths: ["/inference-api", "/models/"],
    headerHints: ["huggingface"],
  },
  {
    name: "Cohere",
    domains: ["cohere.ai", "cohere.com", "api.cohere.ai"],
    paths: ["/generate", "/embed", "/classify"],
    headerHints: ["cohere"],
  },
  {
    name: "Stability AI",
    domains: ["stability.ai", "api.stability.ai", "dreamstudio.ai"],
    paths: ["/v1/generation", "/v2beta/"],
    headerHints: ["stability"],
  },
  {
    name: "Mistral AI",
    domains: ["mistral.ai", "api.mistral.ai"],
    paths: ["/v1/chat/completions", "/v1/models"],
    headerHints: ["mistral"],
  },
  {
    name: "Google AI / Gemini",
    domains: [
      "generativelanguage.googleapis.com",
      "aiplatform.googleapis.com",
      "vertex.googleapis.com",
    ],
    paths: ["/v1/models/gemini", "/predict"],
    headerHints: ["google-ai"],
  },
  {
    name: "Azure OpenAI",
    domains: ["openai.azure.com"],
    paths: ["/openai/deployments/"],
    headerHints: ["azure-openai"],
  },
  {
    name: "Replicate",
    domains: ["replicate.com", "api.replicate.com"],
    paths: ["/v1/predictions"],
    headerHints: ["replicate"],
  },
  {
    name: "Together AI",
    domains: ["together.ai", "api.together.xyz"],
    paths: ["/inference", "/v1/chat/completions"],
    headerHints: ["together"],
  },
  {
    name: "Perplexity AI",
    domains: ["perplexity.ai", "api.perplexity.ai"],
    paths: ["/chat/completions"],
    headerHints: ["perplexity"],
  },
  {
    name: "ElevenLabs",
    domains: ["elevenlabs.io", "api.elevenlabs.io"],
    paths: ["/v1/text-to-speech"],
    headerHints: ["elevenlabs"],
  },
];

// ─── Detection Helpers ───────────────────────────────────────────────────────

interface Detection {
  tool: AiTool;
  vector: "csp-header" | "script-src" | "js-bundle" | "response-header" | "html-fetch";
  evidence: string;
}

/** Extract domains from a CSP header value */
function extractCspDomains(cspValue: string): string[] {
  const directives = cspValue.split(";");
  const domains: string[] = [];
  for (const dir of directives) {
    const parts = dir.trim().split(/\s+/);
    // Skip directive name (first part)
    for (const part of parts.slice(1)) {
      // Extract hostname from URL-like values ('https://example.com')
      try {
        const clean = part.replace(/^'/, "").replace(/'$/, "");
        if (clean.startsWith("http://") || clean.startsWith("https://")) {
          domains.push(new URL(clean).hostname);
        } else if (!clean.startsWith("'") && clean.includes(".")) {
          // Bare domain like "openai.com" or "*.openai.com"
          domains.push(clean.replace(/^\*\./, ""));
        }
      } catch {
        // ignore malformed entries
      }
    }
  }
  return domains;
}

/** Check if a hostname matches any domain in the tool's domain list */
function matchesDomain(hostname: string, tool: AiTool): boolean {
  return tool.domains.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
}

/** Build a SecurityFinding for a detected AI tool */
function buildAiToolFinding(detection: Detection): SecurityFinding {
  const vectorLabel: Record<Detection["vector"], string> = {
    "csp-header": "Content-Security-Policy header",
    "script-src": "JavaScript include (script src)",
    "js-bundle": "JavaScript bundle (fetch/XHR call)",
    "response-header": "HTTP response header",
    "html-fetch": "HTML inline fetch/XHR reference",
  };

  return {
    code: "AI_TOOL_DETECTED",
    title: `AI tool detected: ${detection.tool.name} (policy unclassified)`,
    description: JSON.stringify({
      aiTool: detection.tool.name,
      detectedVia: vectorLabel[detection.vector],
      evidence: detection.evidence,
      policyStatus: "unclassified",
      recommendation:
        `${detection.tool.name} was detected in your application via ${vectorLabel[detection.vector]}. ` +
        `No formal AI usage policy has been classified for this tool. ` +
        `This may indicate unreviewed AI data processing, potential data-residency issues, or uncovered liability.`,
    }),
    severity: "MEDIUM",
    fixPrompt:
      `AI Tool Policy Gap — ${detection.tool.name}\n\n` +
      `Detected via: ${vectorLabel[detection.vector]}\n` +
      `Evidence: ${detection.evidence}\n\n` +
      `Recommended actions:\n` +
      `1. Document the business justification for using ${detection.tool.name}.\n` +
      `2. Classify the data sent to this service (PII? PHI? Confidential?).\n` +
      `3. Review the vendor's data processing agreement and retention policies.\n` +
      `4. Add this tool to your AI/ML vendor inventory and acceptable-use policy.\n` +
      `5. Implement logging/auditing of requests sent to this AI service.\n` +
      `6. Use the "Set Policy" action in Scantient to document your classification.`,
  };
}

// ─── Main Exported Check Function ────────────────────────────────────────────

/**
 * Scan for AI tools in:
 *   - HTTP response headers (CSP, x-powered-by, via)
 *   - HTML script src attributes
 *   - JavaScript bundle content (fetch calls, require/import of AI SDKs)
 *
 * Returns one finding per unique AI tool detected.
 */
export function checkAITools(
  html: string,
  headers: Headers,
  jsPayloads: string[],
): SecurityFinding[] {
  const detections = new Map<string, Detection>(); // key = tool name (one finding per tool)

  // ── 1. CSP header ──────────────────────────────────────────────────────────
  const csp = headers.get("content-security-policy") ?? "";
  if (csp) {
    const cspDomains = extractCspDomains(csp);
    for (const tool of AI_TOOLS) {
      if (detections.has(tool.name)) continue;
      const matched = cspDomains.find((d) => matchesDomain(d, tool));
      if (matched) {
        detections.set(tool.name, {
          tool,
          vector: "csp-header",
          evidence: `Domain "${matched}" found in Content-Security-Policy`,
        });
      }
    }
  }

  // ── 2. Script src attributes in HTML ───────────────────────────────────────
  const scriptSrcs = Array.from(html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)).map(
    (m) => m[1],
  );

  for (const src of scriptSrcs) {
    let hostname: string;
    try {
      hostname = new URL(src).hostname;
    } catch {
      continue;
    }

    for (const tool of AI_TOOLS) {
      if (detections.has(tool.name)) continue;
      if (matchesDomain(hostname, tool)) {
        detections.set(tool.name, {
          tool,
          vector: "script-src",
          evidence: `<script src="${src}">`,
        });
      }
    }
  }

  // ── 3. HTML inline fetch/XHR patterns ─────────────────────────────────────
  for (const tool of AI_TOOLS) {
    if (detections.has(tool.name)) continue;

    // Look for API domain references in HTML (fetch calls, axios, etc.)
    // Pattern matches the domain anywhere inside a quoted string (accounts for subdomains)
    for (const domain of tool.domains) {
      const domainEscaped = domain.replace(/\./g, "\\.");
      const pattern = new RegExp(
        `["'\`][^"'\`]*${domainEscaped}[^"'\`]*["'\`]`,
        "i",
      );
      const match = pattern.exec(html);
      if (match) {
        detections.set(tool.name, {
          tool,
          vector: "html-fetch",
          evidence: `API domain reference "${match[0].slice(0, 80)}" in HTML`,
        });
        break;
      }
    }
  }

  // ── 4. JavaScript bundle content ───────────────────────────────────────────
  const allJs = jsPayloads.join("\n");
  for (const tool of AI_TOOLS) {
    if (detections.has(tool.name)) continue;

    // Check domain references in JS bundles
    // Pattern matches the domain anywhere inside a quoted string (accounts for subdomains)
    for (const domain of tool.domains) {
      const domainEscaped = domain.replace(/\./g, "\\.");
      const pattern = new RegExp(
        `["'\`][^"'\`]*${domainEscaped}[^"'\`]*["'\`]`,
        "i",
      );
      const match = pattern.exec(allJs);
      if (match) {
        detections.set(tool.name, {
          tool,
          vector: "js-bundle",
          evidence: `API domain reference "${match[0].slice(0, 80)}" in JavaScript bundle`,
        });
        break;
      }
    }

    // Also check for AI SDK import patterns
    if (!detections.has(tool.name)) {
      const sdkPatterns: Record<string, RegExp> = {
        OpenAI: /require\(["']openai["']\)|from\s+["']openai["']/,
        Anthropic: /require\(["']@anthropic-ai\/sdk["']\)|from\s+["']@anthropic-ai\/sdk["']/,
        "Hugging Face": /require\(["']@huggingface\/inference["']\)|from\s+["']@huggingface/,
        Cohere: /require\(["']cohere-ai["']\)|from\s+["']cohere-ai["']/,
        "Google AI / Gemini": /require\(["']@google\/generative-ai["']\)|from\s+["']@google\/generative-ai["']/,
        Mistral: /require\(["']@mistralai\/mistraljs["']\)|from\s+["']@mistralai/,
      };

      const sdkPattern = sdkPatterns[tool.name];
      if (sdkPattern && sdkPattern.test(allJs)) {
        detections.set(tool.name, {
          tool,
          vector: "js-bundle",
          evidence: `AI SDK import found for "${tool.name}" in JavaScript bundle`,
        });
      }
    }
  }

  // ── 5. Response headers ────────────────────────────────────────────────────
  const headerValues = [
    headers.get("x-powered-by") ?? "",
    headers.get("via") ?? "",
    headers.get("server") ?? "",
    headers.get("x-served-by") ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (const tool of AI_TOOLS) {
    if (detections.has(tool.name)) continue;

    const hintFound = tool.headerHints?.find((hint) => headerValues.includes(hint));
    if (hintFound) {
      detections.set(tool.name, {
        tool,
        vector: "response-header",
        evidence: `Header hint "${hintFound}" found in HTTP response headers`,
      });
    }
  }

  // ── Build findings ─────────────────────────────────────────────────────────
  return Array.from(detections.values()).map(buildAiToolFinding);
}

// ─── Policy Status Helpers ───────────────────────────────────────────────────

export type AiPolicyStatus = "unclassified" | "approved" | "restricted" | "prohibited";

export interface AiPolicyMeta {
  aiTool: string;
  detectedVia: string;
  evidence: string;
  policyStatus: AiPolicyStatus;
  recommendation: string;
}

/** Parse AI policy metadata from a finding description */
export function parseAiPolicyMeta(description: string): AiPolicyMeta | null {
  try {
    const parsed = JSON.parse(description) as AiPolicyMeta;
    if (parsed.aiTool && parsed.policyStatus) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Check if a finding code is an AI policy finding */
export function isAiFinding(code: string): boolean {
  return code === "AI_TOOL_DETECTED";
}
