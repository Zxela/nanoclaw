#!/usr/bin/env bash
# Hook: PostToolUse (matcher: Edit|Write)
# Purpose: Auto-lint changed files after every edit
#
# Runs the project's linter with --fix/--write on the file that was just
# edited. Non-blocking — lint failures are logged but don't prevent the
# edit from completing. Zero LLM tokens consumed.
#
# Exit codes:
#   0 — Always (non-blocking)
#
# Auto-registered via hooks/hooks.json when the homerun plugin is installed.

set -uo pipefail

# jq is required to parse hook input
if ! command -v jq &>/dev/null; then exit 0; fi

# Read hook input from stdin
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

[ -z "$FILE" ] && exit 0

cd "${CWD:-.}" || exit 0

# Skip non-source files
case "$FILE" in
  *.md|*.txt|*.json|*.yaml|*.yml|*.toml|*.lock|*.lockb)
    exit 0
    ;;
esac

# --- Auto-fix with project linter ---
if [ -f biome.json ] || [ -f biome.jsonc ]; then
  npx biome check --write "$FILE" 2>/dev/null
elif [ -f eslint.config.js ] || [ -f eslint.config.mjs ] || [ -f eslint.config.cjs ] || \
     [ -f .eslintrc.js ] || [ -f .eslintrc.json ] || [ -f .eslintrc.yml ] || [ -f .eslintrc.cjs ]; then
  npx eslint --fix "$FILE" 2>/dev/null
elif [ -f .prettierrc ] || [ -f .prettierrc.js ] || [ -f .prettierrc.json ] || \
     ([ -f package.json ] && grep -q '"prettier"' package.json 2>/dev/null); then
  npx prettier --write "$FILE" 2>/dev/null
fi

# Python auto-format
if [[ "$FILE" == *.py ]]; then
  if [ -f pyproject.toml ] && grep -q 'ruff' pyproject.toml 2>/dev/null; then
    ruff format "$FILE" 2>/dev/null
    ruff check --fix "$FILE" 2>/dev/null
  elif command -v black &>/dev/null; then
    black -q "$FILE" 2>/dev/null
  fi
fi

exit 0  # Never block on auto-lint
