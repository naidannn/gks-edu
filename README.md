# GKS Edu — full-stack boilerplate

pnpm workspace monorepo.

> **Product docs** (Mongolian) — `docs/gksedu.md` is the business spec,
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) the technical design,
> [`docs/ROADMAP.md`](docs/ROADMAP.md) the phases, and
> [`docs/TASKS.md`](docs/TASKS.md) every task with its status (`pnpm tasks` prints progress).
> [`CLAUDE.md`](CLAUDE.md) is the working guide, including what is **out of scope**.
> Below is the boilerplate this all sits on.

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
pnpm universities:import --publish   # 135 Korean universities + logos (see below)
pnpm dev                    # web :3000 + api :3001
```

`universities:import` reads `UNIVERSITIES_DATA_DIR` (135 JSON records + logos, outside this
repo), upserts by `slug`, and copies the logos into `apps/web/public/universities/logos`.
Re-running refreshes the dataset fields and never overwrites the staff-maintained columns
(`acceptsLanguagePrep` … `internalNote`, `isPublished`).

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
| `pnpm universities:import` | import the Korean university dataset (`--publish`, `--no-assets`) |
| `pnpm clients:import <file.csv>` | import an existing client list; add `--commit` to write (1B-12) |
| `pnpm email:preview [dir]` | render every outgoing email to HTML + text, no sending (1G-17) |
| `pnpm tasks [epic]` | roadmap progress from `docs/TASKS.md` |

## API

Every route is authenticated by the global `JwtAuthGuard`; opt out with `@Public()`.
`@Roles(Role.ADMIN)` + `RolesGuard` handles authorisation.

```
POST   /api/v1/auth/register      public
POST   /api/v1/auth/login         public, 5 req/min
POST   /api/v1/auth/google        public, 10 req/min — Google ID token → session
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

GET    /api/v1/universities       public — q, region, type, level, languagePrep, gks, sort, page
GET    /api/v1/universities/facets public — filter counts by region and type
GET    /api/v1/universities/:slug public — detail + programmes + intake terms

GET    /api/v1/admissions         public — the intake calendar; level, year, month, region, sort
GET    /api/v1/admissions/facets  public — filter counts by level, month, year, region
GET    /api/v1/admissions/calendar/:year   public — one year bucketed by intake month
GET    /api/v1/admissions/university/:id   public — rounds a new applicant can still join

GET    /api/v1/admin/admissions        staff — every round, drafts included (1H-05)
POST   /api/v1/admin/admissions        staff — add a round
POST   /api/v1/admin/admissions/bulk   staff — save several reviewed rounds at once
GET    /api/v1/admin/admissions/board  staff — cases grouped under the round they race (1H-08)
GET    /api/v1/admin/admissions/at-risk staff — cases short on documents, deadline in sight
GET    /api/v1/admin/admissions/config admin — lead time, reminder ladder, risk threshold
POST   /api/v1/admin/admissions/research staff — queue a Gemini lookup, poll the run (1H-10)

POST   /api/v1/leads/public       public, 5 req/hour — website consultation request
GET    /api/v1/pricing/public     public — the prices the service pages quote
GET    /api/v1/banners            public — live promo banners

GET    /api/v1/notifications              the caller's in-app notifications (1G-05)
GET    /api/v1/notifications/unread-count badge count for the bell
POST   /api/v1/notifications/:id/read     mark one read
PATCH  /api/v1/notifications/preferences  switch email/SMS on or off
GET    /api/v1/notifications/templates    admin — the §16 catalogue (1G-06)
POST   /api/v1/notifications/sweeps/run   admin — run the scheduled reminders now

GET    /api/v1/reports/dashboard          staff — the 21 figures of §19 (1G-09)
GET    /api/v1/reports/sales-funnel       staff — channel results, conversion (1B-11)
GET    /api/v1/reports/finance            admin — revenue, receivables, refunds (1G-10)
GET    /api/v1/reports/staff-performance  admin — per-staff performance (1G-11)
POST   /api/v1/reports/refresh            admin — refresh the materialized views

GET    /api/v1/users/staff/manage  admin — staff register (1G-12)
POST   /api/v1/users/:id/claim-invite  invite a client/staff to set a password (1B-17)
POST   /api/v1/users/claim         public — redeem the invitation token

GET    /api/v1/audit               admin — the audit trail (0-11)

GET    /api/v1/health             public
```

### Google sign-in

`POST /auth/google` takes the ID token Google Identity Services hands the browser, verifies
it against `GOOGLE_CLIENT_ID` with `google-auth-library`, and issues the same token pair the
password flow does. There is no redirect leg and no client secret — the popup runs entirely
in the browser, so the OAuth client only needs its **Authorised JavaScript origins** filled
in (`http://localhost:3000` in development).

Set the same client id twice: `GOOGLE_CLIENT_ID` for the API and
`NUXT_PUBLIC_GOOGLE_CLIENT_ID` for the web app. Leave them unset and the feature disappears
cleanly — the button does not render and the endpoint answers `503`.

