/**
 * color-token.mjs
 * 
 * Custom ESLint rule: enforce semantic color tokens.
 * Bans raw hex/rgb/hsl colors and Tailwind color utilities.
 * Requires use of color constants from design-tokens.ts
 * 
 * GOOD:   className={`bg-[${colors.success}]`}  or style={{ color: colors.error }}
 * BAD:    className="bg-red-500 text-[#10b981]"
 *         style={{ backgroundColor: "#ef4444" }}
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
    const colorUtilPattern = /^(text|bg|border|ring|outline|shadow)-/;
    const hexPattern = /#[0-9a-fA-F]{3,8}/;
    const rgbPattern = /rgba?\s*\(/;
    const hslPattern = /hsla?\s*\(/;

    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" && node.name.name !== "class") {
          return;
        }

        const value = node.value?.value;
        if (!value || typeof value !== "string") {
          return;
        }

        // Check for color utilities
        const classes = value.split(/\s+/);
        const colorViolations = classes.filter((cls) =>
          colorUtilPattern.test(cls)
        );

        if (colorViolations.length > 0) {
          context.report({
            node,
            message: `Color utilities are not allowed: ${colorViolations.join(
              ", "
            )}. Import 'colors' from design-tokens.ts and use semantic tokens instead.`,
          });
        }
      },

      // Check inline styles for hardcoded colors
      JSXExpressionContainer(node) {
        if (node.parent?.name?.name !== "style") {
          return;
        }

        const code = context.sourceCode.getText(node);

        if (hexPattern.test(code) || rgbPattern.test(code) || hslPattern.test(code)) {
          context.report({
            node,
            message:
              "Hardcoded colors (#hex, rgb, hsl) are not allowed. Use color constants from design-tokens.ts instead.",
          });
        }
      },
    };
  },
};
