#!/usr/bin/env bash
# Shared settings for every deploy/*.sh script. Sourced, never run directly.
#
# Production runs on the shared Contabo server (184.174.37.49, ssh alias
# "contabo") next to the other Amarhan apps. Its layout is described in
# /srv/apps/README.md: every project lives in /srv/apps/<name>, fronts listen on
# 30xx and APIs on 40xx (gksedu is project 14), all PM2 processes are defined in
# one /srv/apps/ecosystem.config.js, and nginx sites are made with `sudo mksite`.

set -euo pipefail

# --- Remote host -------------------------------------------------------------
SSH_USER="deploy"
SSH_HOST="184.174.37.49"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/contabo}"

# --- Domain ------------------------------------------------------------------
DOMAIN="gksedu.mn"
WWW_DOMAIN="www.gksedu.mn"
CERTBOT_EMAIL="kh.naidan@gmail.com"

# --- Ports -------------------------------------------------------------------
# Server convention: front 30xx, API 40xx, xx = project number (gksedu = 14).
# The PM2 ecosystem file pins these; .env's API_PORT/WEB_PORT must match.
WEB_PORT=3014
API_PORT=4014

# --- Remote layout -----------------------------------------------------------
APP_DIR="/srv/apps/gksedu"
API_DIR="$APP_DIR/api"        # dist/ + node_modules/ + prisma/
WEB_DIR="$APP_DIR/web"        # Nuxt .output/
STORAGE_DIR="$APP_DIR/storage"
REMOTE_ENV="$APP_DIR/.env"

# --- PM2 ---------------------------------------------------------------------
PM2_API="gksedu-api"
PM2_WEB="gksedu-front"
# Shared ecosystem for every app on the server. It loads $REMOTE_ENV into the
# gksedu processes itself (envFile()), so reloading from it picks up .env edits.
ECOSYSTEM="/srv/apps/ecosystem.config.js"
# System node on Contabo is v22 — no nvm.
REMOTE_NODE="/usr/bin/node"

# --- Database ----------------------------------------------------------------
DB_NAME="gks_edu"
DB_USER="gks"

# --- Local paths -------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy"
BUILD_DIR="$REPO_ROOT/.deploy-build"   # local staging, safe to delete

# --- Helpers -----------------------------------------------------------------
c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'
c_yellow=$'\033[33m'; c_red=$'\033[31m'

log()  { printf '%s==>%s %s\n' "$c_blue"  "$c_reset" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$c_green" "$c_reset" "$*"; }
warn() { printf '%s  !%s %s\n' "$c_yellow" "$c_reset" "$*"; }
die()  { printf '%s  ✗%s %s\n' "$c_red"   "$c_reset" "$*" >&2; exit 1; }

# Run a command on the server.
remote() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
      "$SSH_USER@$SSH_HOST" "$@"
}

# Same, but with PM2 and node 22 on PATH.
remote_node() {
  remote "export PATH=$(dirname "$REMOTE_NODE"):\$PATH; $*"
}

push() {  # push <local> <remote>
  rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
        "$1" "$SSH_USER@$SSH_HOST:$2"
}

require_key() {
  [[ -f "$SSH_KEY" ]] || die "SSH key not found: $SSH_KEY"
  # ssh refuses a key the whole world can read.
  chmod 600 "$SSH_KEY"
}

# nginx, TLS and base packages on Contabo are shared and managed by hand
# (/srv/apps/README.md) — the one-time scripts written for the old EC2 box
# must not run there.
not_on_contabo() {
  die "$(basename "$0") was written for the old EC2 server. On Contabo: nginx → 'sudo mksite' (site already exists: /etc/nginx/sites-available/$DOMAIN.conf), TLS → certbot nginx plugin (auto-renew), Postgres 17 + pgvector + Redis are already installed. See /srv/apps/README.md."
}
