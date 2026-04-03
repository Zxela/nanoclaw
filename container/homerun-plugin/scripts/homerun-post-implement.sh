#!/usr/bin/env bash
# Hook: SubagentStop (matcher: implementer)
# Purpose: Log progress after an implementer finishes
#
# This script runs when an implementer subagent stops.
# It reads tasks.json to report progress.
#
# IMPORTANT: Uses session-aware state lookup to avoid reading another
# parallel session's state.json.
#
# Auto-registered via hooks/hooks.json when the homerun plugin is installed.

set -euo pipefail

# jq is required to read state and tasks
if ! command -v jq &>/dev/null; then exit 0; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/session-state.sh"

WORKTREE_PATH="${CLAUDE_WORKTREE_PATH:-$(pwd)}"

# --- Session-aware state.json lookup ---
find_session_state "$WORKTREE_PATH" || true

if [ -z "$STATE_FILE" ]; then
  echo "homerun-post-implement: No state.json found for this session, skipping" >&2
  exit 0
fi

# Read tasks file path from state
TASKS_FILE=$(jq -r '.tasks_file // "docs/tasks.json"' "$STATE_FILE")
FULL_TASKS_PATH="$(dirname "$STATE_FILE")/$TASKS_FILE"

if [ ! -f "$FULL_TASKS_PATH" ]; then
  echo "homerun-post-implement: Tasks file not found at $FULL_TASKS_PATH" >&2
  exit 0
fi

# Count completed vs total for a progress summary
TOTAL=$(jq '.tasks | length' "$FULL_TASKS_PATH")
COMPLETED=$(jq '[.tasks[] | select(.status == "completed")] | length' "$FULL_TASKS_PATH")
IN_PROGRESS=$(jq '[.tasks[] | select(.status == "in_progress")] | length' "$FULL_TASKS_PATH")
PENDING=$(jq '[.tasks[] | select(.status == "pending")] | length' "$FULL_TASKS_PATH")

echo "homerun-post-implement: Progress — $COMPLETED/$TOTAL completed, $IN_PROGRESS in progress, $PENDING pending"

# --- Feedback pattern aggregation ---
# Extract rejection patterns for session-level learning (non-blocking)
FEEDBACK_SCRIPT="$SCRIPT_DIR/lib/feedback-aggregator.sh"
if [ -f "$FEEDBACK_SCRIPT" ]; then
  bash "$FEEDBACK_SCRIPT" "$(dirname "$STATE_FILE")" 2>/dev/null || true
fi
