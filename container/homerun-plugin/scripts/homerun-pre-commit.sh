#!/usr/bin/env bash
# Hook: PreToolUse (matcher: Bash)
# Purpose: Gate git commit/push on lint + typecheck passing
#
# Intercepts Bash tool calls containing `git commit` or `git push` and runs
# the project's lint and typecheck commands first. Blocks with exit 2 if
# either fails, providing error output on stderr for Claude to act on.
#
# Exit codes:
#   0 — Allow the command
#   2 — Block the command (quality check failed)
#
# Auto-registered via hooks/hooks.json when the homerun plugin is installed.

set -uo pipefail

# jq is required to parse hook input
if ! command -v jq &>/dev/null; then exit 0; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/pkg-manager.sh"

# Read hook input from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Only intercept git commit and git push
if ! echo "$COMMAND" | grep -qE '(^|\s|&&|\|\||;)\s*git\s+(commit|push)\b'; then
  exit 0
fi

cd "${CWD:-.}" || exit 0

FAILED=()

# --- Lint ---
run_lint() {
  # Prefer package.json lint script (respects project conventions)
  if [ -f package.json ] && jq -e '.scripts.lint' package.json >/dev/null 2>&1; then
    local pkg
    pkg=$(detect_pkg_manager)
    $pkg run lint 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  # Fall back to auto-detection
  if [ -f biome.json ] || [ -f biome.jsonc ]; then
    npx biome check . --no-errors-on-unmatched 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  elif [ -f eslint.config.js ] || [ -f eslint.config.mjs ] || [ -f eslint.config.cjs ] || \
       [ -f .eslintrc.js ] || [ -f .eslintrc.json ] || [ -f .eslintrc.yml ] || [ -f .eslintrc.cjs ]; then
    npx eslint . 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  # Python
  if [ -f pyproject.toml ] && grep -q 'ruff' pyproject.toml 2>/dev/null; then
    ruff check . 2>&1 | tail -30
    return ${PIPESTATUS[0]}
  fi

  return 0  # No linter found, pass
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

  return 0  # No type checker found, pass
}

# --- Run checks ---
echo "=== Pre-commit quality gate ===" >&2

LINT_OUTPUT=$(run_lint 2>&1)
LINT_EXIT=$?
if [ $LINT_EXIT -ne 0 ]; then
  FAILED+=("lint")
  echo "LINT FAILED (exit $LINT_EXIT):" >&2
  echo "$LINT_OUTPUT" >&2
fi

TYPE_OUTPUT=$(run_typecheck 2>&1)
TYPE_EXIT=$?
if [ $TYPE_EXIT -ne 0 ]; then
  FAILED+=("typecheck")
  echo "TYPECHECK FAILED (exit $TYPE_EXIT):" >&2
  echo "$TYPE_OUTPUT" >&2
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "" >&2
  echo "Pre-commit gate BLOCKED: ${FAILED[*]} failed. Fix errors before committing." >&2
  exit 2
fi

echo "Pre-commit gate passed." >&2
exit 0
