# Token Estimation Guide

## Approximations

| Content Type | Tokens/KB | Notes |
|--------------|-----------|-------|
| Markdown prose | ~250 | SKILL.md files |
| JSON (formatted) | ~200 | state.json, tasks.json |
| TypeScript code | ~200 | Implementation files |
| Python code | ~180 | Implementation files |

## Phase Budgets

| Phase | Target | Warning | Max |
|-------|--------|---------|-----|
| Discovery | 40K | 60K | 80K |
| Planning | 30K | 45K | 60K |
| Team Lead | 20K | 30K | 40K |
| Implementer | 30K | N/A | N/A |
| Reviewer | 30K | N/A | N/A |

## Token Tracking Schema

Add to `state.json`:

```json
{
  "token_tracking": {
    "enabled": true,
    "config": {
      "window_size": 200000,
      "target_usage_percent": 50,
      "refresh_threshold_percent": 40,
      "warning_threshold_percent": 60
    },
    "phases": {
      "discovery": {
        "started_at": null,
        "ended_at": null,
        "estimated_peak_tokens": null,
        "dialogue_turns": 0
      },
      "planning": {
        "started_at": null,
        "ended_at": null,
        "estimated_peak_tokens": null,
        "tasks_generated": 0
      },
      "implementing": {
        "started_at": null,
        "team_lead_refreshes": 0,
        "implementer_invocations": 0,
        "reviewer_invocations": 0,
        "current_estimated_tokens": null
      }
    },
    "refresh_log": []
  }
}
```

## Estimation Formula

```javascript
function estimateTokens(state) {
  const base = {
    skill_content: 8000,  // SKILL.md after extraction
    state_json: Math.ceil(JSON.stringify(state).length / 4),
    tasks_json: state.tasks_file ? estimateFileTokens(state.tasks_file) : 0
  };

  // Team lead accumulates feedback
  const feedbackTokens = state.parallel_state?.active_tasks
    ?.reduce((sum, t) => sum + (t.feedback?.length || 0) * 500, 0) || 0;

  return base.skill_content + base.state_json + base.tasks_json + feedbackTokens;
}

function estimateFileTokens(filePath) {
  const stats = fs.statSync(filePath);
  const sizeKB = stats.size / 1024;
  // Use JSON approximation of ~200 tokens/KB
  return Math.ceil(sizeKB * 200);
}
```

## Refresh Triggers

Team-lead should refresh when ANY of:
1. `tasks_since_refresh >= team_lead_refresh_interval` (default: 5)
2. `estimated_tokens > refresh_threshold_percent * window_size`
3. `feedback_accumulation > 10KB`

## Token-Aware Refresh Decision

```javascript
function shouldRefreshTeamLead(state) {
  const tracking = state.token_tracking;
  const config = tracking?.config || {};

  // Task-count trigger (existing)
  if (state.parallel_state.tasks_since_refresh >= 5) {
    return { refresh: true, reason: 'task_count' };
  }

  // Token-based trigger (new)
  if (tracking?.enabled) {
    const estimated = estimateCurrentTokens(state);
    const threshold = (config.refresh_threshold_percent / 100) * config.window_size;

    if (estimated > threshold) {
      return { refresh: true, reason: 'token_threshold', estimated };
    }
  }

  return { refresh: false };
}
```

## Logging Refreshes

When refreshing, log to `token_tracking.refresh_log`:

```javascript
state.token_tracking.refresh_log.push({
  timestamp: new Date().toISOString(),
  reason: refreshDecision.reason,
  tasks_completed: state.parallel_state.tasks_since_refresh,
  estimated_tokens: refreshDecision.estimated
});

// Cap log at 20 entries to prevent state bloat
if (state.token_tracking.refresh_log.length > 20) {
  state.token_tracking.refresh_log = state.token_tracking.refresh_log.slice(-20);
}
```

## Skill Log Token Info

Include token estimates in skill_log entries:

```json
{
  "skill_log": [
    {
      "skill": "homerun:team-lead",
      "timestamp": "2026-01-25T12:00:00Z",
      "event": "refresh",
      "reason": "token_threshold",
      "estimated_tokens": 45000,
      "tasks_completed_this_session": 5
    }
  ]
}
```
