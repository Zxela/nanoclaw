#!/usr/bin/env bash
# homerun-validate-dag.sh — Pure algorithmic DAG validation at zero LLM cost
# Usage: homerun-validate-dag.sh <tasks.json> [scope-analysis.json]
#
# Exit codes:
#   0 = all validations pass
#   1 = warnings only (non-blocking)
#   2 = validation failures (blocking)

set -uo pipefail

TASKS_FILE="${1:-}"
SCOPE_FILE="${2:-}"

if [[ -z "$TASKS_FILE" ]]; then
  echo '{"valid":false,"exit_code":2,"errors":["Usage: homerun-validate-dag.sh <tasks.json> [scope-analysis.json]"],"warnings":[]}' >&2
  exit 2
fi

if [[ ! -f "$TASKS_FILE" ]]; then
  jq -n --arg f "$TASKS_FILE" '{"valid":false,"exit_code":2,"errors":["Tasks file not found: \($f)"],"warnings":[]}' >&2
  exit 2
fi

# Check jq is available
if ! command -v jq &>/dev/null; then
  echo '{"valid":false,"exit_code":2,"errors":["jq is required but not installed"],"warnings":[]}' >&2
  exit 2
fi

# Validate JSON syntax
if ! jq empty "$TASKS_FILE" 2>/dev/null; then
  jq -n --arg f "$TASKS_FILE" '{"valid":false,"exit_code":2,"errors":["Invalid JSON in \($f)"],"warnings":[]}' >&2
  exit 2
fi

ERRORS=()
WARNINGS=()

