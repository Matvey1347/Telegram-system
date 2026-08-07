# AGENTS

## Project map

- `apps/api`: NestJS API. Controllers stay thin; domain behavior belongs in module services; Telegram adapters live under `src/telegram/shared`.
- `apps/web`: Next.js app router frontend. Shared providers live in `src/providers`; reusable UI in `src/components`; API client and app-wide behaviors in `src/lib`.
- `packages/shared`: shared TypeScript contracts used across API and web. Put stable cross-app response types here when both sides consume them.
- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations`: database contract and migrations. Schema/API changes are incomplete until both are updated.
- Telegram adapters: `apps/api/src/telegram/shared/*` is the single integration layer for MTProto/Bot API details, parsing, entity resolution, and Telegram-specific helpers.
- Domain services: feature modules in `apps/api/src/*` own business rules and Prisma orchestration. Reuse helpers before adding parallel logic paths.
- Frontend providers/components/lib: providers own app-wide state and feedback; `components` own reusable UI; `lib` owns shared client behavior, request utilities, and cross-page flows.

## Architecture workflow

- For features touching frontend and backend, the main Codex agent acts as tech lead/integrator.
- First define the end-to-end flow and API contract, then split implementation by non-overlapping files.
- Backend and frontend agents must not independently invent different request/response shapes.
- Parallel write agents must never edit the same files.
- Significant refactors use `docs/refactoring/PROJECT_REFACTOR_EXEC_PLAN.md` and update progress as work lands.
- After implementation, the tech lead verifies integration, workspace isolation, query invalidation, tests and docs.

## Reuse before creation

Before adding a selector, picker, modal, table, form field, metric card, chart wrapper, page header, query hook or API type, search for existing implementations:

- `rg "function .*Select|const .*Select|MultiSelect|CustomSelect" apps/web/src`
- `rg "DateInput|DateRangeInput|Picker|Modal|Table|PageHeader|Metric" apps/web/src`
- `rg "queryKey:|invalidateQueries|useQuery|useMutation" apps/web/src`
- `rg "export type|export interface" packages/shared/src apps/web/src/lib apps/api/src`
- `rg "PrismaService|workspaceId|WorkspaceService" apps/api/src`

Prefer existing primitives, `apps/web/src/lib/query-keys.ts`, shared contracts and Telegram adapters over local duplicates.

## Required reading

- Frontend tasks: `apps/web/AGENTS.md`, `docs/design-system/BRAND_GUIDE.md`, `docs/design-system/COMPONENT_CATALOG.md`.
- Backend tasks: `apps/api/AGENTS.md`, the relevant domain module, Prisma schema and existing tests.
- Shared contract tasks: `packages/shared/AGENTS.md`, backend DTO/controller and frontend API client usage.
- Cross-stack tasks: shared contracts, frontend API client, controller/DTO, relevant query keys and invalidation paths.

## Before changing code

1. Read neighboring files before editing.
2. Find usages with `rg`.
3. Check existing tests around the behavior.
4. Check whether a shared abstraction already exists in `packages/shared`, `apps/api/src/telegram/shared`, `apps/web/src/lib`, or `apps/web/src/providers`.
5. Review `git status` and relevant `git diff`.
6. Never destroy or overwrite the user's uncommitted changes. Changes are allowed when contracts and tests are updated with them.
7. If you temporarily start local dev servers or background processes for verification, stop them before handoff and mention that they were stopped.

## Change classification

### Local UI fix

- Read the page, nearby component, and shared primitive/provider it depends on.
- Run: `pnpm --filter web lint`, `pnpm --filter web typecheck`.
- Add or update a component test when behavior is user-visible.

### Domain feature

- Read controller, service, Prisma usage, and shared types.
- Add happy path, failure path, and regression coverage.
- Run: `pnpm --filter api test -- --runInBand`, `pnpm --filter api build`.

### Schema/API change

- Update Prisma schema, migration, API types, and shared contracts together.
- Remove the old path after migration instead of keeping two long-lived contracts.
- Run: `pnpm db:generate`, API tests/build, and web typecheck if the response shape is consumed there.

### Cross-cutting frontend behavior

- Implement in one shared layer, not page-by-page.
- Prefer `src/providers`, `src/lib`, or reusable `src/components`.
- Add a contract/component test and repo-wide search for the old pattern.

### Telegram integration

- Change Telegram-specific behavior in `apps/api/src/telegram/shared` or one shared service layer.
- Do not duplicate entity-resolution or parsing logic per operation.
- Add realistic failure coverage, not only happy path.

### Financial calculation

- Keep formulas centralized and observable.
- Add boundary tests and at least one regression test for the bug being fixed.

### Migration/refactor

- Refactors are allowed when contracts stay explicit and duplicate paths are removed.
- Do not mix unrelated cleanup into the same change.
- Run repo-wide usage search before and after.

## Cross-cutting rule

If behavior must work "across the site", do not patch multiple pages separately.

1. Find the shared layer.
2. Implement behavior there.
3. Remove local duplicates.
4. Add contract/component tests.
5. Run repo-wide search for the old pattern and clean it up.

## Emoji and icon architecture

- Display emoji/icons through the shared `ResolvedEmoji` contract and frontend `IconAvatar`.
- Backend entity responses must include resolved display data (`iconPresentation` or `avatarPresentation`) whenever the frontend needs to render an icon/avatar.
- Frontend lists, cards, tables and headers must not make `/icons/:id` requests only to render an existing entity. See `docs/emoji-architecture.md`.

## Tests required

- Every new feature needs a happy path.
- Add at least one realistic failure path.
- Add a regression test for the reported bug.
- Cover boundary cases.
- Do not create fixtures tied to one hardcoded user input, title, invite hash, or ID.
- Prefer observable behavior over only asserting that a mock was called.

## Definition of done

A change is not done until:

- backend/frontend/shared contracts are synchronized where relevant;
- loading/error/empty states are handled for user-visible UI;
- query invalidation uses shared key factories where possible;
- authorization and workspace isolation are checked;
- tests exist;
- relevant lint/typecheck/build commands are run and results are reported;
- usages were checked;
- shared types are updated where needed;
- error paths are handled;
- duplicate implementations are removed;
- documentation is updated when a new pattern appears;
- manual QA steps are written in the final handoff.

## File-size policy

- Do not create new god files.
- Target handwritten production files at 100-400 lines.
- `pnpm architecture:check` warns above 500 lines and enforces hard policy above 800 lines.
- App Router `page.tsx` files must trend below 300 lines and should only read params/search params and render feature containers.
- API compatibility facades must trend below 400 lines; type barrels/index files below 250 lines; UI barrels below 150 lines.
- Existing files above these limits are transitional debt only. They are tracked in `scripts/check-architecture.mjs` as shrinking-only baseline entries and must never grow.
- `ARCHITECTURE_STRICT=1 pnpm architecture:check` is the final gate: no transitional baseline, no god-file exceptions.
- Significant refactors must reduce or remove transitional baseline entries instead of adding new ones.
- When touching a file over the limit, consider a local cohesive extraction, but do not mix unrelated mass refactors into small features.
- Run `pnpm architecture:check` after architecture-sensitive changes.

## No overengineering

- Do not add an abstraction for one trivial use.
- Do not build a generic framework without at least two real use cases.
- Do not run unrelated refactors while implementing a feature.
- Do extract a shared layer when behavior is already duplicated or clearly cross-cutting.
