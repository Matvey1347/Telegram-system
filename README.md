# Telegram System

Internal system for managing Telegram channels, ad campaigns, finance, currencies and analytics.

## Stack

- Monorepo: pnpm workspaces
- Frontend: Next.js
- Backend: Nest.js
- Database: PostgreSQL
- ORM: Prisma
- Local DB: Docker Compose

## Project structure

telegram_system/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   └── shared/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json

## Local development

1. Install dependencies:

    pnpm install

2. Start PostgreSQL:

    pnpm db:up

3. Run migrations:

    pnpm db:migrate

4. Start frontend and backend:

    pnpm dev

## Database

Run migration:

    pnpm db:migrate

Open Prisma Studio:

    pnpm db:studio

For API-scoped Prisma Studio:

    pnpm --filter api exec prisma studio

## Admin Bootstrap

Backend startup now performs deterministic admin/workspace bootstrap (it is not limited to manual Prisma seed).

- Reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` from the root `.env`.
- Uses a stable `User.seedKey = "default-admin"` to track the env-controlled admin even if email changes.
- Creates or updates the seeded admin on every backend start.
- Ensures a default workspace exists (`id = "default-workspace"`).
- Ensures the seeded admin is attached to that workspace with `WorkspaceRole.owner`.
- Logs only a safe message: `Default admin initialized` (no password logging).

Required `.env` variables (root):

- `DATABASE_URL`
- `API_PORT`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `NEXT_PUBLIC_API_URL`

## Local URLs

Frontend:

    http://localhost:3000

Backend:

    http://localhost:4000

PostgreSQL:

    localhost:5432
