#!/usr/bin/env bash
# Ship the built apps to the server and restart them. This is the everyday
# command: ./deploy/deploy.sh
#
#   --skip-build     reuse whatever is already in .deploy-build/
#   --skip-migrate   do not run prisma migrate deploy
#   --api-only       ship and restart the API only
#   --web-only       ship and restart the web only
#
# Nothing here touches another application: only $APP_DIR is written, and only
# the two gksedu-* PM2 processes are restarted.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

SKIP_BUILD=0; SKIP_MIGRATE=0; DO_API=1; DO_WEB=1
for arg in "$@"; do
  case "$arg" in
    --skip-build)   SKIP_BUILD=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --api-only)     DO_WEB=0 ;;
    --web-only)     DO_API=0; SKIP_MIGRATE=1 ;;
    *) die "unknown flag: $arg" ;;
  esac
done

ENV_FILE="$DEPLOY_DIR/.env.production"
[[ -f "$ENV_FILE" ]] || die "deploy/.env.production not found — run ./deploy/init-env.sh first"

START=$(date +%s)

# ------------------------------------------------------------------- build
if [[ $SKIP_BUILD -eq 0 ]]; then
  "$DEPLOY_DIR/build.sh"
else
  warn "Skipping build — using the existing .deploy-build/"
  [[ -d "$BUILD_DIR" ]] || die ".deploy-build/ does not exist; run without --skip-build"
fi

# --------------------------------------------------------------- env + dirs
log "Syncing environment and directories"
remote "mkdir -p $API_DIR $WEB_DIR $STORAGE_DIR $APP_DIR/logs"
scp -q -i "$SSH_KEY" "$ENV_FILE"                       "$SSH_USER@$SSH_HOST:$REMOTE_ENV"
scp -q -i "$SSH_KEY" "$DEPLOY_DIR/ecosystem.config.cjs" "$SSH_USER@$SSH_HOST:$APP_DIR/ecosystem.config.cjs"
remote "chmod 600 $REMOTE_ENV"
ok "Environment in place"

# ---------------------------------------------------------------------- API
if [[ $DO_API -eq 1 ]]; then
  log "Uploading the API"
  # --delete on dist/ and prisma/ only; node_modules/ and the .env alongside
  # them are left untouched.
  push "$BUILD_DIR/api/dist/"        "$API_DIR/dist/"
  push "$BUILD_DIR/api/prisma/"      "$API_DIR/prisma/"
  push "$BUILD_DIR/api/assets/"      "$API_DIR/assets/"
  push "$BUILD_DIR/api/_workspace/"  "$API_DIR/_workspace/"
  scp -q -i "$SSH_KEY" "$BUILD_DIR/api/package.json"     "$SSH_USER@$SSH_HOST:$API_DIR/package.json"
  scp -q -i "$SSH_KEY" "$BUILD_DIR/api/prisma.config.ts" "$SSH_USER@$SSH_HOST:$API_DIR/prisma.config.ts"
  ok "API uploaded"

  log "Installing production dependencies on the server"
  # Resolved from the workspace lockfile so the server gets Linux builds, not
  # the macOS ones this machine has. --ignore-scripts skips apps/api's
  # `prisma generate` postinstall: the client is already compiled into dist/,
  # and the Prisma CLI is a devDependency that --prod does not install.
  remote_node "cd $API_DIR/_workspace && \
    pnpm install --prod --frozen-lockfile --ignore-scripts --filter @gks/api 2>&1 | tail -5"
  # pnpm puts them at _workspace/apps/api/node_modules; the app runs from
  # $API_DIR, so point one at the other.
  remote "ln -sfn $API_DIR/_workspace/apps/api/node_modules $API_DIR/node_modules"
  ok "Dependencies installed"
fi

# ------------------------------------------------------------------ migrate
if [[ $SKIP_MIGRATE -eq 0 ]]; then
  "$DEPLOY_DIR/migrate.sh" deploy
fi

# ---------------------------------------------------------------------- WEB
if [[ $DO_WEB -eq 1 ]]; then
  log "Uploading the web build"
  push "$BUILD_DIR/web/.output/" "$WEB_DIR/.output/"
  ok "Web uploaded"
fi

# ------------------------------------------------------------------- restart
log "Restarting PM2 processes"
TARGETS=""
[[ $DO_API -eq 1 ]] && TARGETS="$TARGETS $PM2_API"
[[ $DO_WEB -eq 1 ]] && TARGETS="$TARGETS $PM2_WEB"

for name in $TARGETS; do
  if remote "pm2 describe $name >/dev/null 2>&1"; then
    # `reload` on a fork-mode process is a restart, but it re-reads the
    # ecosystem file, which is what we want after an env change.
    remote_node "pm2 reload $APP_DIR/ecosystem.config.cjs --only $name --update-env" >/dev/null
    ok "reloaded $name"
  else
    remote_node "pm2 start $APP_DIR/ecosystem.config.cjs --only $name" >/dev/null
    ok "started $name"
  fi
done
remote_node "pm2 save" >/dev/null 2>&1 || warn "pm2 save failed (processes are running, but may not survive a reboot)"

# -------------------------------------------------------------- health check
log "Waiting for the API to answer"
API_OK=0
for _ in $(seq 1 30); do
  if remote "curl -fsS -m 3 http://127.0.0.1:$API_PORT/api/v1/health >/dev/null 2>&1"; then
    API_OK=1; break
  fi
  sleep 2
done
[[ $API_OK -eq 1 ]] && ok "API healthy on :$API_PORT" || warn "API did not answer — ./deploy/logs.sh api"

if [[ $DO_WEB -eq 1 ]]; then
  log "Waiting for the web to answer"
  WEB_OK=0
  for _ in $(seq 1 30); do
    if remote "curl -fsS -m 5 -o /dev/null http://127.0.0.1:$WEB_PORT/ 2>/dev/null"; then
      WEB_OK=1; break
    fi
    sleep 2
  done
  [[ $WEB_OK -eq 1 ]] && ok "Web healthy on :$WEB_PORT" || warn "Web did not answer — ./deploy/logs.sh web"
fi

remote_node "pm2 list" | grep -E "gksedu|name" || true
printf '\n%s  ✓%s Deployed in %ss — https://%s\n' "$c_green" "$c_reset" "$(( $(date +%s) - START ))" "$DOMAIN"
