# BuyBack NexoraVN Backend

NestJS backend foundation for the BuyBack affiliate cashback project. The current scope is intentionally small: project infrastructure, JWT authentication/authorization, and an admin-only Users CRUD. Affiliate links, Saffi reconciliation, cashback, wallet, and withdrawals are not implemented yet.

## Stack

- Node.js 24 LTS, pnpm 10, TypeScript 5.9 (strict ESM)
- NestJS 11 with Fastify
- Prisma ORM 7 with PostgreSQL 18
- Swagger, Pino, Zod, Jest, Supertest

## Local setup

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm dev
```

Available URLs:

- API: `http://localhost:8080/api/v1`
- Swagger: `http://localhost:8080/docs`
- Health: `http://localhost:8080/api/v1/health`

## Authentication

| Method | Path                   | Description                                   |
| ------ | ---------------------- | --------------------------------------------- |
| `POST` | `/api/v1/auth/login`   | Issue an access/refresh token pair            |
| `POST` | `/api/v1/auth/refresh` | Rotate the refresh token and issue new tokens |
| `GET`  | `/api/v1/auth/me`      | Return the authenticated identity             |
| `POST` | `/api/v1/auth/logout`  | Revoke the current session                    |

Access tokens use the Swagger `access-token` Bearer scheme. Refresh tokens are hashed in `aff.auth_sessions`, rotated on every refresh, and revoked by logout. Disabled or soft-deleted users cannot authenticate.

## Users CRUD

| Method   | Path                | Description                                   |
| -------- | ------------------- | --------------------------------------------- |
| `POST`   | `/api/v1/users`     | Create a user and hash the password           |
| `GET`    | `/api/v1/users`     | List users with `page`, `limit`, and `search` |
| `GET`    | `/api/v1/users/:id` | Get a user                                    |
| `PATCH`  | `/api/v1/users/:id` | Update a user                                 |
| `DELETE` | `/api/v1/users/:id` | Delete a user                                 |

The password hash is never returned by the API. Every Users route requires a valid access token with role `ADMIN` or `SUPER_ADMIN`; role `USER` receives `403 Forbidden`.

Example create request:

```json
{
  "email": "user@example.com",
  "phoneNumber": "+84901234567",
  "password": "password123",
  "displayName": "Nguyen Van A"
}
```

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:studio
```

## Source layout

```text
src/
├── common/                  # configuration, filters, interceptors
├── infrastructure/
│   └── database/prisma/    # Prisma module and service
├── modules/
│   ├── backoffice/         # health endpoint only
│   ├── auth/               # JWT, sessions, guards and role authorization
│   └── users/              # controller, service, repository, DTOs
├── app.module.ts
└── main.ts
```

## Deferred intentionally

- Shopee URL resolution and affiliate link generation
- Saffi API integration and reconciliation
- Commission/cashback calculation
- Wallet ledger and withdrawal processing
- Redis, queues, file imports, and payment integrations

Add these only after their business rules and provider contracts are confirmed.

## Database namespace

The current database uses `aff.users`, `aff.user_bank`, and `aff.auth_sessions`. Future tables will also use the PostgreSQL schema `aff`. Keep `?schema=aff` in `DATABASE_URL` when deploying with Prisma.
