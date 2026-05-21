#!/bin/bash
# Unpack Grünfelds Geist.docx into _unpacked/ with pretty-printed XML
# for the text-bearing parts (document, footnotes, comments, endnotes).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DOCX="${1:-$REPO/Grünfelds Geist.docx}"
DEST="${2:-$REPO/_unpacked}"

if [ ! -f "$DOCX" ]; then
  echo "docx not found: $DOCX" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

unzip -q "$DOCX" -d "$TMP"

for f in word/document.xml word/footnotes.xml word/comments.xml word/endnotes.xml; do
  if [ -f "$TMP/$f" ]; then
    xmllint --format "$TMP/$f" > "$TMP/$f.pretty" && mv "$TMP/$f.pretty" "$TMP/$f"
  fi
done

# Atomic swap
rm -rf "$DEST"
mv "$TMP" "$DEST"
trap - EXIT
