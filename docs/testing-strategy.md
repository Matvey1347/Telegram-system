# Testing strategy

## Goals

The project needs fast regression detection without forcing full end-to-end coverage for every small UI tweak. The default strategy is layered: keep pure logic cheap to test, test service orchestration where the bugs usually happen, and reserve E2E for a small set of critical smoke paths.

## Test pyramid

### 1. Pure unit tests

Use for:

- parsing helpers;
- formatting helpers;
- financial formulas;
- Telegram input normalization;
- progress/toast utility logic;
- shared contract utilities.

These should be the cheapest and most numerous tests.

## 2. Service tests

Use for:

- Nest service methods with domain branching;
- Telegram sync orchestration;
- import resolution rules;
- managed post state transitions;
- cross-module calculations.

Mock Prisma selectively and avoid mocking away the method under test. Builders/factories should generate varied valid defaults so tests do not accidentally depend on one fixed channel title or ID.

## 3. API integration tests

Use for:

- controller + service + serialization checks;
- auth/validation boundaries;
- high-risk request/response contracts.

Only a few focused integration tests are needed. Use a test database or narrowly scoped environment when the controller/service wiring itself is the thing being validated.

## 4. Adapter contract tests

Use for:

- Telegram adapter behavior in `apps/api/src/telegram/shared`;
- invite parsing;
- entity resolution fallback order;
- error normalization from Telegram/transport responses.

These should assert observable adapter output, not just raw mocked calls.

## 5. Frontend component tests

Use for:

- shared providers;
- critical reusable Telegram UI components;
- mutation/toast feedback;
- rendering behavior that appears on multiple pages.

Prefer provider-level or reusable-component tests over page-sized snapshots.

## 6. Critical E2E smoke tests

Keep this list short and high-value. Suggested smoke coverage:

- login and workspace bootstrap;
- telegram channels list loads;
- a sync action surfaces progress/feedback;
- one critical create/update flow in finance or Telegram posts.

Do not require a full E2E flow for every small button or copy change.

## Required coverage for new work

Every new feature or bug fix should include:

- one happy path;
- one realistic failure path;
- one regression test for the reported bug;
- boundary coverage where the logic can branch on empty, null, or invalid state.

## Mocking rules

- Mock external systems and unstable boundaries.
- Do not mock the entire service graph if the domain logic is what needs verification.
- Prefer builders/factories over hand-written one-off fixtures.
- Test the returned behavior, persisted shape, or rendered output whenever possible.

## Backend approach

- Pure domain/service logic: use Jest with focused Prisma mocks.
- A few high-value integration tests: use a dedicated test database approach when real query behavior matters.
- Telegram adapters: keep contract tests close to the adapter and cover real failure codes.

## Frontend approach

- Use Vitest + React Testing Library + jsdom.
- Render shared providers with common test utilities.
- Mock router/navigation only where the component truly depends on it.
- Prefer assertions against visible UI and user interactions.

## Suggested local commands

- Full local gate: `pnpm check`
- API-focused: `pnpm --filter api test -- --runInBand && pnpm --filter api build`
- Web-focused: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test -- --run`

## When to expand coverage

Add broader tests when:

- the same bug class has repeated more than once;
- a flow is shared across pages or modules;
- the behavior is cross-cutting;
- a migration or refactor changes multiple layers at once.
