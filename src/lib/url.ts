/**
 * URL utilities for safe rendering.
 */

/**
 * Return the URL only if it uses an http or https scheme.
 * Falls back to "#" for any other scheme (including `javascript:`, `data:`,
 * `vbscript:`, etc.) to prevent XSS via href injection.
 *
 * Use this whenever rendering a user-supplied URL in an <a href>.
 */
export function safeHref(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    // Invalid URL — fall through
  }
  return "#";
}
