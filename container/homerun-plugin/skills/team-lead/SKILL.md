---
name: team-lead
description: "Guide implementation orchestration — dispatch implementers, track progress, run quality gate"
model: inherit
color: cyan
---

# Team Lead Skill

## Overview

You are orchestrating Phase 3 (Implementation). This skill runs **inline in the main session** — you dispatch implementers directly, track progress via native tasks, and run a quality gate at the end.

**Why inline?** Claude naturally handles coordination (ordering, parallelism, failure recovery) better than a constrained subagent with monitoring loops. This skill provides structure, not algorithms.

**Announce at start:** "Starting implementation — dispatching tasks from the DAG."

---

## Process

### 1. Load Tasks

```bash
cd "$WORKTREE_PATH"

TASKS_FILE=$(jq -r '.tasks_file' state.json)
TASK_COUNT=$(jq '.tasks | length' "$TASKS_FILE")
PENDING=$(jq '[.tasks[] | select(.status == "pending")] | length' "$TASKS_FILE")

echo "$PENDING pending of $TASK_COUNT total tasks"
```

Read the full tasks to understand the DAG:

```bash
jq '.tasks[] | {id, title, status, depends_on, type}' "$TASKS_FILE"
```

### 2. Create Native Tasks (Progress Tracking)

Convert each task to a native Claude Code task using TaskCreate. This gives the user visibility into progress.

**Two-pass approach** (create all, then add dependencies):

```
Pass 1: For each task in tasks.json:
  TaskCreate({
    subject: "[task.id] task.title",
    description: "Objective: ...\nAcceptance criteria: ...\nTest hints: ...",
    activeForm: "Implementing task.title"
  })
  Record the mapping: homerun_id → native_id

Pass 2: For each task with depends_on:
  TaskUpdate({
    taskId: native_id,
    addBlockedBy: [native_ids of dependencies]
  })
```

### 2.5. Feedback Pattern Injection

Before dispatching implementers, check for accumulated feedback patterns from prior rejections in this session.

```bash
FEEDBACK_FILE="$WORKTREE_PATH/feedback_patterns.json"
if [ -f "$FEEDBACK_FILE" ] && [ -s "$FEEDBACK_FILE" ]; then
  PATTERNS=$(jq -r '.common_patterns // [] | join(", ")' "$FEEDBACK_FILE")
  REJECTION_COUNT=$(jq -r '.total_rejections // 0' "$FEEDBACK_FILE")
  echo "Session has $REJECTION_COUNT prior rejections. Common patterns: $PATTERNS"
fi
```

**When feedback_patterns.json exists and is non-empty:**
- Read the `common_patterns` and `session_patterns` arrays
- Include a `previous_rejections` block in each implementer's task prompt:
  ```
  **Previous rejection patterns in this session (apply proactively):**
  ${session_patterns.map(p => `- Task ${p.task_id}: ${p.rejection_reasons.join(', ')}`).join('\n')}

  Common issues to avoid: ${common_patterns.join(', ')}
  ```
- This enables implementers to learn from earlier rejections without re-experiencing them

**When feedback_patterns.json does not exist or is empty:**
- Proceed normally — no injection needed
- This is the common case for the first task in a session

### Iteration Cap

To prevent unbounded retry loops:

- **Per-task cap:** Max 3 failed review cycles per individual task. After 3 rejections, mark the task as `needs_user_input` in tasks.json and escalate. Log: "Iteration cap reached for task [ID]. Escalating to user."
- **Session cap:** Max 5 total retries across all tasks in a session. After hitting the cap, pause the dispatch loop and present current status to the user before continuing.

These caps supersede any per-section retry limits below. When either cap is hit, do not retry — escalate.

### 3. Dispatch Loop

Work through the DAG by dispatching implementers for ready tasks.

**For each iteration:**

1. **Find ready tasks** — status "pending", all dependencies completed
2. **Decide parallelism:**
   - Independent tasks (no shared files, no dependency) → dispatch in parallel using `run_in_background: true` with `isolation: "worktree"`
   - Dependent tasks → dispatch sequentially (wait for result before next)
   - Cap at 3 concurrent implementers
3. **Select model by task type** — Read `references/model-routing.json` to determine the correct model. Haiku tasks (`add_field`, `add_method`, `add_validation`, `rename_refactor`, `add_test`, `add_config`, `add_endpoint`) use haiku. Sonnet tasks (`create_model`, `create_service`, `add_endpoint_complex`, `create_middleware`, `bug_fix`, `integration_test`) use sonnet. Architectural tasks use opus. **Always pass `model:` in the Task call** — the implementer agent defaults to sonnet, so haiku tasks will waste cost without the override.

4. **Dispatch implementer(s):**

