#!/usr/bin/env bash
# One-time server preparation. Idempotent — safe to re-run.
#
# Installs, on a box that already runs ten other applications:
#   * a 2 GB swapfile (1.9 GB RAM, no swap: adding services without it risks
#     the OOM killer picking off someone else's app)
#   * PostgreSQL 17 + pgvector + pg_trgm, listening on localhost only
#   * Redis, capped at 128 MB, localhost only
#   * pnpm under the existing nvm node 22 (the system node stays v18 because
#     the other apps run on it)
#   * /var/www/gks-edu
#
# It never restarts nginx, never touches another site, and never upgrades a
# package another app depends on.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

log "Provisioning $SSH_HOST"

remote bash -euo pipefail <<REMOTE
# ---------------------------------------------------------------- swap
if swapon --show | grep -q .; then
  echo "  swap: already configured"
else
  echo "  swap: creating 2G /swapfile"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-gksedu-swap.conf >/dev/null
  sudo sysctl -q -w vm.swappiness=10
fi

# ------------------------------------------------------------ postgres
if ! command -v psql >/dev/null || ! psql --version | grep -q ' 17\.'; then
  echo "  postgres: installing 17 from PGDG"
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  # Refresh ONLY the pgdg list. A plain 'apt-get update' fails on this host
  # because another app left a broken mongodb-org repo behind, and fixing
  # someone else's repo is not ours to do.
  sudo apt-get update -qq \
    -o Dir::Etc::sourcelist="sources.list.d/pgdg.list" \
    -o Dir::Etc::sourceparts="-" \
    -o APT::Get::List-Cleanup="0"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
       postgresql-17 postgresql-17-pgvector postgresql-client-17
else
  echo "  postgres: 17 already installed"
fi

# Tuning for a shared 1.9 GB box.
sudo tee /etc/postgresql/17/main/conf.d/10-gksedu-tuning.conf >/dev/null <<'PGCONF'
# Tuned for a 1.9 GB box that also runs nginx, mongod and ten node apps.
listen_addresses = 'localhost'
max_connections = 50
shared_buffers = 128MB
effective_cache_size = 384MB
maintenance_work_mem = 48MB
work_mem = 4MB
wal_buffers = 4MB
min_wal_size = 80MB
max_wal_size = 512MB
random_page_cost = 1.1
PGCONF
sudo systemctl reload postgresql@17-main 2>/dev/null || sudo systemctl restart postgresql@17-main
sudo systemctl enable postgresql@17-main >/dev/null 2>&1 || true

# --------------------------------------------------------------- redis
if ! command -v redis-server >/dev/null; then
  echo "  redis: installing"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq redis-server
else
  echo "  redis: already installed"
fi
sudo mkdir -p /etc/redis/redis.conf.d
sudo tee /etc/redis/redis.conf.d/gksedu.conf >/dev/null <<'REDISCONF'
# Small box: cap Redis so it can never starve the other apps.
# noeviction is required by BullMQ — job payloads must not be evicted.
maxmemory 128mb
maxmemory-policy noeviction
REDISCONF
sudo grep -q 'redis.conf.d' /etc/redis/redis.conf \
  || echo 'include /etc/redis/redis.conf.d/*.conf' | sudo tee -a /etc/redis/redis.conf >/dev/null
sudo systemctl enable redis-server >/dev/null 2>&1 || true
sudo systemctl restart redis-server

# ---------------------------------------------------------------- pnpm
export PATH="$(dirname "$REMOTE_NODE"):\$PATH"
if ! command -v pnpm >/dev/null; then
  echo "  pnpm: installing under node 22"
  npm i -g pnpm@11.22.0 >/dev/null
else
  echo "  pnpm: \$(pnpm -v)"
fi

# ------------------------------------------------------------ app dirs
sudo mkdir -p "$API_DIR" "$WEB_DIR" "$STORAGE_DIR" /var/www/certbot
sudo chown -R $SSH_USER:$SSH_USER "$APP_DIR"
sudo chown -R www-data:www-data /var/www/certbot 2>/dev/null || true

# ----------------------------------------------------------- pm2 boot
pm2 startup systemd -u $SSH_USER --hp /home/$SSH_USER >/dev/null 2>&1 || true

echo
echo "  --- state ---"
free -h | head -2
systemctl is-active postgresql@17-main | sed 's/^/  postgres: /'
systemctl is-active redis-server        | sed 's/^/  redis:    /'
REMOTE

ok "Server provisioned"

log "Checking that our ports are still free"
remote "for p in $WEB_PORT $API_PORT; do ss -tln | grep -q \":\$p \" && echo \"  port \$p BUSY\" || echo \"  port \$p free\"; done"

cat <<EOF

Next:
  ./deploy/database.sh     create the production database and role
  ./deploy/deploy.sh       build locally, ship, migrate, start
  ./deploy/nginx.sh        install the gksedu.mn vhost
  ./deploy/ssl.sh          obtain the Let's Encrypt certificate
EOF
