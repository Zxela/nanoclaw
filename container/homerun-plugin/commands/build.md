---
name: build
description: "Jump directly into the execution phase with existing tasks. Use when you have a tasks.json and want to start or resume implementation."
argument-hint: "<worktree-path> [--auto]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, MultiEdit, Skill, Task
---

# /build Command

Jump directly into the execution/implementation phase. Use when you already have a `tasks.json` and want to start or resume implementation.

## Usage

```
/build <worktree-path> [--auto]
/build --find
```

## Arguments

- `worktree-path`: Path to an existing worktree with `state.json` and `docs/tasks.json` (required unless `--find`)
- `--auto`: Skip confirmation prompts
- `--find`: Search for existing homerun worktrees ready for build

## Workflow

### 1. Find or Validate Worktree

If `--find`:
```bash
# List all homerun worktrees with session info
for wt in $(git worktree list | grep 'create/' | awk '{print $1}'); do
  if [ -f "$wt/state.json" ]; then
    echo "$wt — $(jq -r '"\(.feature // "unknown") [\(.phase // "unknown")]"' "$wt/state.json")"
  fi
done
```
If multiple sessions exist, ask the user which one to build.

Otherwise validate:
```bash
cat "$WORKTREE_PATH/state.json" | jq '.phase'
cat "$WORKTREE_PATH/docs/tasks.json" | jq '.tasks | length'
```

### 2. Validate Prerequisites

- `state.json` exists with `phase` = "task_decomposition" or "implementing"
- `docs/tasks.json` exists with at least 1 task
- At least 1 task has `status: "pending"`

```bash
PENDING=$(jq '[.tasks[] | select(.status == "pending")] | length' "$WORKTREE_PATH/docs/tasks.json")
echo "Pending tasks: $PENDING"
```

### 3. Show Status

Before starting, display current progress:

```
Build status for: user-auth
  Total tasks: 8
  Completed: 3
  Pending: 4
  Failed: 1
```

**Auto mode (`--auto`):** Proceed immediately to team-lead invocation — do not prompt for confirmation.

**Interactive mode (default):** Ask `Ready to start? [Y/n]` before proceeding.

### 4. Invoke Team Lead

Invoke the team-lead skill inline to orchestrate implementation:

```javascript
Skill({ skill: "homerun:team-lead" });
```

The team-lead skill runs in the current session — it reads tasks.json, dispatches implementers via Task(), tracks progress, and runs the quality gate.

## Examples

```
/build ../myapp-create-user-auth-a1b2c3d4
/build ../myapp-create-user-auth-a1b2c3d4 --auto
/build --find
```
