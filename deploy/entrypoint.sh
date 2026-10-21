#!/bin/sh
# Writes /config.js and the nginx site from the environment, then starts nginx.
#   SITE_AUTHORITY   the house's sign-in realm, e.g. https://id.example.com/realms/acme ("{tenant}" with SITE_TENANT_FROM_HOST)
#   SITE_API         the Auctions API with its prefix, e.g. https://api.example.com/api/v1
#   SITE_TENANT      the house's slug; or SITE_TENANT_FROM_HOST=<base domain> when one container serves {slug}.<base domain>
#   SITE_CLIENT_ID   default "headless"
#   SITE_TERMS_URL   optional: the house's terms of sale
set -eu
: "${SITE_AUTHORITY:?set SITE_AUTHORITY}" "${SITE_API:?set SITE_API}"
if [ -z "${SITE_TENANT:-}" ] && [ -z "${SITE_TENANT_FROM_HOST:-}" ]; then echo "set SITE_TENANT or SITE_TENANT_FROM_HOST" >&2; exit 1; fi

json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
origin() { printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*#\1#'; }
tenant_line=""
[ -n "${SITE_TENANT:-}" ] && tenant_line="tenant: \"$(json "$SITE_TENANT")\","
[ -n "${SITE_TENANT_FROM_HOST:-}" ] && tenant_line="$tenant_line tenantFromHost: \"$(json "$SITE_TENANT_FROM_HOST")\","
terms="null"
[ -n "${SITE_TERMS_URL:-}" ] && terms="\"$(json "$SITE_TERMS_URL")\""

cat > /srv/site/config.js <<JS
window.SITE_CONFIG = { authority: "$(json "$SITE_AUTHORITY")", clientId: "$(json "${SITE_CLIENT_ID:-headless}")", api: "$(json "$SITE_API")", $tenant_line termsUrl: $terms };
JS

id_origin=$(origin "$SITE_AUTHORITY")
api_origin=$(origin "$SITE_API")
# nginx drops inherited add_header lines in a location that adds its own, so every location includes the same set.
cat > /etc/nginx/security-headers.conf <<CONF
# The page may talk only to the house's sign-in and the API, and run only its own scripts (Auctions ADR 0104).
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; connect-src 'self' $id_origin $api_origin; img-src 'self' blob: data: $api_origin; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' $id_origin" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Content-Type-Options "nosniff" always;
CONF
cat > /etc/nginx/conf.d/default.conf <<CONF
server {
  listen 80;
  root /srv/site;
  server_tokens off;
  location /assets/ { include /etc/nginx/security-headers.conf; add_header Cache-Control "public, max-age=31536000, immutable"; try_files \$uri =404; }
  location / { include /etc/nginx/security-headers.conf; add_header Cache-Control "no-cache"; try_files \$uri /index.html; }
}
CONF
exec nginx -g 'daemon off;'
