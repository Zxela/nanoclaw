#!/usr/bin/env bash
# Hook: PostToolUse (or standalone)
# Purpose: Run lint with auto-fix as standalone quality gate
#
# Extracts Phase 1 lint logic from the quality-check skill into a zero-LLM-cost
# bash script. Runs the project's lint command with auto-fix enabled.
#
# Exit codes:
#   0 — Lint passed (or no linter found)
#   1 — Lint failed (non-blocking: log only)
#
# Usage (standalone):
#   CLAUDE_WORKTREE_PATH=/path/to/project ./homerun-quality-lint.sh
#
# Usage (hook):
#   "hooks": {
#     "PostToolUse": [{
#       "matcher": "...",
#       "hooks": [{
#         "type": "command",
#         "command": "$CLAUDE_PLUGIN_ROOT/scripts/homerun-quality-lint.sh"
#       }]
#     }]
#   }

set -uo pipefail

# jq is required to detect lint tools from package.json
if ! command -v jq &>/dev/null; then exit 0; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/pkg-manager.sh"

# Resolve working directory
WORKTREE_PATH="${CLAUDE_WORKTREE_PATH:-$(pwd)}"

cd "$WORKTREE_PATH" || {
  echo "homerun-quality-lint: could not cd to $WORKTREE_PATH" >&2
  exit 0
}

# --- Lint with auto-fix ---
run_lint() {
  # Prefer package.json lint script (respects project conventions)
  if [ -f package.json ] && jq -e '.scripts.lint' package.json >/dev/null 2>&1; then
    local pkg
    pkg=$(detect_pkg_manager)
    $pkg run lint --fix 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  # Fall back to auto-detection
  if [ -f biome.json ] || [ -f biome.jsonc ]; then
    npx biome check --write . --no-errors-on-unmatched 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  elif [ -f eslint.config.js ] || [ -f eslint.config.mjs ] || [ -f eslint.config.cjs ] || \
       [ -f .eslintrc.js ] || [ -f .eslintrc.json ] || [ -f .eslintrc.yml ] || [ -f .eslintrc.cjs ]; then
    npx eslint . --fix 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  elif [ -f .prettierrc ] || [ -f .prettierrc.js ] || [ -f .prettierrc.json ] || \
       [ -f .prettierrc.yml ] || [ -f .prettierrc.yaml ] || [ -f prettier.config.js ]; then
    npx prettier --write . 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  # Python
  if [ -f pyproject.toml ] && grep -q 'ruff' pyproject.toml 2>/dev/null; then
    ruff check --fix . 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  echo "homerun-quality-lint: no lint tool detected, skipping." >&2
  return 0  # No linter found, pass
}

# --- Run lint ---
echo "=== homerun-quality-lint ===" >&2

LINT_OUTPUT=$(run_lint 2>&1)
LINT_EXIT=$?

if [ $LINT_EXIT -ne 0 ]; then
  echo "LINT FAILED (exit $LINT_EXIT):" >&2
  echo "$LINT_OUTPUT" >&2
  echo "" >&2
  echo "homerun-quality-lint: lint errors remain after auto-fix attempt." >&2
  exit 1
fi

echo "homerun-quality-lint: passed." >&2
exit 0
