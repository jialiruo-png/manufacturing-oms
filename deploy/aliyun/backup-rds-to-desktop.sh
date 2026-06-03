#!/usr/bin/env bash
set -euo pipefail

ECS_HOST="${ECS_HOST:-YOUR_ECS_PUBLIC_IP}"
ECS_USER="${ECS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/manufacturing_oms_backup_ed25519}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Desktop/Database}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/root/db-backups}"
RDS_URL="${RDS_URL:-postgresql://RDS_USER@RDS_INTERNAL_ENDPOINT:5432/manufacturing_oms?sslmode=disable}"
PG_DUMP="${PG_DUMP:-/usr/lib/postgresql/18/bin/pg_dump}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

LOG_FILE="$BACKUP_DIR/backup.log"
exec >>"$LOG_FILE" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup started"

remote_dump="$(
  ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$ECS_USER@$ECS_HOST" \
    "set -euo pipefail; mkdir -p '$REMOTE_BACKUP_DIR'; ts=\$(date +%Y%m%d%H%M%S); dump='$REMOTE_BACKUP_DIR/rds-manufacturing_oms-'\$ts'.dump'; '$PG_DUMP' --format=custom --no-owner --no-acl --file=\"\$dump\" '$RDS_URL'; sha256sum \"\$dump\" > \"\$dump.sha256\"; printf '%s\n' \"\$dump\""
)"

remote_sha="${remote_dump}.sha256"
local_dump="$BACKUP_DIR/$(basename "$remote_dump")"
local_sha="$BACKUP_DIR/$(basename "$remote_sha")"

rsync -a -e "ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$ECS_USER@$ECS_HOST:$remote_dump" "$local_dump"
rsync -a -e "ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$ECS_USER@$ECS_HOST:$remote_sha" "$local_sha"

expected_hash="$(awk '{print $1}' "$local_sha")"
actual_hash="$(shasum -a 256 "$local_dump" | awk '{print $1}')"

if [[ "$expected_hash" != "$actual_hash" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] checksum mismatch for $local_dump"
  echo "expected: $expected_hash"
  echo "actual:   $actual_hash"
  exit 1
fi

chmod 600 "$local_dump" "$local_sha"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup completed: $local_dump"
