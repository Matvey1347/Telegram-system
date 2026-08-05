# Codebase Audit

Updated: 2026-08-04

## Top 30 Largest Handwritten Production Files

| # | File | Lines | Category |
|---:|---|---:|---|
| 1 | `apps/api/src/telegram-channels/telegram-channels.service.ts` | 11019 | backend |
| 2 | `apps/web/src/app/telegram-posts/page.tsx` | 6775 | frontend |
| 3 | `apps/api/src/telegram-ad-sales/telegram-ad-sales.service.ts` | 5746 | backend |
| 4 | `apps/web/src/app/telegram/channels/[id]/page.tsx` | 4000 | frontend |
| 5 | `apps/web/src/app/telegram-channels/page.tsx` | 3502 | frontend |
| 6 | `apps/api/src/telegram/shared/telegram-mtproto.client.ts` | 3360 | backend |
| 7 | `apps/web/src/components/ad-sales/ad-sales-page.tsx` | 3102 | frontend |
| 8 | `apps/web/src/app/ad-campaigns/page.tsx` | 2503 | frontend |
| 9 | `apps/web/src/lib/api.ts` | 2235 | frontend |
| 10 | `apps/api/src/ad-campaigns/ad-campaigns.service.ts` | 1864 | backend |
| 11 | `apps/web/src/components/ui/primitives.tsx` | 1854 | frontend |
| 12 | `apps/web/src/components/ad-campaigns/campaigns-table.tsx` | 1307 | frontend |
| 13 | `apps/api/src/telegram-user-accounts/telegram-user-accounts.service.ts` | 1217 | backend |
| 14 | `apps/web/src/components/telegram/telegram-account-panels.tsx` | 1178 | frontend |
| 15 | `apps/web/src/components/icons/icon-picker.tsx` | 1111 | frontend |
| 16 | `apps/web/src/components/ad-sales/ad-sale-modal.tsx` | 1048 | frontend |
| 17 | `apps/api/src/ad-campaigns/ad-campaign-admission-analytics.service.ts` | 1010 | backend |
| 18 | `apps/api/src/ad-hypotheses/ad-hypotheses.service.ts` | 902 | backend |
| 19 | `apps/web/src/components/telegram/telegram-post-preview.tsx` | 897 | frontend |
| 20 | `packages/shared/src/types/telegram-ad-sales.ts` | 857 | shared |
| 21 | `apps/api/src/transactions/transactions.service.ts` | 818 | backend |
| 22 | `apps/web/src/app/system-logs/page.tsx` | 806 | frontend |
| 23 | `apps/web/src/components/telegram/telegram-text-editor.tsx` | 720 | frontend |
| 24 | `apps/api/src/telegram-channels/telegram-channels.controller.ts` | 648 | backend |
| 25 | `apps/web/src/app/page.tsx` | 629 | frontend |
| 26 | `apps/api/src/telegram-ad-sales/telegram-ad-sales.controller.ts` | 628 | backend |
| 27 | `apps/api/src/dashboard/dashboard.service.ts` | 617 | backend |
| 28 | `apps/web/src/components/layout/app-shell.tsx` | 601 | frontend |
| 29 | `apps/api/src/telegram/shared/telegram-source-access.service.ts` | 571 | backend |
| 30 | `apps/api/src/telegram-ad-sales/dto.ts` | 547 | backend |

## Backend Findings

- `TelegramChannelsService` is a primary god service. It combines channel CRUD, import policy, Telegram sync, invite links, managed posts, publishing, post groups, analytics, source access, exports and compatibility probes.
- `TelegramAdSalesService` combines products, pricing, availability, inventory, sales lifecycle, payments, CRM, analytics and policy recommendation.
- `TelegramMtprotoClient` is a large adapter spanning auth, channel resolution, stats, invite links, publishing, editing, deletion and media.
- Controllers are mostly thin, but `telegram-channels.controller.ts` and `telegram-ad-sales.controller.ts` expose many workflows into one service dependency each.
- Prisma scoping is manual in large services. Workspace filtering must be preserved during every extraction.
- Existing characterization tests are strongest around managed posts, invite links, MTProto publishing and ad-sales pricing.

