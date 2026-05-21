#!/bin/bash
# Reconstruct Grünfelds Geist.docx from _unpacked/.
# Word re-minifies pretty-printed XML on next save, so round-trip is fine.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$REPO/_unpacked}"
DOCX="${2:-$REPO/Grünfelds Geist.docx}"

if [ ! -d "$SRC" ]; then
  echo "unpacked dir not found: $SRC" >&2
  exit 1
fi

TMP="$(mktemp -u).docx"
( cd "$SRC" && zip -qr "$TMP" . )
mv "$TMP" "$DOCX"
echo "wrote $DOCX"
