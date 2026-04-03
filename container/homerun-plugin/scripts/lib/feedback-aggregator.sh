#!/usr/bin/env bash
# Library: feedback-aggregator.sh
# Purpose: Extract reviewer rejection patterns from tasks.json and write them
#          to feedback_patterns.json in the worktree.
#
# This script enables session-level learning from rejections. It reads
# tasks.json, finds rejected/failed entries, extracts rejection reasons,
# and accumulates patterns for team-lead to inject into future implementer context.
#
# Usage:
#   scripts/lib/feedback-aggregator.sh [worktree_path]
#
#   worktree_path — optional; defaults to $CLAUDE_WORKTREE_PATH or pwd
#
# Output:
#   $WORKTREE_PATH/feedback_patterns.json
#
# Exit codes:
#   0 — Always (non-blocking; writes empty patterns on missing/invalid input)

set -uo pipefail

# jq is required to parse tasks.json and build feedback patterns
if ! command -v jq &>/dev/null; then exit 0; fi

WORKTREE_PATH="${1:-${CLAUDE_WORKTREE_PATH:-$(pwd)}}"

TASKS_FILE="$WORKTREE_PATH/docs/tasks.json"
OUTPUT_FILE="$WORKTREE_PATH/feedback_patterns.json"
EXTRACTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- Helper: write empty patterns and exit cleanly ---
write_empty_patterns() {
  local reason="${1:-}"
  if [ -n "$reason" ]; then
    echo "feedback-aggregator: $reason — writing empty patterns" >&2
  fi
  cat > "$OUTPUT_FILE" <<EOF
{
  "session_patterns": [],
  "common_patterns": [],
  "total_rejections": 0
}
EOF
  exit 0
}

# --- Guard: tasks.json must exist and be non-empty ---
if [ ! -f "$TASKS_FILE" ]; then
  write_empty_patterns "tasks.json not found at $TASKS_FILE"
fi

if ! jq empty "$TASKS_FILE" 2>/dev/null; then
  write_empty_patterns "tasks.json is not valid JSON"
fi

TASK_COUNT=$(jq '.tasks | length' "$TASKS_FILE" 2>/dev/null || echo "0")
if [ "$TASK_COUNT" -eq 0 ]; then
  write_empty_patterns "tasks.json contains no tasks"
fi

# --- Extract rejected/failed tasks that carry rejection metadata ---
# A task qualifies if:
#   .status == "rejected" or .status == "failed"
#   AND it has at least one of: .rejection_reason, .rejection_reasons, .issues
REJECTED_TASKS=$(jq '[
  .tasks[] |
  select(.status == "rejected" or .status == "failed") |
  select(
    (.rejection_reason != null and .rejection_reason != "") or
    (.rejection_reasons != null and (.rejection_reasons | length) > 0) or
    (.issues != null and (.issues | length) > 0)
  )
]' "$TASKS_FILE" 2>/dev/null || echo "[]")

TOTAL_REJECTIONS=$(echo "$REJECTED_TASKS" | jq 'length' 2>/dev/null || echo "0")

if [ "$TOTAL_REJECTIONS" -eq 0 ]; then
  write_empty_patterns "no rejected/failed tasks with rejection metadata found"
fi

# --- Build session_patterns array ---
# For each rejected task, normalise rejection data into a rejection_reasons array.
# Sources checked in priority order:
#   1. .rejection_reasons (array)
#   2. .rejection_reason  (string — wrapped into array)
#   3. .issues            (array — used as fallback)
SESSION_PATTERNS=$(echo "$REJECTED_TASKS" | jq --arg ts "$EXTRACTED_AT" '[
  .[] |
  {
    task_id: .id,
    rejection_reasons: (
      if (.rejection_reasons != null and (.rejection_reasons | length) > 0) then
        .rejection_reasons
      elif (.rejection_reason != null and .rejection_reason != "") then
        [.rejection_reason]
      elif (.issues != null and (.issues | length) > 0) then
        .issues
      else
        []
      end
    ),
    extracted_at: $ts
  } |
  select(.rejection_reasons | length > 0)
]' 2>/dev/null || echo "[]")

# --- Derive common_patterns: recurring words/phrases across all rejection reasons ---
# Extract all rejection reason strings, tokenise to significant words (>= 5 chars),
# count occurrences, and surface those appearing more than once.
COMMON_PATTERNS=$(echo "$SESSION_PATTERNS" | jq '[
  [ .[].rejection_reasons[] ] |
  map(ascii_downcase | split(" ") | .[]) |
  map(select(length >= 5)) |
  group_by(.) |
  map({phrase: .[0], count: length}) |
  sort_by(-.count) |
  map(select(.count > 1)) |
  .[0:10] |
  .[].phrase
]' 2>/dev/null || echo "[]")

# --- Write feedback_patterns.json ---
jq -n \
  --argjson session_patterns "$SESSION_PATTERNS" \
  --argjson common_patterns "$COMMON_PATTERNS" \
  --argjson total_rejections "$TOTAL_REJECTIONS" \
  '{
    session_patterns: $session_patterns,
    common_patterns: $common_patterns,
    total_rejections: $total_rejections
  }' > "$OUTPUT_FILE"

echo "feedback-aggregator: wrote $TOTAL_REJECTIONS rejection(s) to $OUTPUT_FILE"
