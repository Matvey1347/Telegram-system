# Emoji And Icon Architecture

Emoji/icon display data must cross the stack as `ResolvedEmoji` from `@telegram-system/shared`.

Backend responses for entities that display an icon or avatar must include a resolved presentation field next to legacy ids:

- `iconPresentation?: ResolvedEmoji | null` for accounts, categories, transactions, promos, hypotheses, Telegram posts/groups and similar entities.
- `avatarPresentation?: ResolvedEmoji | null` for workspaces and workspace members.

Frontend rendering must use `IconAvatar` and pass the hydrated `ResolvedEmoji` presentation from the entity response. Lists, cards, tables, headers and chips must not call `/icons/:id` only to render an existing entity.

`IconPicker` may load `/icons`, upload icons, create emoji icons, and lazily fetch `/icons/:id` only while the picker is open and no hydrated display data is available. It is a selection/editing path, not the default display architecture.

When adding a new icon-enabled entity:

1. Store icon references according to the domain schema.
2. Resolve them in the backend service with `iconToResolvedEmoji`.
3. Add `iconPresentation` or `avatarPresentation` to the API/shared type.
4. Render ordinary display with `IconAvatar` and pass presentation into `IconPicker` only as the selected preview.
5. Do not add React Query hooks or component-local requests for display-only icon hydration.
