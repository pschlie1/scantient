/**
 * Tier 2 Subsystem Health Probe Client
 *
 * Calls a target app's /api/scantient-probe endpoint (or any configured probeUrl)
 * and returns structured health data about its subsystems.
 *
 * Protocol:
 *  - GET {probeUrl} with header X-Scan-Token: {probeToken}
 *  - Response must be JSON matching the ProbeResult schema
 *  - Timeout: 10 seconds
 *  - Uses ssrfSafeFetch to block SSRF attacks
 *
 * See docs/probe-spec.md for the full spec and example implementations.
 */

import { z } from "zod";
import { ssrfSafeFetch, isPrivateUrl } from "@/lib/ssrf-guard";

// ────────────────────────────────────────────
// Zod schema — validates the response from the probe endpoint
// ────────────────────────────────────────────

const SubsystemSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().optional(),
  depth: z.number().optional(),     // for queue subsystems
  provider: z.string().optional(),  // e.g. "stripe", "resend", "sendgrid"
  error: z.string().optional(),
});

export const ProbeResultSchema = z.object({
  ok: z.boolean(),
  respondedAt: z.string().datetime({ offset: true }),
  latencyMs: z.number(),
  subsystems: z
    .object({
      database: SubsystemSchema.optional(),
      auth: SubsystemSchema.optional(),
      payments: SubsystemSchema.optional(),
      email: SubsystemSchema.optional(),
      queue: SubsystemSchema.optional(),
      cache: SubsystemSchema.optional(),
    })
    .default({}),
  version: z.string().optional(),
  environment: z.string().optional(),
});

// ────────────────────────────────────────────
// TypeScript types (inferred from Zod schema)
// ────────────────────────────────────────────

export type SubsystemHealth = z.infer<typeof SubsystemSchema>;
export type ProbeResult = z.infer<typeof ProbeResultSchema>;

/**
 * The result returned by runProbe().
 * On failure, ok=false and error describes what went wrong.
 */
export type ProbeOutcome =
  | (ProbeResult & { ok: true })
  | {
      ok: false;
      respondedAt: string;
      latencyMs: number;
      error: string;
      subsystems: Record<string, never>;
    };

// ────────────────────────────────────────────
// Probe runner
// ────────────────────────────────────────────

/**
 * Call a target app's probe endpoint and return structured health data.
 *
 * @param probeUrl  - URL of the /api/scantient-probe endpoint
 * @param probeToken - Plaintext secret token (already decrypted by caller)
 * @returns ProbeOutcome — always resolves, never throws
 */
export async function runProbe(probeUrl: string, probeToken: string): Promise<ProbeOutcome> {
  const startMs = Date.now();

  const fail = (reason: string): ProbeOutcome => ({
    ok: false,
    respondedAt: new Date().toISOString(),
    latencyMs: Date.now() - startMs,
    error: reason,
    subsystems: {},
  });

  // SSRF guard: block private/internal URLs
  try {
    if (await isPrivateUrl(probeUrl)) {
      return fail("SSRF: probe URL resolves to a private/internal address");
    }
  } catch (err) {
    return fail(`SSRF check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let response: Response;
  try {
    response = await ssrfSafeFetch(
      probeUrl,
      {
        method: "GET",
        headers: {
          "X-Scan-Token": probeToken,
          "User-Agent": "Scantient/1.0 (Health Probe)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
      // maxRedirects: allow up to 3 hops (catches load balancer redirects)
      3,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg.includes("TimeoutError") ? "Probe timed out after 10s" : `Fetch error: ${msg}`);
  }

  const latencyMs = Date.now() - startMs;

  if (!response.ok) {
    return fail(`Probe endpoint returned HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fail("Probe endpoint returned invalid JSON");
  }

  // Validate the response shape
  const parsed = ProbeResultSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      `Probe response schema invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
    );
  }

  // Merge the measured latency — use the probe's self-reported value if present,
  // otherwise use our measured round-trip time.
  const result: ProbeResult = {
    ...parsed.data,
    latencyMs: parsed.data.latencyMs ?? latencyMs,
  };

  return { ...result, ok: true };
}
