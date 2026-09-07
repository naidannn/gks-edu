# CLAUDE.md — GKSedu.mn

Guidance for coding-agent sessions in this repository (`AGENTS.md` is a symlink to this
file — one source of truth). Read this before touching code.

## What this project is

**GKSedu.mn** — a single platform that runs the study-abroad **brokerage** business of
"Жи Кэй Эс Эдү Групп" ХХК (GKS EDU GROUP): from first enquiry → lead → contract → QPay
payment → document collection → university application → invitation → visa → departure.

The business spec lives in `docs/gksedu.md` (Mongolian, authoritative). The technical
design derived from it is `docs/ARCHITECTURE.md`. Work is tracked in `docs/ROADMAP.md`
(phases) and `docs/TASKS.md` (open tasks + status); finished ones are archived in
`docs/TASKS-DONE.md`, so read that only when you need the history.

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
8. **Read-only queries run under `Promise.all`, never `$transaction`.** The database is a
   Supabase pooler in `ap-southeast-1` — roughly 115 ms away. A `$transaction([...])` batch
   pays `BEGIN` and `COMMIT` as extra round trips, so the usual `[findMany, count]` pair
   costs ~500 ms instead of ~115 ms. Keep `$transaction` for writes that must be atomic.

## Domain glossary (Mongolian → code)

| Mongolian | Code | Notes |
|---|---|---|
| Боломжит харилцагч / сэжим | `Lead` | pre-contract |
| Гэрээтэй хэрэглэгч | *derived*, not a role | user with an active `Contract` |
| Хэрэг (үйлчилгээний нэг мөчлөг) | `Case` | central aggregate: one user + one service + one target university |
| Элсэлтийн улирал | `IntakeTerm` | one school × level × year × month; `IntakeProgramOverride` for a programme on its own calendar |
| Зуучлалын гэрээ | `Contract` | |
| Барьцааны гэрээ | `CollateralContract` | metadata only — never priced or automated (`gksedu.md` §5.4) |
| Урьдчилгаа / үлдэгдэл төлбөр | `Payment` kind `PREPAYMENT` / `BALANCE` | |
| Танхим | `Faculty` | one college of one school (단과대학); a programme may have none |
| Анги / хөтөлбөр | `UniversityProgram` | one department at one school, with its tuition |
| Материал / бичиг баримт | `DocumentTemplate` → `CaseDocument` | template vs. instance |
| Мэдүүлэг | `Application` | GKS has two decision rounds |
| Урилга | `Invitation` | |
| Виз | `VisaCase` | |
| Явахын өмнөх бэлтгэл | `DeparturePlan` | |

Full entity definitions and state machines: `docs/ARCHITECTURE.md` §3–§9.

## Four rules that are easy to get wrong

- **The school's deadline is not our deadline, and clients never see the school's.**
  `IntakeTerm.applicationDeadline` is the school's published last day; `internalDeadline`
  is ours, `AdmissionConfig.internalLeadDays` earlier (currently 7 — configuration, not a
  constant). Translation, notarisation and postage live in that gap. Every case, reminder
  and countdown runs on the **internal** date, and it is the only deadline in a public or
  portal payload — given two dates people work to the later one. Staff see both. There is
  also no "not open yet" phase: we register for a published round any time before our own
  deadline, so `openAt` never gates anything. A deadline a human typed sets
  `internalDeadlineIsManual` and is never recomputed. All of the arithmetic lives in
  `apps/api/src/modules/admissions/intake-deadline.ts` — don't re-derive it elsewhere
  (`ARCHITECTURE.md` §3.2).
- **Balance-payment timing differs by service.** Regular brokerage (language prep, BA, MA,
  PhD) → balance is due **after the visa is issued**. GKS scholarship → balance is due
  **after the scholarship result**, before the visa. Never hard-code one order (`gksedu.md` §9).
- **Prices and prepayment are admin configuration**, not constants. 1,200,000₮ / 5,000,000₮
  and the 200,000₮ / 1,500,000₮ prepayments are *current values* stored in `ServicePricing`
  (`gksedu.md` §5.4).
