# Brand Guide

## Product Character

Telegram System is an internal operational product for Telegram channel management, advertising, finance and analytics. The interface should feel dense, calm and work-focused. Prefer scannable dashboards, compact forms, clear tables and predictable navigation over marketing-style composition.

## Visual Density

- Use compact spacing for operational screens.
- Keep page headers concise.
- Prefer dense tables and grouped controls when users compare many entities.
- Avoid oversized hero sections inside the authenticated app.

## Color Tokens

Current source of truth is `apps/web/src/app/globals.css` plus Tailwind literals used by mature screens.

- App background: near-black neutral surfaces.
- Primary surfaces: `bg-neutral-950`, `bg-neutral-900`, `bg-neutral-900/70`.
- Elevated surfaces: bordered neutral panels.
- Primary action: blue.
- Success: emerald/green.
- Warning: amber/yellow.
- Error: rose/red.
- Info: sky/blue.
- Muted text: neutral/slate gray.

## Surface Hierarchy

- App shell: full-height dark background.
- Main panels: `border border-neutral-800` with neutral dark backgrounds.
- Repeated item cards: 8px or existing primitive radius unless a mature page already uses a larger radius consistently.
- Avoid nested cards unless a repeated item genuinely needs its own frame.

## Typography

- Use default app font from Next/Tailwind.
- Page title: compact `text-2xl` to `text-3xl`, semibold/bold.
- Section title: `text-lg` to `text-xl`.
- Card title: `text-sm` to `text-base`, semibold.
- Table/body text: `text-sm`.
- Metadata/help text: `text-xs` to `text-sm`, muted.
- Letter spacing stays normal.

## Spacing

- Dense controls: `gap-2`, `gap-3`.
- Form groups: `space-y-2` to `space-y-4`.
- Page sections: `space-y-4` to `space-y-6`.
- Keep fixed-format controls stable with explicit min/max widths.

## Radius, Borders And Shadows

- Default controls: existing primitive radius.
- Cards: 8px preferred unless the primitive already defines a larger house style.
- Borders: neutral borders are the main separator.
- Shadows are subtle; do not rely on decorative glow.

## Icons

- Use `lucide-react` where an icon exists.
- Icon-only buttons need accessible labels/tooltips.
- Default icon size: 16-20px in controls, 20-24px in metric cards.

## States

- Loading: use skeletons or compact loading rows.
- Empty: show a short empty state with one useful action if available.
- Error: show actionable text and retry when possible.
- Disabled: preserve layout and use muted contrast.
- Focus: keep keyboard focus visible.

## Tables

- Use table primitives or a feature table component.
- Preserve sorting/filtering/pagination behavior.
- Keep numeric columns aligned for comparison.
- Include loading, empty and error rows.

## Forms

- Use `FormField`, `Input`, `Textarea`, `Select`, `DateInput`, `DateRangeInput` and domain selectors before creating local controls.
- Labels should be explicit.
- Validation errors live near fields.
- Modals should keep primary action placement consistent.

## Modals

- Use the shared `Modal` and confirmation patterns.
- Keep modal content focused on one task.
- Avoid page-sized modals unless the workflow truly requires it.

## Page Headers

- Use `PageHeader` for authenticated pages.
- Include title, compact supporting text and right-aligned primary actions.
- Do not duplicate navigation tabs in headers when the page already owns tabs.

## Metric Cards

- Use compact values, short labels and status color only when it communicates state.
- Avoid decorative metric cards without an operational purpose.

## Do

- Reuse existing primitives and feature components.
- Keep screens dense but readable.
- Preserve domain-specific Telegram previews and analytics affordances.
- Normalize repeated selectors and date controls by composition.

## Do Not

- Add purple/blue gradient hero treatments to operational screens.
- Add decorative blobs/orbs/background illustrations.
- Create generic components with many boolean props.
- Duplicate selectors, date pickers or modal patterns locally without checking the catalog.
