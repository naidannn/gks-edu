#!/usr/bin/env bash
# Installs the gksedu.mn vhost.
#
# Writes an HTTP-only config while no certificate exists (so certbot's
# webroot challenge can be served), and the full HTTPS config once
# /etc/letsencrypt/live/gksedu.mn is there. ssl.sh calls this script again
# after issuing the certificate.
#
# The other nine sites on this box are never read, written or reloaded out from
# under: the config is validated with `nginx -t` before anything happens, and
# nginx is *reloaded*, not restarted, so no live connection is dropped.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

SITE="/etc/nginx/sites-available/$DOMAIN"
LINK="/etc/nginx/sites-enabled/$DOMAIN"

if remote "sudo test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
  MODE=https
else
  MODE=http
  warn "No certificate yet — installing the HTTP-only config. Run ./deploy/ssl.sh next."
fi

log "Writing $SITE ($MODE)"

# ---------------------------------------------------------------- shared bits
read -r -d '' PROXY_COMMON <<'EOF' || true
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300;
EOF

BODY=$(cat <<EOF
    # Уншиж байгаа хүнд: энэ файлыг deploy/nginx.sh үүсгэдэг. Гараар засвал
    # дараагийн deploy дарж бичнэ — өөрчлөлтөө скрипт дотор хий.

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Гэрээ, бичиг баримтын файл (CaseDocument) — PDF/зураг байршуулна.
    client_max_body_size 25m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json image/svg+xml;

    # NestJS API. The app sets its own global prefix (/api) and URI versioning
    # (/v1), so the path is passed through unchanged.
    location /api/ {
        proxy_pass http://gksedu_api;
$PROXY_COMMON
    }

    # Nuxt 4 SSR.
    location / {
        proxy_pass http://gksedu_web;
$PROXY_COMMON
    }

    # Nuxt's hashed build assets — immutable, so let the browser keep them.
    location ^~ /_nuxt/ {
        proxy_pass http://gksedu_web;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
EOF
)

if [[ "$MODE" == "http" ]]; then
  CONFIG=$(cat <<EOF
# GKSedu.mn — зуучлалын платформ. deploy/nginx.sh үүсгэсэн.
# HTTP-only: SSL гэрчилгээ авах хүртэл. ./deploy/ssl.sh ажиллуулна уу.

upstream gksedu_api { server 127.0.0.1:$API_PORT; }
upstream gksedu_web { server 127.0.0.1:$WEB_PORT; }

server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

$BODY
}
EOF
)
else
  CONFIG=$(cat <<EOF
# GKSedu.mn — зуучлалын платформ. deploy/nginx.sh үүсгэсэн.

upstream gksedu_api { server 127.0.0.1:$API_PORT; }
upstream gksedu_web { server 127.0.0.1:$WEB_PORT; }

server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$DOMAIN\$request_uri;
    }
}

server {
    # nginx 1.24 on this host predates the separate \`http2 on;\` directive, and
    # the other sites already listen on :443 with these exact options — nginx
    # warns if one server block disagrees with the rest about a shared port.
    listen 443 ssl http2;
    server_name $DOMAIN $WWW_DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # www -> apex, so one canonical origin (CORS_ORIGIN allows both anyway).
    if (\$host = $WWW_DOMAIN) {
        return 301 https://$DOMAIN\$request_uri;
    }

$BODY
}
EOF
)
fi

printf '%s\n' "$CONFIG" | remote "sudo tee $SITE >/dev/null"
remote "sudo ln -sfn $SITE $LINK"

log "Validating the whole nginx configuration"
if ! remote "sudo nginx -t" 2>&1 | sed 's/^/    /'; then
  remote "sudo rm -f $LINK"
  die "nginx -t failed; the site was disabled again and nothing was reloaded"
fi

remote "sudo systemctl reload nginx"
ok "nginx reloaded — $DOMAIN is served ($MODE)"
