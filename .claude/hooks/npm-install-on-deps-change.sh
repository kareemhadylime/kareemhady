#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit. Re-runs `npm install` whenever
# package.json or package-lock.json is modified, so node_modules never drifts
# out of sync with declared deps. Silent no-op for every other file.
#
# Triggered from .claude/settings.json. Hook receives tool-call JSON on stdin
# (see `tool_input.file_path`).
set -euo pipefail

input=$(cat)

# Fast pre-filter — bail before spawning anything if the modified path isn't
# package.json / package-lock.json. Most Edit/Write calls hit other files; this
# keeps the hook's idle cost near zero.
if ! printf '%s' "$input" | grep -qE '"file_path"\s*:\s*"[^"]*(package\.json|package-lock\.json)"'; then
  exit 0
fi

# Extract the path. Real package.json paths never contain quotes/backslashes,
# so a permissive regex is fine here.
file_path=$(printf '%s' "$input" | sed -nE 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -1)
[ -z "$file_path" ] && exit 0

dir=$(dirname "$file_path")
[ -d "$dir" ] || exit 0

echo "[hook] $(basename "$file_path") changed → npm install in $dir" >&2
cd "$dir" && npm install --no-audit --no-fund
