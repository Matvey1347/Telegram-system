# Component Catalog

## UI Primitives

Shared UI primitives should be organized by component family instead of growing one large file. Keep family modules focused, for example controls, overlays, tables, cards, states and page chrome. Barrels may re-export stable primitives for compatibility, but shared UI barrels should stay small and should not become the implementation home for unrelated components.

Before adding a primitive or domain wrapper, search for an existing selector, date picker, modal, table, page header or metric card and normalize repeated behavior into the shared family/module. Do not create page-local copies of these controls.

### `Button`

- Import: `@/components/ui/primitives`
- Use for primary, secondary and destructive commands.
- Do not use as a selector replacement.
- Used across authenticated pages and modals.

### `Input`, `Textarea`, `Select`

- Import: `@/components/ui/primitives`
- Use for standard form controls.
- Use domain wrappers for entity selection when data loading/search is involved.

### `CustomSelect`, `MultiSelect`

- Import: `@/components/ui/primitives`
- Use when native select is not enough for visual option metadata or multiple selection.
- Do not create local multi-selects before checking these.

### `DateInput`, `DateRangeInput`

- Import: `@/components/ui/primitives`
- Use for date and date-range fields.
- Preserve existing timezone semantics when migrating page-local date logic.

### `Modal`, `ConfirmDeleteModal`

- Import: `@/components/ui/primitives`
- Use for task modals and destructive confirmation.
- Do not hand-roll overlay/focus behavior in feature pages.

### `PageHeader`

- Import: `@/components/ui/primitives`
- Use for authenticated page headers.
- Keep supporting copy short.

### `Table`

- Import: `@/components/ui/primitives`
- Use as the base for data tables.
- Add feature wrappers for loading/empty/error/pagination.

### `Card`, `Skeleton`, `EmptyState`, `LoadingState`

- Import: `@/components/ui/primitives`
- Use for repeated framed content and standard states.
- Avoid cards inside cards.

### Metric Cards

- Use an existing metric card pattern or create a focused shared wrapper when repeated.
- Keep metric cards compact and operational.
- Do not duplicate one-off metric card markup across pages.

## Domain Components

### `MemberSelect`

- Import: `@/components/workspace/member-select`
- Use for workspace member assignment.
- Uses `memberKeys.members()` and `workspaceMembersApi.list`.
- Supports current-user defaulting and role-aware disabling.

### `IconPicker`, `InlineIconPicker`

- Import: `@/components/icons/icon-picker`, `@/components/icons/inline-icon-picker`
- Use for emoji/image icon assignment.
- Do not create separate emoji pickers unless the workflow cannot use icon semantics.
- Pass hydrated `iconPresentation` or `avatarPresentation` for display. Do not pass raw `Icon` records or add entity render paths that call `/icons/:id`.

### `TelegramPostPreview`

- Import: `@/components/telegram/telegram-post-preview`
- Use for Telegram post rendering and preview.
- Keep Telegram-specific formatting here rather than duplicating preview markup.

### `InviteLinksTable`

- Import: `@/components/telegram/invite-links-table`
- Use for invite link lists and attribution views.

### `AdSaleModal`

- Import: `@/components/ad-sales/ad-sale-modal`
- Use for ad sale creation/editing.
- Existing tests cover selected post loading, format pricing and selector retry behavior.

## New Shared Modules

### Query Key Factories

- Import: `@/lib/query-keys`
- Use for React Query `queryKey`, `invalidateQueries`, `resetQueries` and `setQueryData`.
- Factories currently include auth, workspace/member, account, currency, Telegram channel, Telegram post, Telegram account, ad campaign and network keys.

### API Types

- Import compatibility remains `@/lib/api`.
- Implementation file: `@/lib/api-types`.
- Do not import directly from `api-types` in app code unless the facade is intentionally being retired.