## Frontend Findings

- Page files often mix React Query, URL/localStorage state, business calculations, modals and large UI sections.
- `apps/web/src/lib/api.ts` was a single API choke point. Type-only contracts now live in domain modules under `apps/web/src/lib/api-types/`, `apps/web/src/lib/api-types.ts` is only a compatibility barrel, and `applicationLogsApi` has moved to `apps/web/src/lib/application-logs-api.ts`; remaining domain endpoint facades still need to split.
- `apps/web/src/components/ui/primitives.tsx` contains useful primitives, but also several heavier controls. It should be split by primitive family only when call sites are stable.
- Query key centralization was partial: `telegram-ad-sales-query.ts` existed, but most pages used inline array keys. `apps/web/src/lib/query-keys.ts` now provides shared factories.

## Repeated Patterns

- Query keys: repeated roots include `telegram-channels`, `telegram-managed-posts`, `accounts`, `transactions`, `currency-settings`, `currency-rates`, `ad-campaigns`, `post-groups`.
- Selectors: `Select`, `MultiSelect`, `CustomSelect`, local `MultiValueSelect`, local channel multi-select and workspace member select overlap.
- Date controls: `DateInput` and `DateRangeInput` exist in primitives, while page-local date formatting/range logic repeats in Telegram channels, Telegram posts, ad campaigns and ad sales.
- Emoji/icon picking: icon picker owns emoji/image creation and query logic; inline icon picker repeats a narrower form use case.
- Tables: raw tables and primitive `Table` are both used across finance, system logs, campaigns and Telegram pages.
- Modals: CRUD state patterns repeat as local `editing/deleting/open/selected` state.
- Cards/metrics: metric card patterns repeat in dashboard, ad sales, Telegram channel detail and channel list.

## Mixing Hotspots

- `apps/web/src/app/telegram-posts/page.tsx`: React Query, composer state, schedule logic, groups, modals and rendering in one page.
- `apps/web/src/app/telegram/channels/[id]/page.tsx`: data loading, analytics normalization, settings, posts, charts, sync and access modals in one page.
- `apps/web/src/components/ad-sales/ad-sales-page.tsx`: route-tab state, product pricing, calendar rendering, sale lifecycle and settings in one component.
- `apps/api/src/telegram-channels/telegram-channels.service.ts`: orchestration, domain rules, Telegram adapter calls and Prisma persistence in one service.
- `apps/api/src/telegram-ad-sales/telegram-ad-sales.service.ts`: lifecycle, analytics, inventory, CRM and payments in one service.

## Potential God Services

- `TelegramChannelsService`
- `TelegramAdSalesService`
- `TelegramMtprotoClient`
- `AdCampaignsService`
- `TelegramUserAccountsService`

## Potential God Components

- `TelegramPostsPage`
- `TelegramChannelAnalyticsPage`
- `TelegramChannelsPage`
- `AdSalesPage`
- `AdCampaignsPage`
- `Primitives`
- `IconPicker`
- `AdSaleModal`

## Circular Dependencies

No automated circular dependency graph is currently configured. The highest-risk module edge is `TelegramAdSalesModule` importing `TelegramChannelsModule` while channel services also know about campaigns and sales flows. Add a dependency graph tool only if native TypeScript/module analysis proves insufficient.

## Unused Code Signals

- Lint baseline reports unused variables in several frontend pages and unused frontend `managedFeedbackConfig`.
- No deletion was performed because dynamic usage through route loading and exported facades needs separate verification.

## Complexity Signals

- Large service methods around Telegram sync, invite-link sync, MTProto invite resolution, ad-sales availability and analytics have high branch density.
- Frontend components with multiple `useEffect`, `useMemo`, modal state blocks and inline table renderers should be split after characterization tests.

## Immediate Safe Extractions

- Keep `api.ts` facade and continue splitting endpoint clients by domain, using `applicationLogsApi` as the first compatibility-preserving extraction pattern.
- Move common query keys to `query-keys.ts` and replace invalidations incrementally.
- Extract pure date/number/status formatters before moving UI sections.
- Extract backend use-case services behind facades only after characterization tests around current observable behavior.
