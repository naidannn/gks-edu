#!/usr/bin/env bash
# Tail the production logs.
#   ./deploy/logs.sh          both processes
#   ./deploy/logs.sh api      the NestJS API
#   ./deploy/logs.sh web      the Nuxt server
#   ./deploy/logs.sh nginx    this site's nginx error log
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
require_key
LINES="${2:-100}"
case "${1:-all}" in
  api)   remote_node "pm2 logs $PM2_API --lines $LINES" ;;
  web)   remote_node "pm2 logs $PM2_WEB --lines $LINES" ;;
  nginx) remote "sudo tail -n $LINES -f /var/log/nginx/error.log" ;;
  all)   remote_node "pm2 logs $PM2_API $PM2_WEB --lines $LINES" ;;
  *)     die "usage: logs.sh [api|web|nginx|all] [lines]" ;;
esac
