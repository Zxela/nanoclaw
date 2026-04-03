#!/usr/bin/env bash
# Hook: WorktreeCreate
# Purpose: Initialize a new homerun worktree with required structure
#
# This script runs when Claude Code creates a worktree for an implementer agent.
# It ensures the worktree has the necessary homerun state files.
#
# IMPORTANT: Uses branch-based matching to find the correct parent session's
# state.json, avoiding cross-session contamination when multiple homerun
# sessions run in parallel.
#
# Auto-registered via hooks/hooks.json when the homerun plugin is installed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/session-state.sh"

WORKTREE_PATH="${CLAUDE_WORKTREE_PATH:-$(pwd)}"

# Only run if this looks like a homerun worktree (branch starts with create/)
BRANCH=$(git -C "$WORKTREE_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [[ "$BRANCH" != create/* ]]; then
  exit 0  # Not a homerun worktree, skip
fi

# Find state.json that belongs to THIS session
find_session_state "$WORKTREE_PATH" || true

if [ -z "$STATE_FILE" ]; then
  SESSION_ID="${BRANCH#create/}"
  echo "homerun-worktree-setup: No matching state.json for session $SESSION_ID, skipping" >&2
  exit 0
fi

# Ensure tasks directory exists (even if tasks.json hasn't been generated yet)
TASKS_FILE=$(jq -r '.tasks_file // "docs/tasks.json"' "$STATE_FILE")
mkdir -p "$WORKTREE_PATH/$(dirname "$TASKS_FILE")"

# Copy tasks.json if it exists in the source worktree
SOURCE_DIR=$(dirname "$STATE_FILE")
if [ -f "$SOURCE_DIR/$TASKS_FILE" ]; then
  cp "$SOURCE_DIR/$TASKS_FILE" "$WORKTREE_PATH/$TASKS_FILE"
fi

SESSION_ID="${BRANCH#create/}"
echo "homerun-worktree-setup: Initialized worktree at $WORKTREE_PATH (session: $SESSION_ID)"
