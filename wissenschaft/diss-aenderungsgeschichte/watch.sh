#!/bin/bash
# Debounced fswatch loop: fires autocommit 30s after the last write.
# If more writes arrive within 30s, the pending job is cancelled and restarted.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"

TARGET="Grünfelds Geist.docx"
DEBOUNCE=30

echo "[watch] starting, watching $TARGET"

DEBOUNCE_PID=""
fswatch -o "$TARGET" | while read _; do
  if [ -n "$DEBOUNCE_PID" ] && kill -0 "$DEBOUNCE_PID" 2>/dev/null; then
    kill "$DEBOUNCE_PID" 2>/dev/null || true
  fi
  (
    sleep "$DEBOUNCE"
    "$REPO/scripts/autocommit.sh"
  ) &
  DEBOUNCE_PID=$!
done