```javascript
// Determine model from task_type (see references/model-routing.json)
const HAIKU_TYPES = ["add_field", "add_method", "add_validation", "rename_refactor", "add_test", "add_config", "add_endpoint"];
const taskModel = HAIKU_TYPES.includes(task.task_type) ? "haiku" : "sonnet";

Task({
  description: `Implement [${task.id}] ${task.title}`,
  subagent_type: "homerun:implementer",
  model: taskModel,
  isolation: "worktree",  // Only needed for parallel dispatch
  prompt: `Implement this task using TDD.

  Worktree: ${worktreePath}
  Task ID: ${task.id}
  Title: ${task.title}
  Objective: ${task.objective}

  Acceptance criteria:
  ${task.acceptance_criteria.map(c => '- ' + c).join('\n')}

  Test hints:
  ${task.test_hints.map(h => '- ' + h).join('\n')}

  Spec documents: ${JSON.stringify(specPaths)}

  Previous session feedback: ${feedbackContext || 'None (first task)'}

  Use commit message format: [${task.id}] <description>
  Update docs/tasks.json status to "completed" when done.`
});
```

5. **After each implementer returns:**
   - **If `NEEDS_REWORK`:** Re-dispatch the implementer immediately with the self-review findings as `previous_feedback`. No reviewer is needed — the implementer caught its own issues. Include the `findings` array so the implementer knows exactly what to fix. This counts toward the retry limit (max 2 retries per task).
   - **If `IMPLEMENTATION_COMPLETE` with `hard_gate_results`:** Mark the native task completed, then dispatch the reviewer with `skip_hard_gates: true` and the `hard_gate_results` from the implementer (see Section 3.5). This lets the reviewer skip Tier 1 re-execution when all exit codes are 0.
   - **If `IMPLEMENTATION_COMPLETE` without `hard_gate_results`:** Mark the native task completed, dispatch the reviewer normally (no `skip_hard_gates`).
   - Update tasks.json if the implementer didn't already
   - Find next batch of ready tasks
   - Repeat until no pending tasks remain

