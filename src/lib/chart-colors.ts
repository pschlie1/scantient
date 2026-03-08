/**
 * chart-colors.ts
 *
 * Hex color constants for recharts, canvas, and other contexts
 * that cannot use CSS custom properties.
 *
 * For all other UI, use Tailwind semantic classes:
 * bg-page, bg-surface, text-heading, text-muted, border-border, etc.
 * defined in globals.css @theme block.
 */
export const chartColors = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#778da9",
  healthy: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  primary: "#415a77",
  surface: "#1b263b",
  border: "#415a77",
  text: "#e0e1dd",
  muted: "#8a9bb5",
} as const;
