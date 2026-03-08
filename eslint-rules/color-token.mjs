/**
 * color-token.mjs
 *
 * Custom ESLint rule: enforce semantic color tokens.
 * Allows: semantic classes (bg-page, bg-surface, text-heading, text-muted, border-border, etc.)
 *         custom palette classes (bg-ink-black-*, text-alabaster-grey-*, etc.)
 *         severity/status classes (bg-severity-*, bg-success, text-error, etc.)
 * Bans:   default Tailwind palette (bg-gray-*, bg-red-*, text-blue-*, etc.)
 *         hardcoded hex/rgb/hsl in inline styles
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce semantic color tokens instead of hardcoded colors",
      category: "Design System",
      recommended: "error",
    },
  },
  create(context) {
    const hexPattern = /#[0-9a-fA-F]{3,8}/;
    const rgbPattern = /rgba?\s*\(/;
    const hslPattern = /hsla?\s*\(/;

    // Default Tailwind color palette names to ban
    const bannedPalettes = [
      "gray", "slate", "zinc", "neutral", "stone",
      "red", "orange", "amber", "yellow", "lime", "green",
      "emerald", "teal", "cyan", "sky", "blue", "indigo",
      "violet", "purple", "fuchsia", "pink", "rose",
    ];

    // These standalone color classes are always allowed
    const alwaysAllowed = new Set([
      "text-white", "bg-white", "border-white",
      "text-black", "bg-black", "border-black",
      "text-transparent", "bg-transparent",
      "text-current", "bg-current",
    ]);

    // Pattern matches bg-gray-500, text-red-300, border-blue-200, ring-green-400, etc.
    const bannedColorPattern = new RegExp(
      `^(text|bg|border|ring|outline|shadow|from|to|via|divide|accent|caret|fill|stroke)-(${bannedPalettes.join("|")})([-/]|$)`
    );

    // Allowed semantic color classes
    const allowedPrefixes = [
      // Semantic tokens from globals.css @theme
      "page", "surface", "surface-raised", "border", "border-subtle",
      "heading", "body", "muted", "primary", "primary-hover",
      // Severity
      "severity-critical", "severity-high", "severity-medium", "severity-low",
      // Status
      "success", "warning", "error", "info",
      // Custom palette
      "ink-black-", "prussian-blue-", "dusk-blue-", "dusty-denim-", "alabaster-grey-",
    ];

    function isAllowedColorClass(cls) {
      const parts = cls.split("-");
      if (parts.length < 2) return true;

      // Extract the color portion after the utility prefix
      const prefix = parts[0];
      const colorUtilPrefixes = ["text", "bg", "border", "ring", "outline", "shadow", "from", "to", "via", "divide", "accent", "caret", "fill", "stroke"];
      if (!colorUtilPrefixes.includes(prefix)) return true;

      const colorPart = parts.slice(1).join("-");
      return allowedPrefixes.some((ap) => colorPart.startsWith(ap));
    }

    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" && node.name.name !== "class") {
          return;
        }

        const value = node.value?.value;
        if (!value || typeof value !== "string") {
          return;
        }

        const classes = value.split(/\s+/);
        const violations = classes.filter(
          (cls) =>
            bannedColorPattern.test(cls) &&
            !isAllowedColorClass(cls) &&
            !alwaysAllowed.has(cls)
        );

        if (violations.length > 0) {
          context.report({
            node,
            message: `Default Tailwind color utilities are not allowed: ${violations.join(
              ", "
            )}. Use semantic classes from globals.css @theme (e.g., bg-page, bg-surface, text-heading, text-muted, border-border).`,
          });
        }
      },

      // Check inline styles for hardcoded colors
      JSXExpressionContainer(node) {
        if (node.parent?.name?.name !== "style") {
          return;
        }

        const code = context.sourceCode.getText(node);

        // Allow rgba/hsla used for transparency (backdrop-blur, gradients)
        // Allow CSS custom properties var(--)
        // Allow gradient syntax
        if (code.includes("var(--") || code.includes("gradient") || code.includes("rgba") || code.includes("hsla")) {
          return;
        }

        if (
          hexPattern.test(code) ||
          rgbPattern.test(code) ||
          hslPattern.test(code)
        ) {
          context.report({
            node,
            message:
              "Hardcoded colors (#hex, rgb, hsl) are not allowed in inline styles. Use CSS custom properties from globals.css @theme or Tailwind semantic classes instead.",
          });
        }
      },
    };
  },
};
