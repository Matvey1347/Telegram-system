# Shared Package Instructions

## What Belongs Here

- Serializable API contracts used by both backend and frontend.
- Stable enums/string unions shared across apps.
- Pure helpers that have no backend runtime dependency and no browser dependency.

## What Does Not Belong Here

- Prisma models or Prisma client usage.
- NestJS decorators, DTO validation classes or services.
- React components, hooks, browser APIs or Next.js code.
- Domain implementation that is only used by one app.

## Contract Rules

- Keep exported types backwards-compatible unless the API change is intentional and coordinated.
- Update backend DTO/controller/service and frontend API client together for cross-stack changes.
- Prefer explicit serializable shapes over leaking internal ORM structures.
- Use `ResolvedEmoji` for cross-stack emoji/icon display contracts; do not encode display icons as endpoint-specific unions of raw unicode strings, ids and URLs.
- Put reusable compact API summaries here only when the same semantics are shared across apps/domains; do not mirror Prisma models or create one-off DTO copies for every endpoint.
- Add tests when shared parsing/formatting behavior becomes non-trivial.
- Split shared contract files by domain when they approach 400-500 lines; no shared type file should remain above the 800-line architecture hard policy.
- Keep index/barrel files type-only and below 250 lines.
- Do not replace one large shared type file with a single large `types.ts` in another folder.

## Validation

- `pnpm --filter @telegram-system/shared typecheck`
- `pnpm --filter @telegram-system/shared build`
