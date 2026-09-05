#!/usr/bin/env bash
# Shared settings for every deploy/*.sh script. Sourced, never run directly.
#
# The server hosts ten other applications (amarcargo, hurdancargo, iweeltcargo,
# monkor/gks.mn, amarhan-docs). Everything here is namespaced so nothing this
# repo does can touch them: our own ports, our own PM2 names, our own nginx
# site, our own Postgres database.

set -euo pipefail

# --- Remote host -------------------------------------------------------------
SSH_USER="ubuntu"
SSH_HOST="ec2-13-214-22-1.ap-southeast-1.compute.amazonaws.com"
SSH_KEY="${DEPLOY_SSH_KEY:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/hurdan.pem}"

# --- Domain ------------------------------------------------------------------
DOMAIN="gksedu.mn"
WWW_DOMAIN="www.gksedu.mn"
CERTBOT_EMAIL="kh.naidan@gmail.com"

# --- Ports -------------------------------------------------------------------
# Taken on this box already: 3000 3001 3002 3003 3004 4000 4001 4002 5000 6000.
# Keep these two free for us; check with `ss -tln` before changing them.
WEB_PORT=3010
API_PORT=3011

# --- Remote layout -----------------------------------------------------------
APP_DIR="/var/www/gks-edu"
API_DIR="$APP_DIR/api"        # dist/ + node_modules/ + prisma/
WEB_DIR="$APP_DIR/web"        # Nuxt .output/
STORAGE_DIR="$APP_DIR/storage"
REMOTE_ENV="$APP_DIR/.env"

# --- PM2 ---------------------------------------------------------------------
PM2_API="gksedu-api"
PM2_WEB="gksedu-front"
# /usr/bin/node on this host is v18, which Nest 12 and Nuxt 4 do not support.
# Other apps depend on that v18 staying where it is, so we name our own
# interpreter explicitly instead of touching the system node.
REMOTE_NODE="/home/ubuntu/.nvm/versions/node/v22.22.2/bin/node"

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
