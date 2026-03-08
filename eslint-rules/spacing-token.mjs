/**
 * spacing-token.mjs
 *
 * Custom ESLint rule: enforce semantic spacing tokens.
 * Bans raw Tailwind spacing utilities (mt-1, px-4, gap-2, etc.)
 * Requires use of Tailwind's spacing scale via design system conventions.
 *
 * GOOD:   className="mt-4 px-6 gap-3" (using Tailwind spacing scale)
 * BAD:    className="mt-[37px]" (arbitrary non-standard values)
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce consistent spacing by banning non-standard arbitrary values",
      category: "Design System",
      recommended: "warn",
    },
  },
  create(context) {
    // Only ban truly arbitrary pixel values that don't align with the spacing scale
    const arbitrarySpacingPattern =
      /^(m|p|gap|space|inset)(-[a-z]+)?-\[\d+px\]$/;

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
        const violations = classes.filter((cls) =>
          arbitrarySpacingPattern.test(cls)
        );

        if (violations.length > 0) {
          context.report({
            node,
            message: `Arbitrary pixel spacing is not recommended: ${violations.join(
              ", "
            )}. Use Tailwind's standard spacing scale (e.g., mt-4, px-6, gap-3) for consistency.`,
          });
        }
      },
    };
  },
};
