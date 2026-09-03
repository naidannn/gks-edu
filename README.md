# GKS Edu — full-stack boilerplate

pnpm workspace monorepo.

| Layer     | Stack |
|-----------|-------|
| Frontend  | Nuxt 4 · Vue 3 · TypeScript · Pinia · Tailwind CSS 4 |
| Backend   | NestJS 12 (ESM) · TypeScript · Swagger · JWT · Throttler · Terminus |
| ORM       | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Database  | PostgreSQL 17 — Supabase by default, local Docker optional |
| Vector DB | pgvector (cosine search + HNSW index) |
| Cache     | Redis 8 — `cache-manager` read-through + raw `ioredis` client |

```
gks-edu/
├── apps/
│   ├── api/               NestJS API
│   │   ├── prisma/        schema, migrations, seed
│   │   ├── prisma.config.ts
│   │   └── src/
│   │       ├── common/    filters, guards, decorators, interceptors, middleware
│   │       ├── config/    typed config + env validation
│   │       ├── health/    /health (postgres, pgvector, redis, heap)
│   │       ├── modules/   auth, users, vector
│   │       ├── prisma/    PrismaService + generated client re-export
│   │       └── redis/     RedisService (raw) + CacheService (cache-manager)
│   └── web/               Nuxt 4 app (app/ dir: pages, layouts, stores, composables)
├── packages/
│   └── shared/            zod schemas + types shared with the frontend
├── docker/postgres/init/  extension bootstrap for the optional local DB
└── docker-compose.yml     redis (default) + postgres 17/pgvector (profile: local-db)
```

## Эхлүүлэх

```bash
pnpm install
cp .env.example .env        # then fill in the Supabase password + JWT secrets
pnpm db:up                  # Redis
pnpm prisma:migrate         # apply migrations
pnpm prisma:seed            # admin@gks.edu / student@gks.edu — password123
pnpm dev                    # web :3000 + api :3001
```

- Web — <http://localhost:3000>
- API — <http://localhost:3001/api/v1>
- Swagger — <http://localhost:3001/api/docs>
- Health — <http://localhost:3001/api/v1/health>

### Database

`DATABASE_URL` points at the Supabase **transaction-mode** pooler (port 6543, `pgbouncer=true`)
— that is what the app runs on. `DIRECT_URL` points at the **session-mode** pooler (port 5432);
Prisma Migrate needs it because PgBouncer in transaction mode cannot hold the advisory locks
that DDL requires. Both live in `prisma.config.ts`, not in `schema.prisma` — Prisma 7 moved them.

Prefer a local database instead:

```bash
pnpm db:up:local            # postgres 17 + pgvector + redis
# then point DATABASE_URL and DIRECT_URL at localhost:5432 (see .env.example)
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | web + api in parallel |
| `pnpm dev:api` / `pnpm dev:web` | one app only |
| `pnpm build` | build every package |
| `pnpm test` | vitest in api + web |
| `pnpm typecheck` / `pnpm lint` | across the workspace |
| `pnpm db:up` / `db:up:local` / `db:down` / `db:reset` | docker compose |
| `pnpm prisma:generate` / `migrate` / `deploy` / `studio` / `seed` | Prisma |

## API

Every route is authenticated by the global `JwtAuthGuard`; opt out with `@Public()`.
`@Roles(Role.ADMIN)` + `RolesGuard` handles authorisation.

```
POST   /api/v1/auth/register      public
POST   /api/v1/auth/login         public, 5 req/min
POST   /api/v1/auth/refresh       public — rotates the refresh token
POST   /api/v1/auth/logout        public — revokes one refresh token
POST   /api/v1/auth/logout-all    revokes every session

GET    /api/v1/users/me
GET    /api/v1/users              admin
GET    /api/v1/users/:id          admin
PATCH  /api/v1/users/:id          own profile, or admin
DELETE /api/v1/users/:id          admin

POST   /api/v1/documents          store + embed chunks
POST   /api/v1/documents/search   cosine similarity search
GET    /api/v1/documents
GET    /api/v1/documents/:id
DELETE /api/v1/documents/:id

GET    /api/v1/health             public
```

Errors always come back in one shape (`AllExceptionsFilter`), including a `requestId`
that matches the `x-request-id` response header:

```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "BadRequestException",
  "requestId": "e1318caf-…",
  "timestamp": "2026-09-03T11:04:29.464Z",
  "path": "/api/v1/auth/login"
}
```

## pgvector

Prisma types the `embedding` column as `Unsupported("vector(1536)")`, so it appears in
migrations but cannot be read or written through the typed client. Every query that touches
it lives in `apps/api/src/modules/vector/vector.service.ts` as raw SQL:

```sql
1 - (c.embedding <=> $1::vector) AS similarity
ORDER BY c.embedding <=> $1::vector
```

An HNSW index with `vector_cosine_ops` backs it
(`prisma/migrations/20260903000100_vector_hnsw_index`). The operator class must match the
operator used in the query, or Postgres silently falls back to a sequential scan.

> **`EmbeddingService` ships a stub.** It returns deterministic, unit-length pseudo-vectors
> derived from a SHA-256 hash so the pipeline runs with no API key. They carry no semantics —
> identical text matches at similarity 1.0, everything else is noise. Replace
> `apps/api/src/modules/vector/embedding.service.ts` with a real model before relying on
> results, and keep `EMBEDDING_DIMENSIONS` in sync with the `vector(N)` column (changing N
> requires a migration).

## Redis

Two ways in, depending on what you need:

- `CacheService` — read-through caching. `cache.wrap(key, factory, ttlMs)`.
  `UsersService.findOne` is the worked example.
- `RedisService` — the raw `ioredis` client plus helpers for pattern deletes
  (SCAN-based, never `KEYS`) and best-effort distributed locks.

## Docker

Both images build from the **repo root**, not from the app directory:

```bash
docker build -f apps/api/Dockerfile -t gks-api .
docker build -f apps/web/Dockerfile -t gks-web .
```

The API image ships `prisma/` and `prisma.config.ts` so `prisma migrate deploy` can run on
release. The web image is the standalone Nitro output and carries no `node_modules`.

## Notes

- **NestJS 12 is ESM-only.** `apps/api` is `"type": "module"` and relative imports carry
  explicit `.js` extensions. That is a requirement of NodeNext resolution, not a style choice.
- **Prisma Client is generated into `apps/api/src/generated/prisma`** (gitignored) and
  re-exported from `src/prisma/client.ts`. Import Prisma types from there, never from
  `@prisma/client`.
- **`@nestjs/throttler` has not published a Nest 12 peer range yet.** The override lives in
  `pnpm-workspace.yaml`; remove it once upstream catches up.
- **`pnpm-workspace.yaml` holds the workspace settings**, including `allowBuilds` — pnpm 11
  fails the install rather than silently skipping a dependency's build script, so a new
  native dependency has to be listed there before `pnpm install` will succeed.
- One `.env` at the repo root serves the whole workspace. The API reads it via
  `ConfigModule`, Nuxt via `--dotenv ../../.env`. `apps/api/.env.local` overrides it if present.
- `validateEnv` fails the boot when `JWT_SECRET` / `JWT_REFRESH_SECRET` are missing or under
  32 characters, rather than letting a weak secret reach production.
