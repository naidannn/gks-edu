# Deploying GKSedu.mn

Production runs on a single AWS EC2 box in `ap-southeast-1`, reached at
**https://gksedu.mn**.

Everything is built on the developer's machine and only compiled output is
shipped. That is not a preference — the server has **1.9 GB of RAM shared with
ten other applications**, and a Nuxt build there would swap hard enough to
degrade them.

---

## The server is shared — read this first

`ec2-13-214-22-1.ap-southeast-1.compute.amazonaws.com` also runs
amarcargo.mn, store.amarcargo.mn, api.amarcargo.mn, hurdancargo.mn,
iweeltcargo.com, gks.mn, docs.amarhan.mn and iveelt.amarhan.mn — ten PM2
processes, nginx, and MongoDB, on 1.9 GB of RAM and a 19 GB disk.

Every script in this directory is written so it cannot disturb them:

| Risk | How it is avoided |
|---|---|
| PM2 restarting the wrong app | Every command names `gksedu-api` / `gksedu-front` explicitly. `pm2 restart all` appears nowhere. |
| A bad vhost taking nginx down | `nginx.sh` runs `nginx -t` first and un-links its own site if the test fails. nginx is **reloaded**, never restarted. |
| Running out of memory | A 2 GB swapfile was added (there was none), Postgres is tuned down to 128 MB shared buffers, Redis is capped at 128 MB, and both PM2 processes have `max_memory_restart` set. |
| `apt-get update` failing | Another app left a broken `mongodb-org` repo behind. `provision.sh` refreshes **only** the PGDG list rather than fixing someone else's repo. |
| Breaking the other apps' Node | They run on the system `/usr/bin/node` v18. We never touch it — Nest 12 and Nuxt 4 run under nvm's v22.22.2, named explicitly in `ecosystem.config.cjs`. |
| Port collisions | 3000–3004, 4000–4002, 5000 and 6000 are taken. We use **3010** (web) and **3011** (API). |

---

## Layout

```
/var/www/gks-edu/
├── .env                      production environment (0600)
├── ecosystem.config.cjs      PM2 process definitions
├── api/
│   ├── dist/                 compiled NestJS
│   ├── prisma/               schema + migrations
│   ├── node_modules -> _workspace/apps/api/node_modules
│   └── _workspace/           manifests + lockfile, where pnpm installs
├── web/.output/              Nuxt build (self-contained)
├── storage/                  uploaded documents — never touched by a deploy
└── logs/
```

`storage/` deliberately sits **outside** the rsynced directories, so a deploy's
`--delete` can never remove an uploaded contract or passport scan.

| Component | Where |
|---|---|
| PostgreSQL 17.11 + pgvector 0.8.6 + pg_trgm | on the server, `localhost:5432`, database `gks_edu` |
| Redis 7 | on the server, `localhost:6379`, capped at 128 MB |
| nginx vhost | `/etc/nginx/sites-available/gksedu.mn` (generated — do not hand-edit) |
| TLS | Let's Encrypt, webroot `/var/www/certbot`, renewed by the existing `certbot.timer` |

---

## Everyday deploy

```bash
./deploy/deploy.sh
```

Builds both apps locally, ships them, installs production dependencies on the
server, runs `prisma migrate deploy`, reloads PM2, and waits for both health
checks. Roughly 2–3 minutes.

```bash
./deploy/deploy.sh --skip-build      # reuse the existing .deploy-build/
./deploy/deploy.sh --skip-migrate    # no schema change in this release
./deploy/deploy.sh --api-only        # backend only
./deploy/deploy.sh --web-only        # frontend only (implies --skip-migrate)
```

## The other scripts

| Script | What it does | When |
|---|---|---|
| `init-env.sh` | Generates `deploy/.env.production` with fresh secrets. Never overwrites. | Once |
| `provision.sh` | Swap, PostgreSQL 17, pgvector, Redis, pnpm, directories. Idempotent. | Once, or after a rebuild |
| `database.sh` | Creates the `gks` role and `gks_edu` database, enables the extensions. | Once, or after rotating the password |
| `build.sh` | Local build into `.deploy-build/`. | Called by `deploy.sh` |
| `deploy.sh` | Ship and restart. | Every release |
| `migrate.sh` | `prisma migrate deploy` over an SSH tunnel. Also `status`, `seed`, `psql`. | Called by `deploy.sh` |
| `nginx.sh` | Writes and validates the vhost. HTTP-only until a certificate exists. | Once, and after any vhost change |
| `ssl.sh` | Issues the Let's Encrypt certificate, then switches the vhost to HTTPS. | Once; renewal is automatic |
| `migrate-from-supabase.sh` | One-off copy of the Supabase development data into production. | Done — 2026-09-05 |
| `status.sh` | PM2, services, ports, memory, disk, database size, certificate, HTTPS. | Any time |
| `logs.sh` | `./deploy/logs.sh [api\|web\|nginx] [lines]` | Debugging |
| `restart.sh` | `./deploy/restart.sh [api\|web\|all]` — no redeploy. | Debugging |

