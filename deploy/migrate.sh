#!/usr/bin/env bash
# Applies pending Prisma migrations to the production database.
#
# Postgres on the server listens on localhost only, so this opens a temporary
# SSH tunnel and runs the migration from here. That keeps the Prisma CLI (and
# tsx, and the university dataset the import scripts need) on the machine that
# already has them, instead of installing a toolchain on a 1.9 GB server.
#
#   ./deploy/migrate.sh            prisma migrate deploy
#   ./deploy/migrate.sh status     prisma migrate status
#   ./deploy/migrate.sh seed       prisma db seed
#   ./deploy/migrate.sh psql       an interactive psql on the production DB
#   ./deploy/migrate.sh -- <cmd>   any command, with the tunnel env exported

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

ENV_FILE="$DEPLOY_DIR/.env.production"
[[ -f "$ENV_FILE" ]] || die "deploy/.env.production not found — run ./deploy/init-env.sh first"

DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
[[ -n "$DB_PASSWORD" ]] || die "DB_PASSWORD missing from deploy/.env.production"

LOCAL_PORT="${DEPLOY_TUNNEL_PORT:-55432}"

# --- open the tunnel ---------------------------------------------------------
if lsof -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "local port $LOCAL_PORT is in use — set DEPLOY_TUNNEL_PORT to something else"
fi

log "Opening SSH tunnel localhost:$LOCAL_PORT → $SSH_HOST:5432"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    -N -L "$LOCAL_PORT:127.0.0.1:5432" "$SSH_USER@$SSH_HOST" &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null && break
  sleep 0.5
done
nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null || die "tunnel did not come up"
ok "Tunnel up"

# prisma.config.ts loads the repo-root .env, but dotenv never overwrites a
# variable that is already set — so exporting these here wins over the
# development URLs.
PROD_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:$LOCAL_PORT/$DB_NAME?schema=public"
export DATABASE_URL="$PROD_URL"
export DIRECT_URL="$PROD_URL"

cd "$REPO_ROOT/apps/api"

case "${1:-deploy}" in
  deploy)
    log "prisma migrate deploy"
    pnpm exec prisma migrate deploy
    ;;
  status)
    pnpm exec prisma migrate status
    ;;
  seed)
    log "prisma db seed"
    pnpm exec prisma db seed
    ;;
  psql)
    PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$LOCAL_PORT" -U "$DB_USER" "$DB_NAME"
    ;;
  --)
    shift
    "$@"
    ;;
  *)
    die "unknown command: $1 (deploy|status|seed|psql|-- <cmd>)"
    ;;
esac

ok "Done"
