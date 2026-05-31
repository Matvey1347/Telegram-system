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

## Telegram sync modes

- `PUBLIC_API_URL` should point to your public API base URL for webhook mode.
- `TELEGRAM_WEBHOOK_BASE_URL` can be used to explicitly set webhook endpoint base, e.g. `https://api.example.com/api/telegram/webhook`.
- `TELEGRAM_UPDATES_MODE` supports `webhook`, `polling`, or `off`.
- `TELEGRAM_SYNC_ENABLED=true` enables snapshot/daily sync jobs.
- `TELEGRAM_SYNC_INTERVAL_MINUTES` controls sync interval (default implementation uses 5-minute cron).

Notes:

- Webhook mode requires public HTTPS.
- Polling mode is recommended for local development and requires disabled webhook.
- Bot should be channel admin for member/admin diagnostics and invite-link management.
- Invite link attribution is most reliable for links created by this system bot.

## Telegram analytics verification checklist

1. Enable webhook: `POST /api/telegram-bots/:id/webhook/enable`.
2. Verify status: `GET /api/telegram-bots/:id/webhook/status`.
3. Create invite link: `POST /api/telegram-channels/:id/invite-links`.
4. Join channel from another account via created invite link.
5. Check raw logs: `GET /api/telegram-channels/:id/update-logs?limit=50&offset=0`.
6. Check member events: `GET /api/telegram-channels/:id/events?limit=50&offset=0`.
7. Publish/edit a post in channel and verify posts endpoint: `GET /api/telegram-channels/:id/posts`.
8. Sync subscriber snapshot: `POST /api/telegram-channels/:id/sync-subscribers-count`.
9. Review aggregate analytics: `GET /api/telegram-channels/:id/analytics`.

Limitations:

- Bot API cannot return full subscriber list.
- Bot API cannot restore old join/leave history.
- Historical post metrics may require MTProto sync.
- Webhook/polling receives only future allowed updates.
