/**
 * form-wrapper.mjs
 *
 * Custom ESLint rule: enforce form wrapper components.
 * Bans raw <input>, <textarea>, <select> elements.
 * Requires use of shared form wrappers from @/components/ui/.
 *
 * GOOD:   <FormInput name="email" label="Email" />
 * BAD:    <input type="text" name="email" />
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce form wrapper components over raw input elements",
      category: "Design System",
      recommended: "error",
    },
  },
  create(context) {
    const bannedElements = ["input", "textarea", "select"];

    return {
      JSXOpeningElement(node) {
        if (!bannedElements.includes(node.name?.name)) {
          return;
        }

        // Ignore if it's a captcha or other special input
        const dataTestIdAttr = node.attributes?.find(
          (attr) =>
            attr.name?.name === "data-testid" &&
            (attr.value?.value?.includes("captcha") ||
              attr.value?.value?.includes("recaptcha"))
        );
        if (dataTestIdAttr) {
          return;
        }

        // Check for eslint-disable comment
        const sourceCode = context.sourceCode;
        const comments = sourceCode.getCommentsBefore(node);
        const hasDisable = comments.some(
          (c) =>
            c.value.includes("eslint-disable") &&
            c.value.includes("design-system/form-wrapper")
        );
        if (hasDisable) {
          return;
        }

        const elementType = node.name.name;
        const wrapperSuggestions = {
          input: "FormInput",
          textarea: "FormTextarea",
          select: "FormSelect",
        };

        context.report({
          node,
          message: `Raw <${elementType}> is not allowed. Use the <${wrapperSuggestions[elementType]}> component from '@/components/ui/' instead. This ensures consistent styling, validation, and accessibility.`,
        });
      },
    };
  },
};
