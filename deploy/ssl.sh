#!/usr/bin/env bash
# Obtains (or renews) the Let's Encrypt certificate for gksedu.mn.
#
# Uses the webroot plugin against /var/www/certbot — the same directory the
# other nine sites on this box already use — so nginx keeps serving throughout
# and no other site is interrupted. certbot's systemd timer handles renewal
# afterwards; the deploy hook below reloads nginx when it does.
#
#   ./deploy/ssl.sh              issue or renew
#   ./deploy/ssl.sh --dry-run    ask Let's Encrypt's staging path first

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

DRY=""
[[ "${1:-}" == "--dry-run" ]] && DRY="--dry-run"

# --- the certificate is only issuable if DNS actually points here ------------
log "Checking that $DOMAIN resolves to this server"
SERVER_IP=$(remote "curl -fsS -m 10 https://api.ipify.org")
ok "server public IP: $SERVER_IP"

for host in "$DOMAIN" "$WWW_DOMAIN"; do
  resolved=$(dig +short @8.8.8.8 "$host" A | tail -1)
  if [[ "$resolved" == "$SERVER_IP" ]]; then
    ok "$host → $resolved"
  else
    warn "$host → ${resolved:-(nothing)} — expected $SERVER_IP"
    die "DNS does not point at this server yet. Let's Encrypt would fail; fix the A record and re-run."
  fi
done

remote "sudo mkdir -p /var/www/certbot && sudo chown -R www-data:www-data /var/www/certbot"

# The HTTP vhost must be live to answer the challenge.
remote "sudo test -f /etc/nginx/sites-enabled/$DOMAIN" \
  || die "nginx site not installed — run ./deploy/nginx.sh first"

log "Requesting the certificate (webroot)"
remote "sudo certbot certonly --webroot -w /var/www/certbot \
        -d $DOMAIN -d $WWW_DOMAIN \
        --email $CERTBOT_EMAIL --agree-tos --no-eff-email \
        --keep-until-expiring --non-interactive $DRY" 2>&1 | sed 's/^/    /'

if [[ -n "$DRY" ]]; then
  ok "Dry run finished — re-run without --dry-run to issue for real"
  exit 0
fi

# Renewal must reload nginx, or the new certificate sits on disk unused.
remote "sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy && \
        printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null && \
        sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"

ok "Certificate issued"
remote "sudo certbot certificates -d $DOMAIN" 2>&1 | grep -E "Certificate Name|Domains|Expiry" | sed 's/^/    /'

log "Switching the vhost to HTTPS"
"$DEPLOY_DIR/nginx.sh"

log "Verifying from the outside"
sleep 2
if curl -fsS -m 15 -o /dev/null -w "    https://$DOMAIN → %{http_code}\n" "https://$DOMAIN/"; then
  ok "HTTPS is live"
else
  warn "HTTPS did not answer yet — check ./deploy/status.sh"
fi
