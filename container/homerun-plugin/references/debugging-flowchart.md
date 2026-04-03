# Debugging Quick Reference

> For systematic debugging methodology, see `skills/systematic-debugging/SKILL.md`

## Is the Workflow Stuck?

```
START: Workflow not progressing
  |
  +-- Check state.json -> phase field
  |   |
  |   +-- "discovery" -------------------------+
  |   |   +-- Check: Did dialogue complete?    |
  |   |       +-- Yes -> Check spec_paths populated
  |   |       +-- No  -> Resume discovery or restart
  |   |                                        |
  |   +-- "scope_analysis" -----------------------+
  |   |   +-- Check: scope-analysis.json exist? |
  |   |       +-- Yes -> Phase should advance   |
  |   |       +-- No  -> Scope analyzer crashed |
  |   |                                         |
  |   +-- "task_decomposition" ------------------+
  |   |   +-- Check: Does tasks.json exist?     |
  |   |       +-- Yes -> Check DAG valid        |
  |   |       +-- No  -> Task decomposer crashed
  |   |                                        |
  |   +-- "implementing" ----------------------+
  |   |   +-- Check parallel_state (see below) |
  |   |                                        |
  |   +-- "completing" ------------------------+
  |       +-- Check: User presented with options?
  |           +-- Likely waiting for user input
  |
  +-- state.json missing or corrupt
      +-- Workflow failed before state init
```

## Implementation Phase Diagnostics

```
parallel_state analysis:
  |
  +-- blocked_by_failure: true
  |   +-- High-severity rejection waiting for user
  |   +-- ACTION: Check skill_log for failure details
  |
  +-- running_tasks: [] AND pending_review: []
  |   |
  |   +-- Check tasks.json for pending tasks
  |   |   +-- All completed -> Should transition to completing
  |   |   +-- Some pending -> Dependency deadlock
  |   |       +-- ACTION: Check blocked_by for cycles
  |   |
  |   +-- No pending tasks -> Workflow complete
  |
  +-- running_tasks: [items] (tasks running)
  |   +-- Check last skill_log timestamp
  |       +-- < 10 min ago -> Still processing
  |       +-- > 30 min ago -> Agent may have timed out
  |           +-- ACTION: Resume with /create --resume
  |
  +-- retry_queue: [items]
      +-- Tasks waiting for retry
      +-- ACTION: Check attempt counts, may need escalation
```

## Common Issues & Quick Fixes

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| No tasks running, many pending | Dependency cycle | `jq '.tasks[] \| select(.blocked_by \| length > 0)' tasks.json` |
| Same rejection 3x | Circuit breaker tripped | Review feedback, fix root cause manually |
| Team lead keeps refreshing | Token budget or state bloat | Check `tasks_since_refresh`, reduce task complexity |
| Implementer timeout | Task too large | Decompose into subtasks |
| "VALIDATION_ERROR" signal | Input contract violation | Check task schema matches implement skill input |
| Git conflicts in worktree | Concurrent modifications | `git status` in worktree, resolve manually |
| "IMPLEMENTATION_BLOCKED" | Missing dependency or unclear spec | Review blocker_type, update spec or deps |

## Quick Commands

```bash
# Check workflow phase
jq '.phase' state.json

# Check parallel state
jq '.parallel_state' state.json

# Find blocked tasks
jq '.tasks[] | select(.status == "pending") | select(.blocked_by | length > 0) | {id, blocked_by}' tasks.json

# Check recent skill invocations
jq '.skill_log | .[-5:]' state.json

# Find failed tasks
jq '.tasks[] | select(.status == "failed" or .attempts > 2)' tasks.json

# Check for dependency cycles
jq '[.tasks[] | {id, deps: .blocked_by}] | map(select(.deps | length > 0))' tasks.json

# Check token tracking
jq '.token_tracking' state.json
```

## When to Use Full Debugging Skill

Use `skills/systematic-debugging/SKILL.md` when:
- Quick reference didn't identify the issue
- Root cause is unclear after initial investigation
- Same issue recurs after "fix"
- Multiple components involved
- Need structured hypothesis testing

## Emergency Recovery

If workflow is unrecoverable:

```bash
# Option 1: Resume from last good state
/create --resume

# Option 2: Restart from planning (keep specs)
# Delete tasks.json, re-run planning phase

# Option 3: Full restart (keep nothing)
# Delete worktree, start fresh with /create
```

## Rollback Strategies

See team-lead SKILL.md "Rollback Strategy" section for:
- **Revert Commits** - Clean git history
- **Soft Skip** - Preserve partial work
- **Reset to Planning** - Re-decompose tasks
- **User Takeover** - Manual intervention
