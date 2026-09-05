#!/usr/bin/env bash
# One-page health check of the production deployment and of the box it shares.
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

log "PM2"
remote_node "pm2 list" | sed 's/^/  /'

log "Services"
remote "for s in nginx postgresql@17-main redis-server; do printf '  %-22s %s\n' \$s \$(systemctl is-active \$s); done"

log "Ports"
remote "ss -tln | grep -E ':($API_PORT|$WEB_PORT) ' | sed 's/^/  /' || echo '  neither port is listening'"

log "Resources (shared with 10 other apps)"
remote "free -h | head -2 | sed 's/^/  /'; df -h / | tail -1 | sed 's/^/  /'; uptime | sed 's/^/  /'"

log "Database"
remote "sudo -u postgres psql -d $DB_NAME -tAc \"SELECT 'size ' || pg_size_pretty(pg_database_size('$DB_NAME'))\" | sed 's/^/  /'"
remote "sudo -u postgres psql -d $DB_NAME -tAc \"SELECT '  ' || count(*) || ' tables' FROM information_schema.tables WHERE table_schema='public'\""

log "Certificate"
remote "sudo certbot certificates -d $DOMAIN 2>/dev/null | grep -E 'Domains|Expiry' | sed 's/^/ /' || echo '  none yet'"

log "Over HTTPS"
# Pinned to the server's address: a stale DNS cache on the machine running this
# script would otherwise report on whoever the old A record pointed at.
SERVER_IP=$(remote "curl -fsS -m 10 https://api.ipify.org")
for path in "/" "/universities" "/api/v1/health"; do
  code=$(curl -s --resolve "$DOMAIN:443:$SERVER_IP" -m 20 -o /dev/null \
         -w '%{http_code}' "https://$DOMAIN$path" 2>/dev/null || echo unreachable)
  printf '  %-42s %s\n' "https://$DOMAIN$path" "$code"
done

log "What public DNS says"
printf '  %-42s %s\n' "$DOMAIN" "$(dig +short @8.8.8.8 "$DOMAIN" A | tail -1) (server: $SERVER_IP)"

