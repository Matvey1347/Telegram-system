# AGENTS

## Project map

- `apps/api`: NestJS API. Controllers stay thin; domain behavior belongs in module services; Telegram adapters live under `src/telegram/shared`.
- `apps/web`: Next.js app router frontend. Shared providers live in `src/providers`; reusable UI in `src/components`; API client and app-wide behaviors in `src/lib`.
- `packages/shared`: shared TypeScript contracts used across API and web. Put stable cross-app response types here when both sides consume them.
- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations`: database contract and migrations. Schema/API changes are incomplete until both are updated.
- Telegram adapters: `apps/api/src/telegram/shared/*` is the single integration layer for MTProto/Bot API details, parsing, entity resolution, and Telegram-specific helpers.
- Domain services: feature modules in `apps/api/src/*` own business rules and Prisma orchestration. Reuse helpers before adding parallel logic paths.
- Frontend providers/components/lib: providers own app-wide state and feedback; `components` own reusable UI; `lib` owns shared client behavior, request utilities, and cross-page flows.

## Before changing code

1. Read neighboring files before editing.
2. Find usages with `rg`.
3. Check existing tests around the behavior.
4. Check whether a shared abstraction already exists in `packages/shared`, `apps/api/src/telegram/shared`, `apps/web/src/lib`, or `apps/web/src/providers`.
5. Review `git status` and relevant `git diff`.
6. Never destroy or overwrite the user's uncommitted changes. Changes are allowed when contracts and tests are updated with them.

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

## Tests required

- Every new feature needs a happy path.
- Add at least one realistic failure path.
- Add a regression test for the reported bug.
- Cover boundary cases.
- Do not create fixtures tied to one hardcoded user input, title, invite hash, or ID.
- Prefer observable behavior over only asserting that a mock was called.

## Definition of done

A change is not done until:

- tests exist;
- relevant lint/build commands pass;
- usages were checked;
- shared types are updated where needed;
- error paths are handled;
- duplicate implementations are removed;
- manual QA steps are written in the final handoff.

## No overengineering

- Do not add an abstraction for one trivial use.
- Do not build a generic framework without at least two real use cases.
- Do not run unrelated refactors while implementing a feature.
- Do extract a shared layer when behavior is already duplicated or clearly cross-cutting.
