# Design System Skill — Scantient

**Purpose:** Ensure all UI code follows Scantient's design contract. This skill routes design decisions through canonical tokens and enforcement gates.

## When to Use This Skill

- Building new UI surfaces (pages, modals, cards, forms)
- Styling components
- Any JSX with `className` or `style` attributes
- Form inputs or controls

**Do NOT route through this skill:** Config files, API routes, database schemas, non-visual logic.

---

## The Contract: 3 Layers

### 1. Spacing (Semantic Tokens Only)

**Rule:** All spacing must use semantic tokens from `design-tokens.ts`.

```typescript
import { spacing } from "@/lib/design-tokens";

// ✅ GOOD
<div className="p-4">  // Wait, this will fail lint. Use:
<div style={{ padding: spacing.md }}>Content</div>

// ✅ Also good (with Tailwind variable)
<div className={`p-[${spacing.md}]`}>Content</div>

// ❌ BAD — will fail pre-commit lint
<div className="mt-4 px-6 gap-2">Content</div>
```

**Tokens available:**
- `spacing.xs` — 4px (small gaps)
- `spacing.sm` — 8px (default small spacing)
- `spacing.md` — 16px (default padding/margin)
- `spacing.lg` — 24px (sections)
- `spacing.xl` — 32px (large sections)
- `spacing.2xl` — 48px (hero/major breaks)

**Pre-commit lint will catch:** any `mt-\d`, `mb-\d`, `px-\d`, `gap-\d`, etc.

---

### 2. Colors (Semantic Tokens Only)

**Rule:** All colors must use semantic tokens from `design-tokens.ts`. No hardcoded hex, rgb, or Tailwind color utilities.

```typescript
import { colors } from "@/lib/design-tokens";

// ✅ GOOD
<button style={{ backgroundColor: colors.success }}>Save</button>
<span style={{ color: colors.error }}>Error</span>
<div style={{ borderColor: colors.gray[300] }}>Card</div>

// ❌ BAD — will fail lint
<button style={{ backgroundColor: "#10b981" }}>Save</button>  // hardcoded hex
<span className="text-red-500">Error</span>  // Tailwind color utility
```

**Tokens available:**
- `colors.success` — #10b981 (green, for positive actions)
- `colors.warning` — #f59e0b (amber, for caution)
- `colors.error` — #ef4444 (red, for errors)
- `colors.info` — #3b82f6 (blue, for info)
- `colors.gray[50-900]` — grays from white to nearly black
- `colors.white`, `colors.black`

**Pre-commit lint will catch:** hex values, rgb(), hsl(), and color-name utilities (text-red-500, bg-green-400, etc.).

---

### 3. Form Inputs (Wrapper Components Only)

**Rule:** Never use raw `<input>`, `<textarea>`, or `<select>`. Use wrapper components from `src/components/form/`.

```typescript
import { FormInput } from "@/components/form/input";
import { FormTextarea } from "@/components/form/textarea";

// ✅ GOOD
<FormInput 
  name="email" 
  label="Email Address" 
  type="email"
  required
/>

// ❌ BAD — will fail lint
<input type="email" name="email" placeholder="Email" />
```

**Why?** Wrapper components enforce:
- Consistent styling (uses design tokens)
- Built-in validation UI
- Accessibility (labels, ARIA attributes, error states)
- Form integration (react-hook-form, etc.)

**Available wrappers:**
- `FormInput` — for text, email, password, number, etc.
- `FormTextarea` — for multi-line text
- `FormSelect` — for dropdowns
- `FormCheckbox` — for checkboxes
- `FormRadio` — for radio buttons

---

## Typography (Reference)

Use typography constants in component styling. Always import from `design-tokens.ts`:

```typescript
import { typography } from "@/lib/design-tokens";

// ✅ For dynamic headings
<h1 style={typography.h1}>Page Title</h1>

// ✅ For body text
<p style={typography.body}>Regular paragraph</p>
<p style={typography.bodySmall}>Smaller text</p>
```

---

## Component Defaults

Reusable component styling is pre-configured in `design-tokens.ts`:

```typescript
import { components } from "@/lib/design-tokens";

// Button styling defaults
components.button.paddingX  // spacing.md
components.button.paddingY  // spacing.sm
components.button.radius    // radius.md

// Input field defaults
components.input.paddingX
components.input.paddingY
components.input.borderColor
components.input.focusBorderColor

// Card defaults
components.card.padding
components.card.radius
components.card.borderColor
components.card.shadow
```

---

## Local Enforcement: Pre-Commit Hook

Before you commit, the design-system lint runs on staged files:

```bash
npm run lint:design-system:staged
```

**What it checks:**
1. Spacing utilities (raw mt-/px-/gap-/etc.)
2. Color utilities and hardcoded colors
3. Raw form inputs

**If it fails:**
- Read the error message
- Fix the violation (use tokens)
- Re-stage and commit

---

## Remote Enforcement: CI Gate

The same lint runs on all PRs via CI. Violations block merge.

```bash
npm run lint:design-system
```

---

## Exception Policy

**Exceptions are allowed, but only with explicit markers.**

If you MUST violate a rule (rare), mark it inline:

```typescript
// eslint-disable-next-line design-system/spacing-token
// Reason: Magic offset needed to align with legacy fixed header height
<div className="mt-[72px]">Content</div>
```

**Every exception requires a reason.** Exceptions are audited quarterly and removed if stale.

---

## Scope

**Phase 1 (NOW) — Enforce NEW code only:**
- ✅ **Any NEW files created after 2026-03-04**
- ✅ **New JSX in existing files** (pre-commit catches just your staged changes)
- ❌ Existing code is **NOT** retroactively checked (grandfathered)

**Why?** 
Retrofitting 1,600+ violations across the codebase all at once is overwhelming. Instead, we enforce the contract on forward progress. Existing code gets migrated incrementally as areas are touched.

**Phase 2 (Coming) — Migrate on touch:**
When you refactor an existing file (for any reason), also update it to use design tokens.

**Phase 3 (Later) — Full retrofit:**
Once token migration covers 80%+ of the codebase, we can enforce 100% compliance in CI.

**Excluded from rules (all phases):**
- ❌ Admin surfaces (separate design pass planned)
- ❌ Legacy email templates (awaiting redesign)
- ❌ Third-party embedded widgets
- ❌ Generated code (`src/generated/*`)

---

## Workflow for Agents

When building UI in Scantient:

1. **Read this skill first** before writing any JSX.
2. **Import tokens** at the top of your file:
   ```typescript
   import { spacing, colors, typography } from "@/lib/design-tokens";
   ```
3. **Use tokens in all style expressions** (inline styles, className templates).
4. **Use form wrapper components** instead of raw inputs.
5. **Run pre-commit lint before committing:**
   ```bash
   npm run lint:design-system:staged
   ```
6. **Push your code.** CI will verify again.

If lint fails at any step, read the error, fix the violation, and re-run.

---

## Design Tokens Reference

See `src/lib/design-tokens.ts` for the complete, canonical reference. Keep this in sync with actual usage.

---

## Questions?

- **"Can I use a value not in the tokens?"** No. Add it to `design-tokens.ts` first, update this doc, then use it.
- **"Can I break the rules for a special case?"** Only with an inline exception marker + reason. Exceptions are audited.
- **"Which token should I use?"** Refer to the semantic name (spacing.lg, colors.error) and the comment in the file.

---

**Last Updated:** 2026-03-04  
**Scope:** Logged-in app + public pages  
**Enforced By:** Pre-commit hook + CI gate
