# Scantient Design System

Dark-first "Slate" theme using semantic Tailwind CSS classes defined in `globals.css` @theme block.

## Files

- **`SKILL.md`** — Agent routing guide (read this first if you're writing UI)
- **`../src/app/globals.css`** — @theme palette + semantic CSS custom properties
- **`../src/lib/chart-colors.ts`** — Hex constants for recharts/canvas contexts
- **`../src/components/ui/`** — Shared UI primitives (Button, Card, Badge, FormInput, etc.)
- **`../eslint-rules/`** — Custom ESLint rules for design compliance
- **`../.husky/pre-commit`** — Pre-commit hook that enforces design system locally

## Quick Start

### Create a UI Component

```tsx
import { Card, CardContent, CardTitle } from "@/components/ui";
import { FormInput } from "@/components/ui";

export function MyFeature() {
  return (
    <Card>
      <CardContent>
        <CardTitle>My Feature</CardTitle>
        <p className="text-muted">Description text</p>
        <FormInput name="email" label="Email" />
      </CardContent>
    </Card>
  );
}
```

## Semantic Classes

All colors are defined as Tailwind theme extensions in `globals.css`:

| Class | Purpose |
|-------|---------|
| `bg-page` | Page background (#0d1b2a) |
| `bg-surface` | Card/panel background (#1b263b) |
| `bg-surface-raised` | Elevated surface (#243347) |
| `text-heading` | Primary text (#e0e1dd) |
| `text-body` | Body text (#e0e1dd) |
| `text-muted` | Secondary text (#8a9bb5) |
| `border-border` | Standard border (#415a77) |
| `border-border-subtle` | Subtle border (#2d3f56) |
| `bg-primary` | Primary action (#415a77) |
| `bg-primary-hover` | Primary hover (#5b7da4) |
| `text-error` | Error text (#ef4444) |
| `text-success` | Success text (#10b981) |
| `text-warning` | Warning text (#f59e0b) |
| `text-info` | Info text (#3b82f6) |

## ESLint Rules

### color-token
- **Allows:** Semantic classes (`bg-page`, `text-heading`, etc.) and custom palette (`bg-ink-black-*`)
- **Bans:** Default Tailwind palette (`bg-gray-*`, `text-red-*`, etc.) and hardcoded hex in inline styles

### spacing-token
- **Allows:** Standard Tailwind spacing scale (`mt-4`, `px-6`, `gap-3`)
- **Bans:** Arbitrary pixel values (`mt-[37px]`)

### form-wrapper
- **Bans:** Raw `<input>`, `<textarea>`, `<select>`
- **Requires:** `<FormInput>`, `<FormTextarea>`, `<FormSelect>` from `@/components/ui/`

## Layout

- Max content width: 1200px
- Container utility: `.container-page` or `<Container>` component
- Three layout groups: `(marketing)`, `(dashboard)`, `(auth)`

---

**Last Updated:** 2026-03-07
