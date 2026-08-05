# Agent UI Checklist

Before adding or changing UI:

- Read `apps/web/AGENTS.md`.
- Check this design-system documentation.
- Search for existing selectors, pickers, modals, tables, cards and page headers.
- Split shared UI by component family; keep barrels small.
- Keep App Router pages focused on params/layout and feature containers.
- Avoid local copies of selects, date pickers, modals, tables and metric cards.
- Use `@/lib/query-keys` for React Query keys.
- Use `@/lib/api` for API calls; do not create a second fetch wrapper.
- Handle loading, error and empty states.
- Preserve keyboard focus and accessible labels.
- Check mobile wrapping and prevent text overlap.
- Avoid unrelated redesign while refactoring.
- Run `pnpm --filter web typecheck`.
- Run relevant component tests or `pnpm --filter web test -- --run`.
