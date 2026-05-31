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

Example key generation:

`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## Auth and workspaces

- Admin env bootstrap was removed from app startup.
- Users register via `/api/auth/register`.
- Registration creates:
  - user
  - workspace
  - owner membership
- One workspace supports multiple members (`owner` / `admin` / `member`).

## Telegram bots

- Bot tokens are encrypted at rest (AES-256-GCM).
- API responses never expose raw or encrypted tokens.
- UI and API use only `maskedToken`.
- One bot can manage multiple channels.

## Notes on migration

- A migration is included for role update, investor-user link, and encrypted bot token fields.
- For early-stage local setups, DB reset is acceptable if old data shape conflicts.
