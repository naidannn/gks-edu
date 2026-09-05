#!/usr/bin/env bash
# One-off: copy the data out of the Supabase development database into the
# production PostgreSQL 17 on the server.
#
# Schema is NOT copied. ./deploy/migrate.sh has already built it from the
# Prisma migrations, which matters because the two databases disagree about
# where pgvector lives (Supabase keeps it in `extensions`, we keep it in
# `public`) — a schema dump would carry that difference across. A data-only
# dump is just COPY statements and cares about neither.
#
# Both ends run PostgreSQL 17 and both sit in ap-southeast-1, and the dump runs
# on the server so the data never makes the round trip through this machine.
#
#   ./deploy/migrate-from-supabase.sh            copy (asks before truncating)
#   ./deploy/migrate-from-supabase.sh --yes      no prompt
#
# The source URL is read from DIRECT_URL in the repo-root .env.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key

ASSUME_YES=0
[[ "${1:-}" == "--yes" ]] && ASSUME_YES=1

SRC_URL="$(grep -E '^DIRECT_URL=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d '"')"
[[ -n "$SRC_URL" ]] || die "DIRECT_URL not found in $REPO_ROOT/.env"

REMOTE_URL_FILE="/tmp/.gksedu-src.url"
REMOTE_DUMP="/tmp/gksedu-supabase-data.sql.gz"

log "Source: $(printf '%s' "$SRC_URL" | sed -E 's|://([^:]+):[^@]+@|://\1:***@|')"
log "Target: $DB_NAME on $SSH_HOST"

# --- what is already in the target? ------------------------------------------
EXISTING=$(remote "sudo -u postgres psql -d $DB_NAME -tAc \"
  SELECT coalesce(sum(n_live_tup), 0) FROM pg_stat_user_tables WHERE schemaname='public'\"")
log "Target currently holds ${EXISTING:-0} rows"

if [[ $ASSUME_YES -eq 0 ]]; then
  warn "Every table in the target's public schema will be TRUNCATEd first."
  read -r -p "  Type 'yes' to continue: " reply
  [[ "$reply" == "yes" ]] || die "aborted"
fi

# Credentials go to the server in a 0600 file rather than on a command line,
# where `ps` would show them to every other user on this shared box.
printf 'export SRC_URL=%q\n' "$SRC_URL" | remote "cat > $REMOTE_URL_FILE && chmod 600 $REMOTE_URL_FILE"

log "Dumping (data only) on the server"
remote bash -euo pipefail <<REMOTE
. $REMOTE_URL_FILE
pg_dump "\$SRC_URL" \
  --data-only --schema=public \
  --exclude-table=_prisma_migrations \
  --no-owner --no-privileges --disable-triggers \
  | gzip > $REMOTE_DUMP
ls -lh $REMOTE_DUMP | awk '{print "    dump: " \$5}'
REMOTE
ok "Dump taken"

log "Truncating the target and restoring"
remote bash -euo pipefail <<REMOTE
# Truncate every base table in one statement so foreign keys never object.
# _prisma_migrations is excluded on purpose: it is Prisma's own ledger of which
# migrations this database has had applied, it is not part of the dump, and
# emptying it makes the next \`prisma migrate deploy\` try to build the schema
# again from scratch on top of the schema that is already there.
TABLES=\$(sudo -u postgres psql -d $DB_NAME -tAc "
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'")
if [ -n "\$TABLES" ]; then
  sudo -u postgres psql -d $DB_NAME -q -v ON_ERROR_STOP=1 \
    -c "TRUNCATE \$TABLES RESTART IDENTITY CASCADE"
fi

# --disable-triggers in the dump needs superuser, hence the postgres role.
gunzip -c $REMOTE_DUMP | sudo -u postgres psql -d $DB_NAME -q -v ON_ERROR_STOP=1
REMOTE
ok "Data restored"

# --- the files those rows point at -------------------------------------------
# document_files.path and contracts.pdfPath are relative to the storage root,
# and with STORAGE_DRIVER=local the bytes live on whichever disk wrote them.
# Bringing the rows over without the files would leave every download broken.
LOCAL_STORAGE="$REPO_ROOT/apps/api/storage"
if [[ -d "$LOCAL_STORAGE" ]] && [[ -n "$(ls -A "$LOCAL_STORAGE" 2>/dev/null)" ]]; then
  log "Copying uploaded files ($(du -sh "$LOCAL_STORAGE" | cut -f1))"
  # No --delete: anything already uploaded in production stays.
  rsync -az -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
        "$LOCAL_STORAGE/" "$SSH_USER@$SSH_HOST:$STORAGE_DIR/"
  ok "Files copied to $STORAGE_DIR"
else
  warn "No local files under apps/api/storage — nothing to copy"
fi

log "Refreshing materialized views"
# A data-only dump never carries materialized-view contents; they have to be
# recomputed from the rows that just landed. Collect the names first — an ssh
# inside a `while read` loop would swallow the list it is reading from.
MATVIEWS=$(remote "sudo -u postgres psql -d $DB_NAME -tAc \"SELECT matviewname FROM pg_matviews WHERE schemaname='public'\"")
for mv in $MATVIEWS; do
  remote "sudo -u postgres psql -d $DB_NAME -q -c 'REFRESH MATERIALIZED VIEW public.$mv'" && ok "refreshed $mv"
done

# Ownership: the restore ran as `postgres`, so anything it created belongs to
# postgres, not to the role the application logs in as.
remote "sudo -u postgres psql -d $DB_NAME -q \
  -c 'GRANT ALL ON ALL TABLES IN SCHEMA public TO $DB_USER' \
  -c 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO $DB_USER'"

log "Cleaning up credentials on the server"
remote "shred -u $REMOTE_URL_FILE 2>/dev/null || rm -f $REMOTE_URL_FILE; rm -f $REMOTE_DUMP"

log "Rows now in production"
remote "sudo -u postgres psql -d $DB_NAME -q -c 'ANALYZE' -tAc \"
  SELECT rpad(relname, 34) || lpad(n_live_tup::text, 8) FROM pg_stat_user_tables
  WHERE schemaname='public' AND n_live_tup > 0 ORDER BY n_live_tup DESC\"" \
  | sed 's/^/    /'

ok "Migration complete — verify with ./deploy/status.sh"
