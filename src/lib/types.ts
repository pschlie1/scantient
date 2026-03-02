import { z } from "zod";
import { urlSchema } from "@/lib/validation";

export const createAppSchema = z.object({
  name: z.string().min(2).max(100, "App name must be 100 characters or fewer"),
  url: urlSchema,
  ownerEmail: z.string().email(),
  ownerName: z.string().max(100, "Owner name must be 100 characters or fewer").optional(),
  criticality: z.enum(["low", "medium", "high"]).default("medium"),
});

export type CreateAppInput = z.infer<typeof createAppSchema>;

export type SecurityFinding = {
  code: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  fixPrompt: string;
};
