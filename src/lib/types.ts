import { z } from "zod";
import { urlSchema } from "@/lib/validation";

export const createAppSchema = z.object({
  name: z.string().min(2).max(100, "App name must be 100 characters or fewer"),
  url: urlSchema,
  ownerEmail: z.string().email(),
  ownerName: z.string().max(100, "Owner name must be 100 characters or fewer").optional(),
  criticality: z.enum(["low", "medium", "high"]).default("medium"),
  probeUrl: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .pipe(z.string().url("Probe URL must be a valid URL").optional()),
  probeToken: z
    .string()
    .max(256, "Probe token must be 256 characters or fewer")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type CreateAppInput = z.infer<typeof createAppSchema>;

export type SecurityFinding = {
  code: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  fixPrompt: string;
};

/**
 * Summary of auth surface endpoints discovered during a Tier 1 auth scan.
 * Added to scan results and stored in MonitorRun.discoveredEndpointCount.
 */
export type DiscoveredEndpointsSummary = {
  count: number;
  categories: Record<string, number>; // e.g. { auth: 3, api: 5, admin: 1 }
  framework?: string;
};
