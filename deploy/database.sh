#!/usr/bin/env bash
# Creates (or re-syncs) the production database on the server's PostgreSQL 17.
#
# The password lives in deploy/.env.production, which is gitignored and is the
# single source of truth for the production environment — deploy.sh copies that
# file to the server as /var/www/gks-edu/.env. Re-running this script keeps the
# database role's password in step with that file; it never drops data.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

ENV_FILE="$DEPLOY_DIR/.env.production"

[[ -f "$ENV_FILE" ]] || die "deploy/.env.production not found — run ./deploy/init-env.sh first"

DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
[[ -n "$DB_PASSWORD" ]] || die "DB_PASSWORD missing from deploy/.env.production"

log "Ensuring role '$DB_USER' and database '$DB_NAME'"

remote "sudo -u postgres psql -v ON_ERROR_STOP=1 -q" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';
  ELSE
    ALTER ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';
  END IF;
END \$\$;
SQL

remote "sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" | grep -q 1 \
        || sudo -u postgres createdb -O $DB_USER $DB_NAME"

# pgvector and pg_trgm must exist before the first Prisma migration runs.
remote "sudo -u postgres psql -d $DB_NAME -v ON_ERROR_STOP=1 -q \
          -c 'CREATE EXTENSION IF NOT EXISTS vector;' \
          -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;' \
          -c 'ALTER DATABASE $DB_NAME OWNER TO $DB_USER;' \
          -c 'GRANT ALL ON SCHEMA public TO $DB_USER;'"

ok "Database ready"
remote "sudo -u postgres psql -d $DB_NAME -tAc \"SELECT extname || ' ' || extversion FROM pg_extension ORDER BY 1\"" \
  | sed 's/^/    /'