# --- 1. Required fields check ---
MISSING_FIELDS=$(jq -r '
  [.tasks[] | {
    id: .id,
    missing: (
      [
        (if .id == null then "id" else empty end),
        (if .title == null then "title" else empty end),
        (if .objective == null then "objective" else empty end),
        (if .acceptance_criteria == null then "acceptance_criteria" else empty end),
        (if .status == null then "status" else empty end),
        (if .depends_on == null then "depends_on" else empty end),
        (if .task_type == null then "task_type" else empty end)
      ]
    )
  } | select(.missing | length > 0)] |
  .[] | "Task \(.id // "unknown"): missing fields: \(.missing | join(", "))"
' "$TASKS_FILE" 2>/dev/null || true)

if [[ -n "$MISSING_FIELDS" ]]; then
  while IFS= read -r line; do
    ERRORS+=("REQUIRED_FIELDS: $line")
  done <<< "$MISSING_FIELDS"
fi

# --- 2. DAG cycle detection (iterative removal of zero-dependency nodes) ---
# Uses a simple approach: repeatedly remove tasks with no unresolved deps.
# If we can't remove all tasks, there's a cycle.
CYCLE_RESULT="OK"
ALL_IDS=$(jq -r '.tasks[].id' "$TASKS_FILE" 2>/dev/null || true)
if [[ -n "$ALL_IDS" ]]; then
  RESOLVED=""
  CHANGED=true
  while $CHANGED; do
    CHANGED=false
    for tid in $ALL_IDS; do
      # Skip already resolved
      echo " $RESOLVED " | grep -qF " $tid " 2>/dev/null && continue
      # Get dependencies for this task
      DEPS=$(jq -r --arg id "$tid" '.tasks[] | select(.id == $id) | (.depends_on // [])[]' "$TASKS_FILE" 2>/dev/null || true)
      # Check if all deps are resolved
      ALL_MET=true
      for dep in $DEPS; do
        if ! echo " $RESOLVED " | grep -qF " $dep " 2>/dev/null; then
          ALL_MET=false
          break
        fi
      done
      if $ALL_MET; then
        RESOLVED="$RESOLVED $tid"
        CHANGED=true
      fi
    done
  done
  # Check for unresolved tasks (involved in cycles)
  UNRESOLVED=""
  for tid in $ALL_IDS; do
    if ! echo " $RESOLVED " | grep -qF " $tid " 2>/dev/null; then
      UNRESOLVED="$UNRESOLVED $tid"
    fi
  done
  UNRESOLVED=$(echo "$UNRESOLVED" | xargs)
  if [[ -n "$UNRESOLVED" ]]; then
    CYCLE_RESULT="CYCLE_DETECTED: Tasks involved in cycle: $(echo "$UNRESOLVED" | tr ' ' ', ')"
  fi
fi

if [[ "$CYCLE_RESULT" != "OK" ]]; then
  ERRORS+=("$CYCLE_RESULT")
fi

# --- 3. Test file path validation ---
TEST_PATH_ISSUES=$(jq -r '
  .tasks[] |
  if .test_file == null or .test_file == "" then
    if (.no_test_reason == null or .no_test_reason == "") then
      "Task \(.id): no test_file and no no_test_reason"
    else empty end
  else
    if (.test_file | test("(test|spec|_test|\\.test\\.|\\.spec\\.)") | not) then
      "Task \(.id): test_file \(.test_file) may not be a test file"
    else empty end
  end
' "$TASKS_FILE" 2>/dev/null || true)

if [[ -n "$TEST_PATH_ISSUES" ]]; then
  while IFS= read -r line; do
    if [[ "$line" == *"no test_file"* ]]; then
      ERRORS+=("TEST_FILE: $line")
    else
      WARNINGS+=("TEST_FILE: $line")
    fi
  done <<< "$TEST_PATH_ISSUES"
fi

# --- 4. Dependency ordering (no task depends on higher-numbered task) ---
DEP_ORDER_ISSUES=$(jq -r '
  [.tasks[].id] as $all_ids |
  .tasks[] |
  .id as $tid |
  ($all_ids | to_entries[] | select(.value == $tid) | .key) as $tidx |
  (.depends_on // [])[] |
  . as $dep |
  ($all_ids | to_entries[] | select(.value == $dep) | .key) as $didx |
  if $didx >= $tidx then
    "Task \($tid) depends on \($dep) which comes later or is same in sequence"
  else empty end
' "$TASKS_FILE" 2>/dev/null || true)

if [[ -n "$DEP_ORDER_ISSUES" ]]; then
  while IFS= read -r line; do
    WARNINGS+=("DEP_ORDER: $line")
  done <<< "$DEP_ORDER_ISSUES"
fi

# --- 5. Dependency existence (all deps reference valid task IDs) ---
DEP_EXIST_ISSUES=$(jq -r '
  (.tasks | map(.id)) as $all_ids |
  .tasks[] |
  .id as $tid |
  (.depends_on // [])[] |
  . as $dep |
  if ($all_ids | index($dep)) == null then
    "Task \($tid) depends on \($dep) which does not exist"
  else empty end
' "$TASKS_FILE" 2>/dev/null || true)

if [[ -n "$DEP_EXIST_ISSUES" ]]; then
  while IFS= read -r line; do
    ERRORS+=("DEP_MISSING: $line")
  done <<< "$DEP_EXIST_ISSUES"
fi

# --- 6. Acceptance criteria coverage (if scope-analysis.json provided) ---
if [[ -n "$SCOPE_FILE" && -f "$SCOPE_FILE" ]]; then
  COVERAGE_ISSUES=$(jq -r --slurpfile scope "$SCOPE_FILE" '
    # Get all AC IDs from scope-analysis
    ($scope[0].acceptance_criteria // [] | map(.id)) as $scope_acs |
    # Get all AC IDs referenced in tasks (from traces_to.acceptance_criteria)
    ([.tasks[] | (.traces_to.acceptance_criteria // [])[] ] | unique) as $task_acs |
    # Find uncovered ACs
    [$scope_acs[] | select(. as $ac | $task_acs | index($ac) | not)] |
    if length > 0 then
      "Uncovered acceptance criteria: \(join(", "))"
    else empty end
  ' "$TASKS_FILE" 2>/dev/null || true)

  if [[ -n "$COVERAGE_ISSUES" ]]; then
    WARNINGS+=("AC_COVERAGE: $COVERAGE_ISSUES")
  fi
fi

# --- Build result JSON ---
ERRORS_JSON="[]"
WARNINGS_JSON="[]"

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  ERRORS_JSON=$(printf '%s\n' "${ERRORS[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')
fi

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  WARNINGS_JSON=$(printf '%s\n' "${WARNINGS[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')
fi

TASK_COUNT=$(jq '.tasks | length' "$TASKS_FILE")
DEP_COUNT=$(jq '[.tasks[].depends_on | length] | add // 0' "$TASKS_FILE")

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  EXIT_CODE=2
  VALID=false
elif [[ ${#WARNINGS[@]} -gt 0 ]]; then
  EXIT_CODE=1
  VALID=true
else
  EXIT_CODE=0
  VALID=true
fi

jq -n \
  --argjson valid "$VALID" \
  --argjson exit_code "$EXIT_CODE" \
  --argjson errors "$ERRORS_JSON" \
  --argjson warnings "$WARNINGS_JSON" \
  --argjson task_count "$TASK_COUNT" \
  --argjson dep_count "$DEP_COUNT" \
  '{
    valid: $valid,
    exit_code: $exit_code,
    task_count: $task_count,
    dependency_count: $dep_count,
    errors: $errors,
    warnings: $warnings,
    checks_performed: [
      "required_fields",
      "dag_cycle_detection",
      "test_file_validation",
      "dependency_ordering",
      "dependency_existence",
      "acceptance_criteria_coverage"
    ]
  }'

exit "$EXIT_CODE"
