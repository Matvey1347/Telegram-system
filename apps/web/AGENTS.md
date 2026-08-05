# Web Agent Instructions

## Structure

- App Router `page.tsx` files should read route/search params and render feature containers.
- Feature logic lives under domain components/hooks/libs before pages grow.
- Shared UI lives in `src/components/ui`, forms in reusable/domain wrappers, app-wide behavior in `src/providers` and `src/lib`.
- Keep `page.tsx` files below 300 lines by moving UI sections, query hooks, mutations and domain utilities into feature modules.
- Keep React components and hooks below 400 lines. Split by real workflow or UI responsibility, not by arbitrary line ranges.
- Keep `@/lib/api` as a small compatibility facade only; domain endpoint implementations belong in domain API modules that reuse the single base client.

## API And Query

- Use `@/lib/api` for API calls. Do not create another fetch/axios wrapper.
- Use `@/lib/query-keys` for React Query keys and invalidation.
- Keep mutation invalidation narrow and typed.
- Do not add inline string-array query keys when a shared factory exists; add the factory first when the key is cross-page or domain-owned.
- Preserve selected selector values even if they are not in the current search/pagination result.

## Design System

- Read `docs/design-system/BRAND_GUIDE.md`, `COMPONENT_CATALOG.md`, `PAGE_PATTERNS.md` and `FORM_PATTERNS.md`.
- Use existing primitives before adding new controls.
- Do not create local copies of selectors, date pickers, modals, tables, page headers or metric cards without searching first.
- Keep UI dense, operational and consistent with existing dark dashboard screens.

## Client/Server Boundaries

- Add `"use client"` only where hooks/browser APIs are required.
- Avoid importing feature-heavy modules into low-level UI primitives.
- Keep browser-only APIs inside effects or guarded code.

## States And Accessibility

- Handle loading, error, empty and disabled states.
- Keep focus visible and labels accessible.
- Use lucide icons for icon buttons when available.
- Verify text wrapping on mobile and avoid overlapping controls.

## Testing

- Run `pnpm --filter web typecheck`.
- Run `pnpm --filter web test -- --run` for component/lib behavior.
- Run `pnpm --filter web build` for route/build-sensitive changes.
- Existing lint currently has pre-existing React compiler and explicit-any failures; report whether new files add lint debt.

## Reuse Search

- `rg "function .*Select|const .*Select|MultiSelect|CustomSelect" apps/web/src`
- `rg "DateInput|DateRangeInput|Picker|Modal|Table|PageHeader|Metric" apps/web/src`
- `rg "queryKey:|invalidateQueries|useQuery|useMutation" apps/web/src`
- `rg "from '@/lib/api'|from \\\"@/lib/api\\\"" apps/web/src`
