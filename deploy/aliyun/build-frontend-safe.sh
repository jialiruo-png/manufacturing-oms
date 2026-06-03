#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${DIST_DIR:-frontend/dist}"
NEXT_DIST_DIR="${NEXT_DIST_DIR:-frontend/dist-next}"

rm -rf "$NEXT_DIST_DIR"
(
  cd frontend
  npm run build -- --outDir dist-next
)

if [ ! -d "$NEXT_DIST_DIR" ] || [ -z "$(ls -A "$NEXT_DIST_DIR" 2>/dev/null)" ]; then
  echo "ERROR: vite build did not generate $NEXT_DIST_DIR; --outDir may not have been passed through" >&2
  exit 1
fi

if [ ! -d "$NEXT_DIST_DIR/assets" ] || [ ! -f "$NEXT_DIST_DIR/index.html" ]; then
  echo "ERROR: incomplete frontend build output in $NEXT_DIST_DIR" >&2
  exit 1
fi

mkdir -p "$DIST_DIR/assets"
find "$NEXT_DIST_DIR/assets" -maxdepth 1 -type f -exec basename {} \; | sort >"$NEXT_DIST_DIR/.current-assets"
rsync -a "$NEXT_DIST_DIR/assets/" "$DIST_DIR/assets/"
rsync -a --delete --exclude assets "$NEXT_DIST_DIR/" "$DIST_DIR/"
rm -rf "$NEXT_DIST_DIR"

KEEP_DAYS="${ASSET_KEEP_DAYS:-7}" deploy/aliyun/cleanup-assets.sh "$DIST_DIR"
