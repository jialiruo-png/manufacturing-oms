#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${1:-${DIST_DIR:-frontend/dist}}"
KEEP_DAYS="${KEEP_DAYS:-7}"
ASSETS_DIR="$DIST_DIR/assets"
MANIFEST_FILE="$DIST_DIR/.current-assets"

if [ ! -d "$ASSETS_DIR" ]; then
  echo "Assets cleanup skipped: $ASSETS_DIR does not exist"
  exit 0
fi

KEEP_LIST="$(mktemp)"
KEEP_SIBLINGS="$(mktemp)"
trap 'rm -f "$KEEP_LIST" "$KEEP_SIBLINGS"' EXIT

if [ -f "$MANIFEST_FILE" ]; then
  sed '/^[[:space:]]*$/d' "$MANIFEST_FILE" | sort -u >"$KEEP_LIST"
else
  echo "WARNING: $MANIFEST_FILE is missing; skipping assets cleanup to avoid deleting current lazy chunks" >&2
  exit 0
fi

if [ -s "$KEEP_LIST" ]; then
  while IFS= read -r asset; do
    [ -f "$ASSETS_DIR/$asset.gz" ] && printf '%s\n' "$asset.gz"
    [ -f "$ASSETS_DIR/$asset.br" ] && printf '%s\n' "$asset.br"
  done <"$KEEP_LIST" >>"$KEEP_SIBLINGS"
  cat "$KEEP_SIBLINGS" >>"$KEEP_LIST"
  sort -u "$KEEP_LIST" -o "$KEEP_LIST"
fi

deleted=0
while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  if grep -Fxq "$base" "$KEEP_LIST"; then
    continue
  fi

  raw_base="${base%.gz}"
  raw_base="${raw_base%.br}"
  if grep -Fxq "$raw_base" "$KEEP_LIST"; then
    continue
  fi

  rm -f "$file"
  deleted=$((deleted + 1))
  echo "Deleted stale asset: $base"
done < <(find "$ASSETS_DIR" -maxdepth 1 -type f -mtime +"$KEEP_DAYS" -print0)

echo "Assets cleanup finished: deleted=$deleted keep_days=$KEEP_DAYS dist=$DIST_DIR"
