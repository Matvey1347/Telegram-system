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

## Local URLs

Frontend:

    http://localhost:3000

Backend:

    http://localhost:4000

PostgreSQL:

    localhost:5432
