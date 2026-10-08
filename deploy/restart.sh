#!/usr/bin/env bash
# Restart the two gksedu processes without redeploying. Touches nothing else.
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key
case "${1:-all}" in
  api) TARGETS="$PM2_API" ;;
  web) TARGETS="$PM2_WEB" ;;
  all) TARGETS="$PM2_API $PM2_WEB" ;;
  *)   die "usage: restart.sh [api|web|all]" ;;
esac
for n in $TARGETS; do
  # reload from the shared ecosystem so .env edits on the server are picked up
  remote_node "pm2 reload $ECOSYSTEM --only $n --update-env" >/dev/null && ok "restarted $n"
done
remote_node "pm2 list" | grep -E "gksedu|name" || true
