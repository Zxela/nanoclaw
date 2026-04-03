#!/usr/bin/env bash
# Shared: session-aware state.json lookup
# Usage: source "$(dirname "$0")/lib/session-state.sh"
#        find_session_state "$WORKTREE_PATH"
# Sets: STATE_FILE (path to matching state.json, or empty)

find_session_state() {
  local worktree_path="$1"
  STATE_FILE=""

  # First: check the current worktree directly
  if [ -f "$worktree_path/state.json" ]; then
    STATE_FILE="$worktree_path/state.json"
    return 0
  fi

  # Find the parent session's state.json by matching session_id
  local branch
  branch=$(git -C "$worktree_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  local session_id="${branch#create/}"

  if [ -n "$session_id" ] && [ "$session_id" != "$branch" ]; then
    local wt
    for wt in $(git -C "$worktree_path" worktree list 2>/dev/null | awk '{print $1}'); do
      [ "$wt" = "$worktree_path" ] && continue
      if [ -f "$wt/state.json" ]; then
        local file_session_id
        file_session_id=$(jq -r '.session_id // empty' "$wt/state.json" 2>/dev/null)
        if [ "$file_session_id" = "$session_id" ]; then
          STATE_FILE="$wt/state.json"
          return 0
        fi
      fi
    done
  fi

  return 1
}