- **The catalogue is `Сургууль → Танхим → Анги`, and there is no subject taxonomy.**
  A `Faculty` is the school's own college (단과대학) and belongs to one school; a programme
  may have none, which is normal for a graduate department. There used to be a canonical
  `StudyField` list mapping every school's wording onto one subject — it is gone on purpose:
  it was a second vocabulary somebody maintained forever, and what a visitor types is a word.
  Search (`programSearchWhere`) matches that word against the programme's three names, the
  faculty's three names, and — only for terms of 4+ characters — the school's, because "IT"
  is two and "Univers**it**y" contains it. Tuition is stored the way Korean schools publish
  it — **per semester**, with `tuitionYear` saying which year's table it came from; never
  write the ×2 annual figure into the database. `tuitionYear` is a staff signal, not a public
  one: the admin list sorts and flags on it (`staleTuition`), the public card does not carry
  it (`ARCHITECTURE.md` §3.3).

## University reference data

`/Users/user/korean-universities-data` — 135 JSON records + 108 standardised logos, built
from Wikipedia/Wikidata. Import it, don't retype it. `index.json` for lists,
`data/<slug>.json` for detail. Every record carries a `quality` block saying which fields are
verified, editorial, or estimated — surface `null` as "мэдээлэл шинэчлэгдэж байна", never as
a confident zero. Dormitory prices, international-student counts and `nearestMetroBus` are
unfilled by design.

## Two ranks, not one

A university carries a **base rank** and a **GKS rank**, and they are not interchangeable
(`ARCHITECTURE.md` §3.1).

- **Base rank** — Times Higher Education's *South Korea Rank 2026*. Imported from the table
  in `apps/api/src/modules/universities/ranking/the-korea-ranking.ts` by `pnpm ranking:import`.
  Only 41 Korean universities are in it, so `theKoreaRank = null` means "рэйтингд ороогүй",
  never "worst". This is the only rank shown publicly.
- **GKS rank** — ours. `gksScore` blends five weighted components, `gksRank` is the dense
  ranking over it, and that is the **default order of the catalogue and of every search**.
  Never public: it orders the list, it does not appear on the card.

`gksScore` and `gksRank` are computed columns — only `GksRankingService` writes them. Weights
live in `GksRankingConfig`, which is admin configuration like `ServicePricing`, not constants.
The components are relative to each other, so the whole catalogue is always rescored together —
there is no rescoring one row.

Staff get two handles, and which one works depends on `GksRankingConfig.mode`:
`gksRankBoost` (±25 score points) nudges the formula in `AUTO`; `University.gksManualRank`
(1 = first) *replaces* it in `MANUAL`, where the catalogue is simply the order the office put
the schools in and the formula only places whatever nobody has numbered — below the rest. The
ordering screen is `/admin/universities/ranking` (`ARCHITECTURE.md` §3.1).

## Working on tasks

1. Find the task in `docs/TASKS.md` (IDs like `1D-04`). Only open work lives there.
2. Set its status to `wip` **before** you start. When it is merged and verified, set it to
   `done` and **move the row to `docs/TASKS-DONE.md`**, under the same epic heading.
3. `pnpm tasks` reads both files and prints progress per epic — run it after editing statuses.
   Both are in `.prettierignore`: keep the tables unpadded, `| a | b |`, not column-aligned.
4. A task that turns out to need a decision from the business goes to `blocked`, with the
   question added to `docs/ARCHITECTURE.md` §18 (Нээлттэй асуултууд).
5. Don't invent scope. If the spec is silent, ask — `gksedu.md` §24 already lists five
   unresolved business questions.

## Commands

```bash
pnpm dev              # web :3000 + api :3001
pnpm prisma:migrate   # after any schema change
pnpm prisma:seed
pnpm ranking:import   # THE South Korea rank → theKoreaRank (--dry to preview)
pnpm typecheck && pnpm lint && pnpm test
pnpm tasks            # roadmap progress
```