An account is matched by `User.googleId` first, then by email (case-insensitively, and only
when Google reports `email_verified`). A match is linked rather than duplicated, which is
also how a staff-created client with an outstanding claim invitation (1B-17) can walk in
through Google instead of setting a password.

### Admissions (1H)

`IntakeTerm` carries four dates, and two of them are easy to confuse:
`applicationDeadline` is the **school's** last day; `internalDeadline` is **ours**, set
`AdmissionConfig.internalLeadDays` earlier (7 by default) to cover translation,
notarisation and postage. Cases, reminders and every countdown run on the internal one,
and it is the only deadline that reaches a client — the school's own date stays in the
staff payloads, because a person given two deadlines works to the later one.

Phases are `OPEN → FINAL_CALL → CLOSED`. There is no "opens later" state: `openAt` is when
the *school* starts accepting, while GKS registers a client for a published round at any
point before its own deadline.

`internalDeadline` is derived automatically unless a human types one, which sets
`internalDeadlineIsManual` and freezes it against later recomputes; sending `null` hands
the row back to the rule. The date arithmetic is pure and tested in
`apps/api/src/modules/admissions/intake-deadline.ts`.

**Gemini research.** `POST /admin/admissions/research` queues a grounded Google-Search
lookup of one school's calendar (30-90s, so it is a BullMQ job the admin screen polls).
The result only ever **fills the form** — staff read the candidates next to their source
links and save the ones they believe. Nothing writes an intake by itself.

```bash
# GEMINI_API_KEY unset → GEMINI_MOCK defaults to true and a labelled fixture is returned,
# so the screen and its review flow work without a key (same idea as QPAY_MOCK).
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-pro
GEMINI_TIMEOUT_MS=120000
```

### Notifications and reports

An event (`ContractsService.finalizeSigning`, `PaymentsService.confirmPayment`, …) calls
`NotificationsService.dispatch()` **outside** its transaction: a queue hiccup must never
roll back a signed contract. The dispatcher writes one `Notification` row per active
template for that event and hands the id to BullMQ.

Two background jobs run daily:

| Queue | Job | What it does |
|---|---|---|
| `reminder-sweeps` | `sweep-all` | material/payment/visa/departure deadlines + lead follow-ups (1G-07) |
| `report-refresh` | `refresh-views` | `REFRESH MATERIALIZED VIEW CONCURRENTLY` on the four report views (1G-08) |

Both are safe to run repeatedly: every scheduled notification carries a unique
`dedupeKey`, so the same reminder is never sent twice.

With `RESEND_API_KEY` unset, email is logged rather than sent; the SMS gateway is still
undecided (`ARCHITECTURE.md` §18 question 10), so SMS is logged too — but the per-user and
platform daily ceilings (`SMS_DAILY_LIMIT_*`) already apply.

### Email

Every message — notification or not — is rendered by one layout,
`modules/notifications/email/email-template.ts`: a dark brand header, a tone-coloured
accent stripe, a badge naming the stage, the body, a button, and the company footer. It is
table-based with inline colours because Outlook renders with Word and Gmail strips
`<style>`; the `<style>` block only carries the dark-mode and small-screen overrides.

The body stays *plain text* in `NotificationTemplate.bodyMn` — the same string feeds SMS
and the in-app centre, and admins edit it in a textarea. `email-content.ts` promotes the
shapes staff already write:

| In the template | In the email |
|---|---|
| `Гэрээний дугаар: GKS-C-1` (run of such lines) | a fact table |
| `- Иргэний үнэмлэх` | a bulleted list |
| a trailing `{{link}}` | the CTA button (label from `email-presentation.ts`) |
| anything else | a paragraph |

The badge, tone and button label per event live in `email-presentation.ts`, not in the
database: an admin rewording a message must not be able to leave it without a button. A
dispatcher can override the tone by putting `tone` in the notification context — that is
how one `VISA_RESULT` template covers both a granted and a refused visa.

Mails that carry a credential (account claim, password reset) bypass the dispatcher
entirely — `email/transactional.ts` — because someone who switched email notifications off
must still be able to get back into their account.

`pnpm email:preview` renders all of them, plus a contact sheet, into `tmp/email-preview`.
The from-address's domain has to be verified in Resend before anything sends.

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

## Deployment

Production is **https://gksedu.mn** — one EC2 box in `ap-southeast-1` that also hosts ten
other applications. Both apps are built locally and only compiled output is shipped; the
server has 1.9 GB of RAM and cannot afford a Nuxt build.

```bash
./deploy/deploy.sh          # build, ship, migrate, reload PM2, health-check
./deploy/status.sh          # PM2, services, memory, database, certificate
./deploy/logs.sh api        # tail the production logs
```

`deploy/README.md` covers the layout, the first-time setup order, how migrations run over
an SSH tunnel, and what every script does — read it before touching the server, because the
box is shared.

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
