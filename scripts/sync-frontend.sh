#!/usr/bin/env bash
# Mirrors the Lovable-managed venture-mind-os checkout into ./frontend/ so this
# single repo contains the whole submission. Run after ANY Lovable change:
#
#   scripts/sync-frontend.sh                  # default source: ~/Sites/personal/venture-mind-os
#   scripts/sync-frontend.sh /path/to/checkout
#
# rsync -a --delete keeps frontend/ an exact mirror (excluding installs,
# builds, git metadata, and env files). frontend/ stays independently runnable:
#   cd frontend && npm i && npm run dev
set -euo pipefail
SRC="${1:-$HOME/Sites/personal/venture-mind-os}"
DST="$(cd "$(dirname "$0")/.." && pwd)/frontend"
if [ ! -f "$SRC/package.json" ]; then
  echo "error: $SRC does not look like the frontend checkout" >&2
  exit 1
fi
mkdir -p "$DST"
rsync -a --delete \
  --exclude node_modules --exclude .git --exclude dist \
  --exclude .env --exclude '.env.*' \
  --exclude .tanstack --exclude .nitro --exclude .output --exclude .vinxi \
  "$SRC/" "$DST/"
echo "Synced $SRC -> $DST"
