#!/usr/bin/env bash
# Hook: PostToolUse (or standalone)
# Purpose: Run type checking as standalone quality gate
#
# Extracts Phase 2 typecheck logic from the quality-check skill into a
# zero-LLM-cost bash script. Runs the project's type checker.
#
# Exit codes:
#   0 — Type check passed (or no type checker found)
#   1 — Type errors found (non-blocking: log only)
#
# Usage (standalone):
#   CLAUDE_WORKTREE_PATH=/path/to/project ./homerun-quality-typecheck.sh
#
# Usage (hook):
#   "hooks": {
#     "PostToolUse": [{
#       "matcher": "...",
#       "hooks": [{
#         "type": "command",
#         "command": "$CLAUDE_PLUGIN_ROOT/scripts/homerun-quality-typecheck.sh"
#       }]
#     }]
#   }

set -uo pipefail

# jq is required to detect typecheck tools from package.json
if ! command -v jq &>/dev/null; then exit 0; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/pkg-manager.sh"

# Resolve working directory
WORKTREE_PATH="${CLAUDE_WORKTREE_PATH:-$(pwd)}"

cd "$WORKTREE_PATH" || {
  echo "homerun-quality-typecheck: could not cd to $WORKTREE_PATH" >&2
  exit 0
}

# --- Type check ---
run_typecheck() {
  # Prefer package.json typecheck script
  if [ -f package.json ]; then
    local script=""
    if jq -e '.scripts.typecheck' package.json >/dev/null 2>&1; then
      script="typecheck"
    elif jq -e '.scripts["type-check"]' package.json >/dev/null 2>&1; then
      script="type-check"
    elif jq -e '.scripts["check-types"]' package.json >/dev/null 2>&1; then
      script="check-types"
    fi

    if [ -n "$script" ]; then
      local pkg
      pkg=$(detect_pkg_manager)
      $pkg run "$script" 2>&1 | tail -30
      return ${PIPESTATUS[0]}
    fi
  fi

  # Fall back to auto-detection
  if [ -f tsconfig.json ]; then
    npx tsc --noEmit 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  # Python
  if command -v mypy &>/dev/null && [ -f pyproject.toml ]; then
    mypy . 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  echo "homerun-quality-typecheck: no type checker detected, skipping." >&2
  return 0  # No type checker found, pass
}

# --- Run typecheck ---
echo "=== homerun-quality-typecheck ===" >&2

TYPE_OUTPUT=$(run_typecheck 2>&1)
TYPE_EXIT=$?

if [ $TYPE_EXIT -ne 0 ]; then
  echo "TYPECHECK FAILED (exit $TYPE_EXIT):" >&2
  echo "$TYPE_OUTPUT" >&2
  echo "" >&2
  echo "homerun-quality-typecheck: type errors detected." >&2
  exit 1
fi

echo "homerun-quality-typecheck: passed." >&2
exit 0
