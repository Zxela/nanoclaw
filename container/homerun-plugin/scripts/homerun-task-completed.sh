#!/usr/bin/env bash
# Hook: TaskCompleted (for Agent Teams mode)
# Purpose: Validate implementation before marking a native task as complete
#
# Exit codes:
#   0 — Allow task completion
#   2 — Block task completion (validation failed)
#
# IMPORTANT: Uses session-aware state lookup to avoid reading another
# parallel session's state.json.
#
# Auto-registered via hooks/hooks.json when the homerun plugin is installed.

set -euo pipefail

# jq is required to read state and run validation
if ! command -v jq &>/dev/null; then exit 0; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/session-state.sh"
source "$SCRIPT_DIR/lib/pkg-manager.sh"

WORKTREE_PATH="${CLAUDE_WORKTREE_PATH:-$(pwd)}"

# --- Session-aware state.json lookup ---
find_session_state "$WORKTREE_PATH" || true

if [ -z "$STATE_FILE" ]; then
  # Not a homerun project, allow completion
  exit 0
fi

# Check orchestration mode
MODE=$(jq -r '.orchestration_mode // "unknown"' "$STATE_FILE")
if [ "$MODE" != "agent_teams" ]; then
  # Not in Agent Teams mode, allow completion
  exit 0
fi

# Basic validation: check that tests pass in the worktree
SOURCE_DIR=$(dirname "$STATE_FILE")

# Run a quick test check (if test runner is configured)
if [ -f "$SOURCE_DIR/package.json" ]; then
  cd "$SOURCE_DIR"
  PKG_MANAGER=$(detect_pkg_manager)
  if jq -e '.scripts.test' "$SOURCE_DIR/package.json" > /dev/null 2>&1; then
    echo "homerun-task-completed: Running tests..."
    if ! $PKG_MANAGER test 2>&1; then
      echo "homerun-task-completed: Tests failed — blocking task completion" >&2
      exit 2  # Block completion
    fi
  fi
fi

echo "homerun-task-completed: Validation passed"
exit 0
