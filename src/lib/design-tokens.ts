/**
 * design-tokens.ts
 * 
 * Canonical design tokens for Scantient.
 * All UI must use these constants — never hardcode spacing, colors, or typography.
 * 
 * Enforced by:
 * - Custom ESLint rules (spacing-token, color-token, typography-token)
 * - Pre-commit hooks (npm run lint:design-system:staged)
 * - CI gates (npm run lint:design-system)
 */

// ─── Spacing (semantic tokens) ───────────────────────────────────────────────
export const spacing = {
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "1rem", // 16px
  lg: "1.5rem", // 24px
  xl: "2rem", // 32px
  "2xl": "3rem", // 48px
} as const;

// ─── Color Palette ───────────────────────────────────────────────────────────
export const colors = {
  // Semantic colors (use these, not raw hex)
  success: "#10b981", // green
  warning: "#f59e0b", // amber
  error: "#ef4444", // red
  info: "#3b82f6", // blue
  
  // Neutral palette
  white: "#ffffff",
  black: "#000000",
  
  // Gray scale (use for text, borders, backgrounds)
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },
} as const;

// ─── Typography (use these constants, never raw font sizes) ────────────────
export const typography = {
  // Heading sizes
  h1: { fontSize: "2.25rem", fontWeight: "700", lineHeight: "2.5rem" }, // 36px
  h2: { fontSize: "1.875rem", fontWeight: "700", lineHeight: "2.25rem" }, // 30px
  h3: { fontSize: "1.5rem", fontWeight: "700", lineHeight: "2rem" }, // 24px
  h4: { fontSize: "1.25rem", fontWeight: "600", lineHeight: "1.75rem" }, // 20px
  
  // Body text
  body: { fontSize: "1rem", fontWeight: "400", lineHeight: "1.5rem" }, // 16px
  bodySmall: { fontSize: "0.875rem", fontWeight: "400", lineHeight: "1.25rem" }, // 14px
  bodyTiny: { fontSize: "0.75rem", fontWeight: "400", lineHeight: "1rem" }, // 12px
  
  // Emphasis
  label: { fontSize: "0.875rem", fontWeight: "600", lineHeight: "1.25rem" }, // 14px, semibold
  caption: { fontSize: "0.75rem", fontWeight: "500", lineHeight: "1rem" }, // 12px, medium
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────
export const radius = {
  none: "0",
  sm: "0.25rem", // 4px
  md: "0.375rem", // 6px
  lg: "0.5rem", // 8px
  xl: "0.75rem", // 12px
  full: "9999px",
} as const;

// ─── Shadow Elevation ───────────────────────────────────────────────────────
export const elevation = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
} as const;

// ─── Transitions (animation timing) ──────────────────────────────────────────
export const transitions = {
  fast: "150ms ease-in-out",
  normal: "250ms ease-in-out",
  slow: "350ms ease-in-out",
} as const;

// ─── Component Defaults ──────────────────────────────────────────────────────
export const components = {
  button: {
    paddingX: spacing.md,
    paddingY: spacing.sm,
    radius: radius.md,
    fontWeight: "600",
  },
  input: {
    paddingX: spacing.md,
    paddingY: spacing.sm,
    radius: radius.md,
    borderColor: colors.gray[300],
    focusBorderColor: colors.info,
  },
  card: {
    padding: spacing.lg,
    radius: radius.lg,
    borderColor: colors.gray[200],
    shadow: elevation.md,
  },
} as const;
