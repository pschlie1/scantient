/**
 * spacing-token.mjs
 * 
 * Custom ESLint rule: enforce semantic spacing tokens.
 * Bans raw Tailwind spacing utilities (mt-1, px-4, gap-2, etc.)
 * Requires use of spacing constants from design-tokens.ts
 * 
 * GOOD:   className={`mt-[${spacing.md}]`}  or className="mt-custom"
 * BAD:    className="mt-4 px-6 gap-3"
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce semantic spacing tokens instead of raw Tailwind utilities",
      category: "Design System",
      recommended: "error",
    },
  },
  create(context) {
    const spacingUtilPattern = /^(m|p|gap|space|inset)(-[a-z]+-)?-\d+$/;
    
    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" && node.name.name !== "class") {
          return;
        }

        const value = node.value?.value;
        if (!value || typeof value !== "string") {
          return;
        }

        // Split className string by whitespace
        const classes = value.split(/\s+/);
        const violations = classes.filter((cls) => spacingUtilPattern.test(cls));

        if (violations.length > 0) {
          context.report({
            node,
            message: `Spacing utilities are not allowed: ${violations.join(
              ", "
            )}. Import 'spacing' from design-tokens.ts and use semantic tokens instead (e.g., spacing.md, spacing.lg).`,
          });
        }
      },
    };
  },
};
