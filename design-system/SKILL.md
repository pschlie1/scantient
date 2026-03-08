# Design System Skill — Scantient

**Purpose:** Ensure all UI code follows Scantient's dark-first design contract using semantic Tailwind classes.

## When to Use This Skill

- Building new UI surfaces (pages, modals, cards, forms)
- Styling components
- Any JSX with `className` attributes
- Form inputs or controls

**Do NOT route through this skill:** Config files, API routes, database schemas, non-visual logic.

---

## The Contract: 3 Layers

### 1. Colors (Semantic Classes)

**Rule:** Use semantic Tailwind classes defined in `globals.css` @theme. No default Tailwind palette or hardcoded hex.

```tsx
// Correct
<div className="bg-surface text-heading border border-border rounded-lg">
  <p className="text-muted">Subtitle</p>
</div>

// Wrong — will fail lint
<div className="bg-white text-gray-900 border border-gray-200">
<div style={{ color: "#ef4444" }}>
```

**Available semantic classes:**

| Background | Text | Border |
|------------|------|--------|
| `bg-page` | `text-heading` | `border-border` |
| `bg-surface` | `text-body` | `border-border-subtle` |
| `bg-surface-raised` | `text-muted` | |
| `bg-primary` | `text-error` | |
| `bg-primary-hover` | `text-success` | |
| `bg-error` | `text-warning` | |
| `bg-success` | `text-info` | |
| `bg-warning` | `text-primary` | |
| `bg-info` | `text-primary-hover` | |

For charts/canvas that need hex values, import from `@/lib/chart-colors.ts`.

---

### 2. Spacing (Tailwind Scale)

**Rule:** Use standard Tailwind spacing classes. Avoid arbitrary pixel values.

```tsx
// Correct
<div className="p-4 mt-6 gap-3">Content</div>

// Wrong — will trigger warning
<div className="mt-[37px]">Content</div>
```

---

### 3. Form Inputs (Wrapper Components Only)

**Rule:** Never use raw `<input>`, `<textarea>`, or `<select>`. Use wrappers from `@/components/ui/`.

```tsx
import { FormInput, FormSelect } from "@/components/ui";

// Correct
<FormInput name="email" label="Email Address" type="email" required />

// Wrong — will fail lint
<input type="email" name="email" />
```

**Available wrappers:**
- `FormInput` — text, email, password, number, etc.
- `FormTextarea` — multi-line text
- `FormSelect` — dropdowns

---

## UI Primitives

Import from `@/components/ui/`:

```tsx
import { Button, Card, CardContent, CardTitle, Badge, Container } from "@/components/ui";
```

- **Button** — Variants: `primary`, `ghost`, `danger`, `link`. Sizes: `sm`, `md`, `lg`
- **Card** — `bg-surface border-border`. Sub-components: Card, CardHeader, CardTitle, CardContent, CardFooter
- **Badge** — Severity: `critical`, `high`, `medium`, `low`. Status: `healthy`, `warning`, `error`, `info`
- **Container** — `max-w-[1200px] mx-auto px-6`

---

## Layout Structure

Three route groups with shared layouts:

- **`(marketing)`** — MarketingNav + Footer provided by layout
- **`(dashboard)`** — Nav + container-page provided by layout
- **`(auth)`** — Centered card layout

Pages should NOT import nav/footer directly — the layout handles it.

---

## Workflow for Agents

1. **Read this skill first** before writing any JSX
2. **Use semantic Tailwind classes** (`bg-surface`, `text-heading`, `border-border`)
3. **Use UI primitives** from `@/components/ui/`
4. **Use form wrappers** instead of raw inputs
5. **For charts**, import hex values from `@/lib/chart-colors.ts`

---

**Last Updated:** 2026-03-07
**Enforced By:** Pre-commit hook + CI gate
