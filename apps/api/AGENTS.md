# API Agent Instructions

## Boundaries

- NestJS modules own domain behavior. Controllers stay thin: auth/context, DTO validation, service call, response mapping.
- Do not put Telegram Bot API or MTProto details outside `src/telegram/shared` or a clearly named adapter/facade.
- Do not create repository layers for every Prisma call. Extract repositories only for repeated, complex or transactional persistence logic.

## Workspace Isolation

- Every workspace-scoped read/write must filter through `workspaceId` or a workspace membership preflight.
- Preserve `WorkspaceService` request context behavior.
- For update/delete flows, verify the entity belongs to the current workspace before mutation.

## Transactions

- Keep existing atomic operations atomic.
- Make transaction boundaries explicit when extracting services.
- Do not move writes out of an existing transaction without characterization tests.

## DTO And Errors

- Keep public API response shapes and HTTP status semantics stable.
- Reuse DTOs and shared contracts when shapes cross to the frontend.
- Preserve specific exceptions instead of replacing them with generic internal errors.

## Service Decomposition

- Application/orchestration services coordinate use cases.
- Domain services own one business area.
- Telegram sync, invite links, managed posts, post metrics, ad-sales pricing, payments and analytics should remain separately testable.
- Keep backend application/domain services below 500 lines where feasible and below the 800-line architecture hard policy.
- Existing services above policy are transitional debt: when touched, move one cohesive use case behind a facade and shrink the source file instead of adding more methods.
- Do not use a large service as a dependency when a caller needs one narrow capability; extract a focused provider or interface within the same module boundary.

## Testing

- Run `pnpm --filter api test -- --runInBand` for domain features.
- Run `pnpm --filter api typecheck` and `pnpm --filter api build`.
- Run `pnpm db:generate` after Prisma/schema/client changes.
- Existing lint currently has pre-existing failures; report whether new files add lint debt.

## Reuse Search

- `rg "class .*Service|@Injectable" apps/api/src`
- `rg "PrismaService|workspaceId|WorkspaceService" apps/api/src`
- `rg "TelegramMtprotoClient|telegramBot|Bot API" apps/api/src`
- `rg "describe\\(|it\\(" apps/api/src/<domain>`
