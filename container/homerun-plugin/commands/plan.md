---
name: plan
description: "Jump directly into the planning phase with existing specification documents. Use when you already have PRD/ADR/TECHNICAL_DESIGN and want to decompose into tasks."
argument-hint: "<worktree-path> [--auto]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, MultiEdit, Skill, Task
---

# /plan Command

Jump directly into the planning phase, skipping discovery. Use when you already have specification documents and want to decompose them into implementation tasks.

Planning runs as a 3-layer pipeline:
1. **Scope analysis** (sonnet) — Extract components, validate ACs, create JIT context refs
2. **Task decomposition** (opus) — Decompose into test-bounded tasks with DAG
3. **DAG validation** (bash) — Cycle detection, coverage, structural checks

## Usage

```
/plan <worktree-path> [--auto]
/plan --find
```

## Arguments

- `worktree-path`: Path to an existing worktree with `state.json` (required unless `--find`)
- `--auto`: Skip confirmation prompts, proceed automatically
- `--find`: Search for existing homerun worktrees to plan

## Workflow

### 1. Find or Validate Worktree

If `--find` is specified:
```bash
# List all homerun worktrees with session info
for wt in $(git worktree list | grep 'create/' | awk '{print $1}'); do
  if [ -f "$wt/state.json" ]; then
    echo "$wt — $(jq -r '"\(.feature // "unknown") [\(.phase // "unknown")]"' "$wt/state.json")"
  fi
done
```
If multiple sessions exist, ask the user which one to plan.

Otherwise, validate the provided path:
```bash
# Check state.json exists
cat "$WORKTREE_PATH/state.json" | jq '.phase'
```

### 2. Validate Prerequisites

Read `state.json` and verify:
- `phase` is "discovery", "spec_review", "scope_analysis", or "task_decomposition" (not already "implementing")
- `spec_paths` are populated with valid file paths
- Spec documents exist at the referenced paths

```bash
# Verify spec docs exist
for spec in prd adr technical_design; do
  path=$(jq -r ".spec_paths.$spec" "$WORKTREE_PATH/state.json")
  [ -f "$path" ] && echo "$spec: OK" || echo "$spec: MISSING"
done
```

### 3. Invoke Scope Analyzer

```javascript
Task({
  description: "Analyze scope from specs",
  subagent_type: "scope-analyzer",
  model: "sonnet",
  prompt: `Extract scope analysis from specification documents.

  Worktree: ${worktree_path}
  State file: ${worktree_path}/state.json

  Read state.json and spec documents, then create docs/scope-analysis.json.`
});
```

### 4. Invoke Task Decomposer

```javascript
Task({
  description: "Decompose into tasks",
  subagent_type: "task-decomposer",
  prompt: `Decompose scope analysis into implementation tasks.

  Worktree: ${worktree_path}
  State file: ${worktree_path}/state.json

  Read docs/scope-analysis.json and create docs/tasks.json with DAG.`
});
```

### 5. Validate DAG

```bash
VALIDATE_RESULT=$(bash scripts/homerun-validate-dag.sh "${worktree_path}/docs/tasks.json" "${worktree_path}/docs/scope-analysis.json")
VALIDATE_EXIT=$?

if [ $VALIDATE_EXIT -eq 2 ]; then
  echo "DAG validation FAILED:"
  echo "$VALIDATE_RESULT" | jq '.errors[]'
  echo "Fix the issues and re-run /plan"
fi

if [ $VALIDATE_EXIT -eq 1 ]; then
  echo "DAG validation passed with warnings:"
  echo "$VALIDATE_RESULT" | jq '.warnings[]'
fi
```

### 6. Report

Display the task summary from the PLANNING_COMPLETE signal and DAG validation results.

## Examples

```
/plan ../myapp-create-user-auth-a1b2c3d4
/plan ../myapp-create-user-auth-a1b2c3d4 --auto
/plan --find
```
