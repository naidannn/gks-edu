# AGENTS.md — GKSedu.mn

Guidance for Codex sessions in this repository. Read this before touching code.

## What this project is

**GKSedu.mn** — a single platform that runs the study-abroad **brokerage** business of
"Жи Кэй Эс Эдү Групп" ХХК (GKS EDU GROUP): from first enquiry → lead → contract → QPay
payment → document collection → university application → invitation → visa → departure.

The business spec lives in `docs/gksedu.md` (Mongolian, authoritative). The technical
design derived from it is `docs/ARCHITECTURE.md`. Work is tracked in `docs/ROADMAP.md`
(phases) and `docs/TASKS.md` (individual tasks + status).

### Scope rule — read this before adding a feature

| In scope now | Out of scope |
|---|---|
| Brokerage: leads, contracts, payments, documents, applications, visa, departure | **Language-training centre** (MIRAE Smart Education): classes, schedules, teachers, attendance, tuition cycles |

The language centre is deliberately **deferred**. Its technical spec is parked in
`docs/GKSEDU-ARCHITECTURE.md` for future reference only — do not implement it, do not add
its tables to the Prisma schema. The only trace it leaves in this system is that
`"Хэлний сургалтын төв"` is a valid value of `Lead.source` (`gksedu.md` §4.4, §5.2).

## Language conventions

- **Code, identifiers, code comments, commit messages, `README.md`, this file** → English.
- **Product/business docs** (`docs/ARCHITECTURE.md`, `ROADMAP.md`, `TASKS.md`, `gksedu.md`) → Mongolian; the team reads them.
- **User-facing UI strings** → Mongolian (Cyrillic). Korean university names keep their `nameKo`.
- Enum *values* in the database are English SCREAMING_SNAKE (`DOCUMENTS_IN_REVIEW`); their
  Mongolian labels live in one place on the frontend, never hard-coded per component.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Nuxt 4 · Vue 3 · TypeScript · Pinia · Tailwind CSS 4 |
| Backend | NestJS 12 (**ESM-only**) · Swagger · JWT · Throttler · Terminus |
| ORM | Prisma 7, driver adapter `@prisma/adapter-pg` |
| DB | PostgreSQL 17 (Supabase) + `pgvector` + `pg_trgm` |
| Cache/queue | Redis 8 — `cache-manager` read-through, BullMQ for jobs |
| Shared types | `packages/shared` — zod schemas used by both apps |

`README.md` documents the boilerplate in detail (Prisma URLs, pgvector, Redis, Docker).
Do not restate that here; extend it when infrastructure changes.

## Hard rules the boilerplate imposes

1. **NestJS 12 is ESM.** `apps/api` is `"type": "module"`; every relative import carries an
   explicit `.js` extension. Not a style choice — NodeNext resolution requires it.
2. **Prisma Client is generated to `apps/api/src/generated/prisma`** and re-exported from
   `src/prisma/client.ts`. Import Prisma types from `../prisma/client.js`, never from
   `@prisma/client`.
3. **Every route is guarded by default** (`JwtAuthGuard` is global). Public endpoints need
   `@Public()`. Role checks use `@Roles(Role.ADMIN)` + `RolesGuard`.
4. **`embedding` columns are `Unsupported("vector(1536)")`** — untouchable through the typed
   client. All vector SQL lives in `vector.service.ts`.
5. **`EmbeddingService` is a hash-based stub.** It has no semantics. Replace it before any
   RAG task is called "done"; keep `EMBEDDING_DIMENSIONS` in sync with the `vector(N)` column.
6. **One `.env` at the repo root** serves the whole workspace.
7. **New native dependency?** add it to `allowBuilds` in `pnpm-workspace.yaml` or
   `pnpm install` fails.

## Domain glossary (Mongolian → code)

| Mongolian | Code | Notes |
|---|---|---|
| Боломжит харилцагч / сэжим | `Lead` | pre-contract |
| Гэрээтэй хэрэглэгч | *derived*, not a role | user with an active `Contract` |
| Хэрэг (үйлчилгээний нэг мөчлөг) | `Case` | central aggregate: one user + one service + one target university |
| Зуучлалын гэрээ | `Contract` | |
| Барьцааны гэрээ | `CollateralContract` | metadata only — never priced or automated (`gksedu.md` §5.4) |
| Урьдчилгаа / үлдэгдэл төлбөр | `Payment` kind `PREPAYMENT` / `BALANCE` | |
| Материал / бичиг баримт | `DocumentTemplate` → `CaseDocument` | template vs. instance |
| Мэдүүлэг | `Application` | GKS has two decision rounds |
| Урилга | `Invitation` | |
| Виз | `VisaCase` | |
| Явахын өмнөх бэлтгэл | `DeparturePlan` | |

Full entity definitions and state machines: `docs/ARCHITECTURE.md` §3–§9.

## Two rules that are easy to get wrong

- **Balance-payment timing differs by service.** Regular brokerage (language prep, BA, MA,
  PhD) → balance is due **after the visa is issued**. GKS scholarship → balance is due
  **after the scholarship result**, before the visa. Never hard-code one order (`gksedu.md` §9).
- **Prices and prepayment are admin configuration**, not constants. 1,200,000₮ / 5,000,000₮
  and the 200,000₮ / 1,500,000₮ prepayments are *current values* stored in `ServicePricing`
  (`gksedu.md` §5.4).

## University reference data

`/Users/user/korean-universities-data` — 135 JSON records + 108 standardised logos, built
from Wikipedia/Wikidata. Import it, don't retype it. `index.json` for lists,
`data/<slug>.json` for detail. Every record carries a `quality` block saying which fields are
verified, editorial, or estimated — surface `null` as "мэдээлэл шинэчлэгдэж байна", never as
a confident zero. Dormitory prices, international-student counts and `nearestMetroBus` are
unfilled by design.

## Working on tasks

1. Find the task in `docs/TASKS.md` (IDs like `1D-04`).
2. Set its status to `wip` **before** you start, `done` when it is merged and verified.
3. `pnpm tasks` prints progress per epic — run it after editing statuses.
4. A task that turns out to need a decision from the business goes to `blocked`, with the
   question added to `docs/ARCHITECTURE.md` §18 (Нээлттэй асуултууд).
5. Don't invent scope. If the spec is silent, ask — `gksedu.md` §24 already lists five
   unresolved business questions.

## Commands

```bash
pnpm dev              # web :3000 + api :3001
pnpm prisma:migrate   # after any schema change
pnpm prisma:seed
pnpm typecheck && pnpm lint && pnpm test
pnpm tasks            # roadmap progress
```
