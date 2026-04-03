# Retry Patterns Reference

Extracted from team-lead orchestration logic for token efficiency.

## Retry Queue Structure

```json
{
  "retry_queue": [
    {
      "task_id": "002",
      "attempt": 1,
      "last_error": "Test assertion failed: expected 200, got 404",
      "retry_type": "fresh_agent",
      "scheduled_at": "2026-01-25T11:00:00Z"
    }
  ]
}
```

## Retry Precedence (Priority Order)

1. **Fresh pending tasks** - Always prefer unstarted work
2. **Fresh-agent retries** - Clean slate with structured failure summary (DEFAULT for first retry)
3. **Same-agent retries** - Only for trivial fixes where accumulated context helps
4. **Model escalation** - Upgrade haiku to sonnet on persistent failure

## Fresh-Context-First Strategy

**Rationale (from Anthropic best practices):** "After two failed corrections, /clear and write a better initial prompt incorporating what you learned." Accumulated context from failed attempts is the #1 cause of degraded retry performance — each failed attempt adds ~500 tokens of noise.

**Key principle:** The first retry should ALWAYS be a fresh agent with a structured failure summary, NOT a retry with accumulated context. This is the inverse of the naive approach.

## Retry Type Logic

```javascript
function getRetryType(task, state) {
  const attempts = getAttemptCount(task.id, state);

  // FIRST retry: fresh agent with clean context + structured failure summary
  // This is MORE likely to succeed than retrying with accumulated context
  if (attempts === 1) {
    return {
      type: 'fresh_agent',
      model: task.model,
      context: buildStructuredFailureSummary(task)
    };
  }

  // SECOND retry: same agent with targeted guidance (for trivial remaining fixes)
  if (attempts === 2) {
    return { type: 'same_agent', model: task.model };
  }

  // THIRD retry: escalate haiku to sonnet
  if (task.model === 'haiku') {
    return { type: 'escalate', model: 'sonnet' };
  }

  return { type: 'human_escalation' };
}

// Build a concise summary of what failed and why, NOT raw reviewer feedback
function buildStructuredFailureSummary(task) {
  const lastRejection = task.feedback[task.feedback.length - 1];
  return {
    task_objective: task.objective,
    what_failed: lastRejection.issues.map(i => i.description).join('; '),
    specific_fixes_needed: lastRejection.required_fixes,
    // DO NOT include: raw reviewer output, previous implementation code,
    // or accumulated context from failed attempts
  };
}
```

## Circuit Breaker Pattern

Prevents cascading failures when something is fundamentally broken:

```javascript
const circuitBreaker = {
  consecutive_failures: 0,
  threshold: 3,
  state: 'closed', // closed, open, half-open

  recordFailure() {
    this.consecutive_failures++;
    if (this.consecutive_failures >= this.threshold) {
      this.state = 'open';
      return { action: 'stop_spawning', reason: 'circuit_open' };
    }
    return { action: 'continue' };
  },

  recordSuccess() {
    this.consecutive_failures = 0;
    this.state = 'closed';
  },

  canSpawn() {
    return this.state !== 'open';
  }
};
```

## Failure Severity Classification

| Severity | Examples | Response |
|----------|----------|----------|
| **low** | Style issues, missing docstring | Retry with guidance |
| **medium** | Logic error, missing validation | Retry + add to technical notes |
| **high** | Security flaw, architectural violation | Block spawning, escalate |

## High-Severity Blocking

When a high-severity rejection occurs:

```javascript
function handleHighSeverityRejection(task, rejection, state) {
  // Stop spawning new tasks
  state.parallel_state.blocked_by_failure = true;
  state.parallel_state.failure_severity = 'high';
  state.parallel_state.blocking_task = task.id;

  // Let running tasks complete
  // Don't kill in-flight work

  // Present recovery options
  return {
    signal: 'HIGH_SEVERITY_FAILURE',
    task_id: task.id,
    issues: rejection.issues,
    options: [
      'retry_with_guidance',
      'mark_fixed',
      'skip_task',
      'return_to_planning'
    ]
  };
}
```

## Retry with Structured Failure Summary

When retrying with a fresh agent, provide a concise failure summary:

```javascript
function buildRetryPrompt(task, previousAttempt, rejection) {
  return {
    task: task,
    retry_context: {
      attempt_number: previousAttempt.attempt + 1,
      // Structured summary — NOT raw accumulated context
      failure_summary: `Previous attempt rejected: ${rejection.summary}`,
      specific_fixes: rejection.required_fixes,
      // Explicitly omit: previous implementation code, full reviewer output,
      // accumulated dialogue context
    }
  };
}
```

## Progress Tracking

Detect stalls with iteration tracking:

```javascript
function checkProgress(state) {
  const { iteration, tasks_completed_this_iteration, last_completion_iteration } = state.progress;

  // No completions in 3 iterations = potential deadlock
  if (iteration - last_completion_iteration >= 3 && tasks_completed_this_iteration === 0) {
    return {
      stalled: true,
      reason: 'no_progress',
      action: 'trigger_deadlock_recovery'
    };
  }

  return { stalled: false };
}
```

## Recovery Options

When blocked or stalled, present these options:

| Option | Action | When to Use |
|--------|--------|-------------|
| **Retry with guidance** | Fresh agent with structured failure summary | Fixable issues |
| **Mark as fixed** | User fixed manually, re-review | External fix applied |
| **Skip task** | Mark skipped, unblock dependents | Non-critical task |
| **Return to planning** | Re-decompose the task | Fundamental design issue |
| **User takeover** | Exit team-lead, user continues | Complex judgment needed |