**Handling failures:** If an implementer fails:
- Check what went wrong (read its output)
- Retry once with the error context added to the prompt
- If still failing after 2 attempts, skip the task and note it
- Continue with remaining tasks (failed tasks may block dependents — that's expected)

### Requirement Change Detection

During the dispatch loop, watch for signals that requirements have shifted. If ANY of these are detected in user messages, **stop the dispatch loop** and return to discovery/re-scoping before continuing:

| Signal | Example | Action |
|--------|---------|--------|
| **New features mentioned** | "Oh, we should also add email notifications" | Stop — new scope needs spec updates |
| **Constraint additions** | "Actually, this needs to work offline too" | Stop — constraint changes ripple through design |
| **Technical requirement changes** | "Let's use WebSockets instead of polling" | Stop — architecture decision needs ADR update |
| **Scope expansion** | "Can we also handle the admin side?" | Stop — new user stories need PRD update |
| **Behavioral pivots** | "Actually the error should retry, not fail" | Assess — minor AC update vs. architectural change |

**When detected:**
1. Pause all pending implementer dispatches (let active ones finish)
2. Inform the user: "I noticed a potential requirement change: [specific signal]. This may affect the current implementation plan."
3. Ask whether to: (a) update specs and re-plan affected tasks, (b) note it for a follow-up, or (c) ignore — it was just thinking out loud
4. If (a): update spec documents, re-run scope analysis for affected tasks only, resume dispatch

### 3.5. Continuous Incremental Review

Instead of waiting for all implementers to finish before reviewing, spawn reviewers **as each task completes**. This parallelizes review with ongoing implementation.

**Review dispatch rules:**

1. **On task completion:** When an implementer finishes and its task status moves to "completed", immediately check for available reviewer slots
2. **Concurrency limit:** Maximum **2 concurrent reviewers** at any time
3. **Parallel with implementers:** Reviewers run alongside remaining implementers — do not wait for all implementations to finish

**Dispatch a reviewer for each completed task:**

```javascript
// When implementer completes task X:
const activeReviewers = countActiveReviewers(); // track spawned reviewer agents
const hardGates = task.hard_gate_results; // from implementer's completion signal
const canSkipHardGates = hardGates &&
  hardGates.tests === 0 && hardGates.types === 0 && hardGates.lint === 0;

if (activeReviewers < 2) {
  Task({
    description: `Review [${task.id}] ${task.title}`,
    subagent_type: "homerun:reviewer",
    run_in_background: true,
    prompt: `Review this implementation against its specification.

    Worktree: ${worktreePath}
    Task ID: ${task.id}
    Title: ${task.title}
    Objective: ${task.objective}
    Commit hash: ${task.commit_hash}
    Files changed: ${task.files_changed}

    Acceptance criteria:
    ${task.acceptance_criteria.map(c => '- ' + c.criterion).join('\n')}

    Spec documents: ${JSON.stringify(specPaths)}

    skip_hard_gates: ${canSkipHardGates}
    hard_gate_results: ${JSON.stringify(hardGates || {})}

    ${canSkipHardGates
      ? 'Hard gates passed in implementer self-review. Skip Tier 1, go straight to Tier 2 soft review.'
      : 'Run Tier 1 hard gates first, then Tier 2 soft review.'}
    Emit APPROVED or REJECTED signal.`
  });
} else {
  // Queue for review when a slot opens
  reviewQueue.push(task.id);
}
```

**Handling NEEDS_REWORK (from implementer self-review):**

When an implementer emits `NEEDS_REWORK` instead of `IMPLEMENTATION_COMPLETE`:
1. Read the `findings` array from the signal
2. Re-dispatch the implementer with findings as `previous_feedback` — no reviewer needed
3. This counts toward the retry limit (max 2 retries per task)
4. If the implementer still emits `NEEDS_REWORK` after max retries, skip the task and note it

**Handling rejections (from reviewer):**

When a reviewer emits `REJECTED`:
1. Read the rejection feedback
2. Load feedback_patterns.json (updated by the post-implement hook)
3. **Placeholder escalation check:** If >2 rejections for the same task (or across tasks) cite "incomplete", "vague", or "placeholder" in their reasons, the root cause is the AC — not the implementation. Do NOT retry the implementer. Instead:
   - Mark the task as "blocked" in tasks.json with reason "placeholder_ac"
   - Escalate to re-decomposition: re-invoke `homerun:task-decomposition` for the affected task(s), providing the rejection feedback as context
   - Resume the dispatch loop only after decomposition produces concrete ACs
4. Re-dispatch the implementer with:
   - The specific rejection issues from the reviewer
   - The accumulated session feedback patterns (from Section 2.5)
   - A retry counter (max 2 retries per task)
5. The re-dispatched implementer runs alongside other active implementers/reviewers

**Handling approvals:**

When a reviewer emits `APPROVED`:
1. Mark the task as "approved" in tasks.json
2. Check reviewQueue — if tasks are waiting for review, dispatch the next one
3. Check if all tasks are now approved → if yes, proceed to Quality Gate (Section 4)

**Monitoring loop:**

```
while (pendingTasks > 0 || activeImplementers > 0 || activeReviewers > 0):
  1. Check for completed implementers → dispatch reviewers (up to 2)
  2. Check for completed reviewers → handle APPROVED/REJECTED
  3. Dispatch next batch of ready implementers (respecting DAG)
  4. Repeat
```

**Exit condition:** All tasks are either "approved" or "skipped" (after max retries). Then proceed to the final Quality Gate.

### 4. Quality Gate

After all tasks complete (or are skipped):

```javascript
// Determine session tier: if ALL tasks were haiku-type, tier = "haiku". Otherwise "sonnet".
const HAIKU_TYPES = ["add_field", "add_method", "add_validation", "rename_refactor", "add_test", "add_config", "add_endpoint"];
const sessionTier = completedTasks.every(t => HAIKU_TYPES.includes(t.task_type)) ? "haiku" : "sonnet";

Task({
  description: "Final quality check",
  subagent_type: "homerun:quality-checker",
  prompt: `Run the quality pipeline.

  Worktree: ${worktreePath}
  Files changed: ${allChangedFiles}
  Fix mode: auto
  Tier: ${sessionTier}

  ${sessionTier === "haiku"
    ? "Haiku-tier session: run lint, type checks, and tests only. Skip structural review (Phase 3) and LLM auto-fix."
    : "Run lint, type checks, structural review, tests, and final recheck. Auto-fix issues where possible."
  }`
});
```

**Quality check is a blocking gate.** If the quality check returns a `verdict: "fail"`:

1. **Do NOT proceed to merge or PR creation.** The failure blocks forward progress.
2. Surface the unresolved issues to the user with full details.
3. Ask the user to decide: (a) fix the issues and re-run quality check, (b) override and proceed anyway.
4. **Escalation rule:** If quality check fails **twice on the same issues**, escalate to the user with a summary of the recurring failures and a recommendation. Do not attempt a third automatic fix cycle.

### 5. Complete

```bash
# Update state.json
jq '.phase = "completing" | .orchestration_completed_at = now' state.json > state.json.tmp && mv state.json.tmp state.json

# Or via Write tool:
# Update state.json phase to "completing"
```

---

## Scale-Based Routing

Before the full dispatch loop, check task count:

| Tasks | Strategy |
|-------|----------|
| 1-2 | Dispatch sequentially, skip worktree isolation |
| 3-5 | Dispatch in parallel batches based on DAG |
| 6+ | Dispatch up to 3 concurrent, process DAG in waves |

For 1-2 tasks, the overhead of worktree creation and merging exceeds the parallelism benefit. Just run them sequentially in the current worktree.

---

## Exit Criteria

- [ ] All tasks from tasks.json dispatched to implementers
- [ ] All tasks completed or skipped with documented reasons
- [ ] Native tasks updated to reflect final status
- [ ] Quality check passed (or user explicitly overrode failures)
- [ ] state.json phase set to "completing"
