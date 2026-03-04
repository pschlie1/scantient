# Scantient Design System — Setup & Enforcement

This directory contains Scantient's design system enforcement layer: tokens, rules, documentation, and automated checks.

## Files

- **`SKILL.md`** — Agent routing guide (read this first if you're writing UI)
- **`../src/lib/design-tokens.ts`** — Canonical design tokens (spacing, color, typography, etc.)
- **`../eslint-rules/`** — Custom ESLint rules for design compliance
- **`../.husky/pre-commit`** — Pre-commit hook that enforces design system locally

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will:
- Install `husky`
- Set up git hooks
- Enable the pre-commit design-system check

### 2. Create a UI Component

```typescript
// src/components/my-feature.tsx
import { spacing, colors, typography } from "@/lib/design-tokens";
import { FormInput } from "@/components/form/input";

export function MyFeature() {
  return (
    <div style={{ padding: spacing.md, backgroundColor: colors.gray[50] }}>
      <h2 style={typography.h2}>My Feature</h2>
      <FormInput name="email" label="Email" />
    </div>
  );
}
```

### 3. Commit Your Code

```bash
git add .
git commit -m "feat: add my feature"
```

The pre-commit hook runs automatically. If it passes, your commit succeeds. If it fails, read the error and fix the violation.

### 4. Push & Watch CI

When you push, GitHub Actions runs the same design-system lint on your PR. CI must pass before merge.

---

## Design System Layers

### 1. Tokens (Source of Truth)

All visual decisions are encoded in **`src/lib/design-tokens.ts`**:

```typescript
export const spacing = { xs: "0.25rem", sm: "0.5rem", md: "1rem", ... };
export const colors = { success: "#10b981", error: "#ef4444", ... };
export const typography = { h1: {...}, body: {...}, ... };
```

**Rule:** Never hardcode a value if it exists as a token.

### 2. Skill (Agent Routing)

**`SKILL.md`** tells agents when and how to use the design system.

When building UI, agents read `SKILL.md` and route through:
- Token imports
- Component wrappers (FormInput, not `<input>`)
- Spacing/color rules

### 3. Lint Rules (Automation)

Custom ESLint rules in **`../eslint-rules/`** detect violations:

- **`spacing-token.mjs`** — Bans raw Tailwind spacing utilities
- **`color-token.mjs`** — Bans hardcoded hex/rgb/hsl colors
- **`form-wrapper.mjs`** — Bans raw `<input>`, `<textarea>`, `<select>`

### 4. Pre-Commit Hook (Local Enforcement)

**`.husky/pre-commit`** runs staged-file lint before every commit.

```bash
# Automatic (runs when you commit)
git commit -m "feat: ..."

# Or manual
npm run lint:design-system:staged
```

### 5. CI Gate (Remote Enforcement)

GitHub Actions runs the same check on every PR. Violations block merge.

```bash
# This is what CI runs
npm run lint:design-system
```

---

## Common Workflows

### ✅ I'm Building a New Page

1. Read `SKILL.md` to understand spacing and color rules
2. Import tokens at the top:
   ```typescript
   import { spacing, colors, typography } from "@/lib/design-tokens";
   ```
3. Use them in all styles
4. Use form wrappers instead of raw inputs
5. Commit — pre-commit lint checks your code

### ✅ I Need a New Spacing Value

1. Add it to `src/lib/design-tokens.ts` (e.g., `spacing.3xl = "4rem"`)
2. Update `SKILL.md` with the new token
3. Use it immediately in your code
4. Commit

### ✅ I Found a Hardcoded Color

1. Look up the semantic color in `design-tokens.ts`
2. Replace it: `style={{ color: colors.error }}`
3. Commit

### ❌ I Need to Break a Rule

**Exceptions require inline markers + reasons.**

```typescript
// eslint-disable-next-line design-system/color-token
// Reason: Third-party widget requires exact hex color #abc123
<ThirdPartyWidget color="#abc123" />
```

Exceptions are audited quarterly and removed if stale.

---

## Testing the System

### Run Lint on All Files

```bash
npm run lint:design-system
```

### Run Lint on Staged Files Only

```bash
npm run lint:design-system:staged
```

### Check Specific File

```bash
npx eslint src/components/my-component.tsx --rule 'design-system/*: error'
```

---

## Troubleshooting

### Pre-commit Hook Didn't Run

Check that git hooks are installed:

```bash
ls -la .husky/
```

If `.husky/` is empty or missing, reinstall:

```bash
npm install
# or
npx husky install
```

### Lint Seems to Hang

The staged lint script pipes through grep. If there are no staged TypeScript files, it's fine—it exits silently.

### Rule Too Strict?

Check the scope in `SKILL.md`. Rules apply to:
- ✅ Logged-in app (`/dashboard/*`, `/apps/*`)
- ✅ Public pages (`/`, `/login`, `/signup`)
- ❌ NOT legacy surfaces or admin pages (yet)

If your file is in scope and you can't fix it, use an exception marker.

---

## Expanding the System

### Add a New Rule

1. Create `eslint-rules/my-rule.mjs` (copy from `spacing-token.mjs`)
2. Export it as default
3. Import and register in `eslint.config.mjs`
4. Document it in `SKILL.md`
5. Test: `npm run lint:design-system`

### Add a New Token Type

1. Add to `src/lib/design-tokens.ts`
2. Update `SKILL.md` with examples
3. Use in code
4. Consider adding a lint rule to enforce usage

### Change CI Gate Behavior

Update `.github/workflows/lint.yml` (if it exists) or add a new workflow that runs:

```bash
npm run lint:design-system
```

---

## Scope & Timeline

**Currently enforced:**
- Spacing tokens (all files with `className` or `style`)
- Color tokens (all files with `className` or `style`)
- Form wrappers (all components with `<input>`, `<textarea>`, `<select>`)

**Planned (Phase 2):**
- Typography tokens (enforce h1/h2/body constants)
- Shadow elevation tokens
- Border radius tokens

**Not yet in scope:**
- Admin surfaces (awaiting design refresh)
- Email templates (legacy)
- Third-party embeds (external rules)

---

## Questions?

- **Where do I find token values?** `src/lib/design-tokens.ts` — it's the source of truth.
- **Can I use a new color/spacing?** Add it to tokens first, then use it.
- **Why is my component failing lint?** Read the error message — it tells you which rule and which file. Fix it by using tokens.
- **What if I can't use tokens?** Mark it with an exception + reason (rare). Exceptions are audited.

---

## Philosophy

> **Consistency is not aspirational; it's automatic.**

If a violation can be detected (lint rule), it **will** be blocked:
- Locally (pre-commit)
- Remotely (CI)

The system makes compliance the path of least resistance. No memory required. No discipline needed. Just follow the rules, and your product stays consistent.

---

**Last Updated:** 2026-03-04  
**Version:** 1.0  
**Maintained By:** Dooder + Peter
