---
name: status
description: "Show status of homerun worktrees and their tasks. Read-only — does not modify any files."
argument-hint: "[worktree-path]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash
---

# /status Command

Show the status of homerun worktrees, including phase, feature, scale, and task progress.

## Usage

```
/status                    # List all homerun worktrees
/status <worktree-path>    # Detailed status for a specific worktree
```

## Overview Mode (no arguments)

List all homerun worktrees with summary information:

```bash
echo "=== Homerun Worktrees ==="
echo ""

for wt in $(git worktree list --porcelain | grep "^worktree" | awk '{print $2}' | grep -E "create/|homerun"); do
  if [ -f "$wt/state.json" ]; then
    FEATURE=$(jq -r '.feature // .branch // "unknown"' "$wt/state.json")
    PHASE=$(jq -r '.phase // "unknown"' "$wt/state.json")
    SCALE=$(jq -r '.scale // .scale_details.estimated // "?"' "$wt/state.json")

    # Task progress
    if [ -f "$wt/docs/tasks.json" ]; then
      TOTAL=$(jq '.tasks | length' "$wt/docs/tasks.json")
      DONE=$(jq '[.tasks[] | select(.status == "completed")] | length' "$wt/docs/tasks.json")
      PROGRESS="$DONE/$TOTAL tasks"
    else
      PROGRESS="no tasks yet"
    fi

    echo "  $wt"
    echo "    Feature: $FEATURE"
    echo "    Phase:   $PHASE | Scale: $SCALE | Progress: $PROGRESS"
    echo ""
  fi
done
```

If no worktrees are found, report:
```
No active homerun worktrees found.
Use /create to start a new workflow.
```

## Detailed Mode (with worktree path)

Show per-task status and feedback patterns for a specific worktree:

```bash
WORKTREE="$1"

if [ ! -f "$WORKTREE/state.json" ]; then
  echo "Error: No state.json found in $WORKTREE"
  exit 1
fi

echo "=== Worktree Status ==="
echo ""

# Session info
jq -r '"Session:  \(.session_id // "unknown")\nBranch:   \(.branch // "unknown")\nPhase:    \(.phase // "unknown")\nScale:    \(.scale // .scale_details.estimated // "unknown")"' "$WORKTREE/state.json"
echo ""

# Task details
if [ -f "$WORKTREE/docs/tasks.json" ]; then
  echo "=== Tasks ==="
  jq -r '.tasks[] | "\(.id): \(.title) [\(.status)] (\(.task_type) → \(.model // "sonnet"))"' "$WORKTREE/docs/tasks.json"
  echo ""

  # Summary
  TOTAL=$(jq '.tasks | length' "$WORKTREE/docs/tasks.json")
  COMPLETED=$(jq '[.tasks[] | select(.status == "completed")] | length' "$WORKTREE/docs/tasks.json")
  PENDING=$(jq '[.tasks[] | select(.status == "pending")] | length' "$WORKTREE/docs/tasks.json")
  BLOCKED=$(jq '[.tasks[] | select(.status == "blocked" or .status == "failed")] | length' "$WORKTREE/docs/tasks.json")

  echo "Summary: $COMPLETED completed, $PENDING pending, $BLOCKED blocked/failed (of $TOTAL total)"
fi

# Feedback patterns
if [ -f "$WORKTREE/feedback_patterns.json" ]; then
  echo ""
  echo "=== Feedback Patterns ==="
  jq -r '.patterns[] | "  - \(.pattern) (count: \(.count))"' "$WORKTREE/feedback_patterns.json" 2>/dev/null || echo "  (none)"
fi
```

## Notes

- This command is **read-only** — it never modifies state.json, tasks.json, or any other file
- Use `/create --resume` to continue working on a worktree
- Use `/build <worktree>` to start or resume implementation