## First-time setup, in order

```bash
./deploy/init-env.sh        # writes deploy/.env.production — back it up
./deploy/provision.sh       # swap, postgres, redis, pnpm, dirs
./deploy/database.sh        # role + database + extensions
./deploy/deploy.sh          # build, ship, migrate, start
./deploy/nginx.sh           # HTTP vhost (needed for the ACME challenge)
./deploy/ssl.sh             # certificate, then the HTTPS vhost
```

---

## Migrations

`migrate.sh` opens an SSH tunnel and runs Prisma **from the developer's
machine**. Postgres listens on `localhost` only, and this keeps the Prisma CLI,
`tsx` and the university dataset on the machine that already has them instead
of installing a toolchain on a 1.9 GB server.

```bash
./deploy/migrate.sh            # migrate deploy
./deploy/migrate.sh status     # what is applied
./deploy/migrate.sh seed       # prisma db seed
./deploy/migrate.sh psql       # interactive psql on production
./deploy/migrate.sh -- pnpm exec tsx prisma/import-universities.ts
```

`prisma.config.ts` loads the repo-root `.env`, but `dotenv` never overwrites an
already-set variable — so the tunnel URLs exported by `migrate.sh` win over the
development ones.

---

## Secrets

`deploy/.env.production` holds the production secrets and is gitignored along
with `deploy/*.pem`. It is the **single source of truth**: `deploy.sh` copies it
to `/var/www/gks-edu/.env` (mode 0600) on every run, and
`ecosystem.config.cjs` reads that file to build each process's environment.

Change a value there, then `./deploy/deploy.sh --skip-build --skip-migrate` (or
`./deploy/restart.sh`) to apply it.

There is no other copy. Back it up somewhere safe — losing it means every user
is logged out (`JWT_SECRET`) and every stored file's signed URL breaks
(`STORAGE_SIGNING_SECRET`).

### Still unconfigured

These are deliberately empty; the application degrades gracefully rather than
failing:

| Variable | Effect while unset |
|---|---|
| `QPAY_USERNAME` / `QPAY_PASSWORD` / `QPAY_INVOICE_CODE` | `QPAY_MOCK=true` — invoices are faked, no real payment is taken |
| `GOOGLE_CLIENT_ID` / `NUXT_PUBLIC_GOOGLE_CLIENT_ID` | the "Google-ээр нэвтрэх" button does not render; `POST /auth/google` returns 503 |
| `RESEND_API_KEY` | emails are written to the log instead of sent |
| SMS gateway | not chosen yet (`ARCHITECTURE.md` §18 q.10) — messages are logged |
| `NUXT_PUBLIC_GA_ID` | no analytics script |

`SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` **are** set (2026-09-06): a consultation
request, a new account, a signed contract and a received payment post to the
office channel. The bot has to stay invited to that channel — remove it and
Slack answers `not_in_channel`, which the API logs and swallows.

---

## Troubleshooting

**A page 502s.** The upstream is down: `./deploy/status.sh`, then
`./deploy/logs.sh api`.

**The API will not boot.** `env.validation.ts` fails fast on a missing or weak
variable, and the reason is the first thing in `logs/api.err.log`. `JWT_SECRET`
and `JWT_REFRESH_SECRET` must each be at least 32 characters.

**`prisma migrate deploy` hangs.** Confirm the tunnel came up; if local port
55432 is busy, `DEPLOY_TUNNEL_PORT=55433 ./deploy/migrate.sh`.

**The certificate did not renew.** `certbot.timer` is enabled system-wide.
`ssl.sh` installs `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` so a
renewal actually reaches nginx. Check with
`sudo certbot certificates -d gksedu.mn`.

**A local check reports the wrong thing.** `gksedu.mn` used to point at
Netlify; a stale resolver cache still sends requests there. `status.sh` pins its
checks to the server's address for exactly this reason — `curl --resolve
gksedu.mn:443:13.214.22.1` does the same by hand.

**Out of memory.** `free -h`. The swapfile absorbs spikes, but sustained
pressure means something is leaking; `max_memory_restart` (450 MB API, 300 MB
web) will recycle the process before it reaches the other applications.
