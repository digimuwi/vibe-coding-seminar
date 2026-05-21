#!/bin/bash
# Unpack docx, commit _unpacked/ if changed. Push hourly with an LLM-generated summary.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"

# Abort cleanly if another git op is running
if [ -f .git/index.lock ]; then
  echo "[autocommit] git index locked, skipping"
  exit 0
fi

"$REPO/scripts/unpack.sh" || { echo "[autocommit] unpack failed"; exit 1; }

git add _unpacked

if git diff --cached --quiet; then
  echo "[autocommit] nothing changed"
  exit 0
fi

STAMP="$(date +'%Y-%m-%d %H:%M:%S')"
git commit -q -m "auto: save $STAMP"
echo "[autocommit] committed at $STAMP"

# Push cadence: only if >1h since last successful push
LAST_PUSH_FILE="$REPO/.last_push"
NOW=$(date +%s)
LAST_PUSH=$(cat "$LAST_PUSH_FILE" 2>/dev/null || echo 0)
SINCE=$((NOW - LAST_PUSH))

if [ $SINCE -lt 3600 ]; then
  echo "[autocommit] last push ${SINCE}s ago, not pushing yet"
  exit 0
fi

# Squash all unpushed commits into one with an LLM-generated summary
UPSTREAM="origin/main"
AHEAD=$(git rev-list --count "$UPSTREAM"..HEAD 2>/dev/null || echo 0)

if [ "$AHEAD" -lt 1 ]; then
  echo "[autocommit] nothing to push"
  exit 0
fi

# Collect the text diff for the LLM
DIFF=$(git diff "$UPSTREAM"..HEAD -- _unpacked/word/document.xml _unpacked/word/footnotes.xml _unpacked/word/comments.xml 2>/dev/null | head -c 40000)

SUMMARY=""
if [ -n "$DIFF" ] && command -v claude >/dev/null 2>&1; then
  SUMMARY=$(printf '%s' "$DIFF" | claude -p "This is a git diff of pretty-printed Word XML from a German-language dissertation on piano rolls / Alfred Grünfeld. Write ONE line (max 72 chars, German) summarizing what was edited. No quotes, no prefix, just the subject line." 2>/dev/null | head -1 | tr -d '\n' | cut -c1-100)
fi

if [ -z "$SUMMARY" ]; then
  SUMMARY="session ending $(date +'%Y-%m-%d %H:%M') (${AHEAD} saves)"
fi

git reset --soft "$UPSTREAM"
git commit -q -m "$SUMMARY

(squash of ${AHEAD} auto-saves)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

if git push -q origin main; then
  echo "$NOW" > "$LAST_PUSH_FILE"
  echo "[autocommit] pushed: $SUMMARY"
else
  echo "[autocommit] push failed"
  exit 1
fi
