/**
 * Shared Zod validation schemas.
 *
 * Import from this module to ensure consistency across API routes.
 * All user-facing inputs must be validated with Zod before use.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Strict HTTP/HTTPS URL — rejects file://, ftp://, data:, javascript:, etc.
 * Use this for any user-supplied URL that will be fetched or rendered.
 */
export const urlSchema = z
  .string()
  .url({ message: "Must be a valid URL" })
  .refine(
    (u) => {
      try {
        const { protocol } = new URL(u);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must use http:// or https:// protocol" },
  );

/** Email address */
export const emailSchema = z.string().email();

/** Non-empty string with trimming */
export const nonEmptyString = z.string().min(1).trim();

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Standard pagination query params.
 * Usage: `const { page, limit } = paginationSchema.parse({ page: sp.get("page"), limit: sp.get("limit") });`
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Finding status / severity enums
// ---------------------------------------------------------------------------

export const findingStatusSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "IGNORED",
]);

export const findingSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

// ---------------------------------------------------------------------------
// Date range (used by reporting endpoints)
// ---------------------------------------------------------------------------

export const dateRangeSchema = z
  .object({
    from: z.string().datetime({ message: "from must be an ISO 8601 datetime string" }),
    to: z.string().datetime({ message: "to must be an ISO 8601 datetime string" }),
  })
  .refine((d) => new Date(d.to) > new Date(d.from), {
    message: "'to' must be after 'from'",
  });
