#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/manufacturing-oms-v5}"
BRANCH="${BRANCH:-main}"
PM2_APP="${PM2_APP:-manufacturing-oms-api}"
LOG_FILE="${LOG_FILE:-/var/log/manufacturing-oms/auto-deploy.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/manufacturing-oms-auto-deploy.lock}"

mkdir -p "$(dirname "$LOG_FILE")"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$LOG_FILE"
}

cd "$APP_ROOT"

git fetch origin "$BRANCH" >>"$LOG_FILE" 2>&1

LOCAL_REV="$(git rev-parse "HEAD")"
REMOTE_REV="$(git rev-parse "origin/$BRANCH")"
PENDING_MIGRATIONS="$(
  npm --prefix backend exec -- prisma migrate status 2>>"$LOG_FILE" \
    | grep -E 'Following migration.*not yet been applied|Database schema is not up to date|not in sync' \
    || true
)"

if [ "$LOCAL_REV" = "$REMOTE_REV" ] && [ -z "$PENDING_MIGRATIONS" ]; then
  exit 0
fi

if [ "$LOCAL_REV" != "$REMOTE_REV" ]; then
  log "Deploying ${LOCAL_REV:0:12} -> ${REMOTE_REV:0:12}"
else
  log "Applying pending database migrations at ${LOCAL_REV:0:12}"
fi

if [ "$LOCAL_REV" != "$REMOTE_REV" ]; then
  git reset --hard "origin/$BRANCH" >>"$LOG_FILE" 2>&1
  npm --prefix backend ci >>"$LOG_FILE" 2>&1
  npm --prefix frontend ci >>"$LOG_FILE" 2>&1
fi
npm --prefix backend run db:deploy >>"$LOG_FILE" 2>&1
if [ "$LOCAL_REV" != "$REMOTE_REV" ]; then
  npm --prefix backend run build >>"$LOG_FILE" 2>&1
  deploy/aliyun/build-frontend-safe.sh >>"$LOG_FILE" 2>&1
  pm2 restart "$PM2_APP" --update-env >>"$LOG_FILE" 2>&1
fi

for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3001/api/health >>"$LOG_FILE" 2>&1; then
    break
  fi

  if [ "$attempt" -eq 20 ]; then
    log "Backend health check failed after restart"
    exit 1
  fi

  sleep 1
done

systemctl reload nginx >>"$LOG_FILE" 2>&1

log "Deployment finished: ${REMOTE_REV:0:12}"
