# Form Patterns

## Controls

- Use `FormField` for label/error/help text grouping.
- Use `Input`, `Textarea`, `Select`, `DateInput` and `DateRangeInput`.
- Use domain selectors for entities.

## Selectors

- Before creating a selector, search:
  - `rg "function .*Select|const .*Select" apps/web/src`
  - `rg "MultiSelect|CustomSelect|DateInput|DateRangeInput" apps/web/src`
  - `rg "queryKey: \\[.*members|queryKey: \\[.*channels" apps/web/src`

## Mutations

- Use typed API clients from `@/lib/api`.
- Use query key factories from `@/lib/query-keys`.
- Invalidate the narrowest useful query set.
- Preserve selected values that are not in the current paginated/search page.

## States

- Loading selectors remain disabled or show a loading option.
- Error state must keep the form recoverable.
- Empty state should explain that no entity is available.
- Clearable fields must make the empty value explicit.

## Dates

- Preserve existing local date/timezone semantics.
- Do not silently convert date-only fields to UTC datetimes.
- Keep date formatting helpers shared or domain-specific, not copied in pages.
