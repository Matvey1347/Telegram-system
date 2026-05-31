# Telegram System

Internal system for managing Telegram channels, ad campaigns, finance, currencies and analytics.

## Local development

1. `pnpm install`
2. `pnpm db:up`
3. `pnpm db:migrate`
4. `pnpm dev`

## Required env variables

- `DATABASE_URL`
- `API_PORT`
- `JWT_SECRET`
- `NEXT_PUBLIC_API_URL`
- `BOT_TOKEN_ENCRYPTION_KEY`

Key generation:

`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## Workspace members and investments

- `User` is a login account.
- `WorkspaceMember` is access inside workspace.
- `Investment` belongs to `WorkspaceMember`.
- There is no standalone Investors entity anymore.
- A workspace member becomes an investor automatically after first investment.

## Investment share

- UI/analytics show **share of total investments**.
- This is not legal ownership or equity.

## Telegram bots

- Bot tokens are encrypted at rest (AES-256-GCM).
- API responses expose only masked token.
- One bot can manage multiple channels.
