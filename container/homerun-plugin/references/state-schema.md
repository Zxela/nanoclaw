# State Schema Reference

The `state.json` file lives at the worktree root and tracks the entire `/create` workflow lifecycle. This reference documents its schema and initialization.

## Full Schema

```json
{
  "session_id": "feature-name-a1b2c3d4",
  "branch": "create/feature-name-a1b2c3d4",
  "worktree": "../repo-create-feature-name-a1b2c3d4",
  "feature": "feature-name",
  "created_at": "2026-01-25T10:00:00Z",
  "phase": "discovery",
  "homerun_docs_dir": "/home/user/.claude/homerun/b1c2d3e4/feature-name-a1b2c3d4",
  "spec_paths": {
    "prd": "/home/user/.claude/homerun/b1c2d3e4/feature-name-a1b2c3d4/PRD.md",
    "adr": "/home/user/.claude/homerun/b1c2d3e4/feature-name-a1b2c3d4/ADR.md",
    "technical_design": "/home/user/.claude/homerun/b1c2d3e4/feature-name-a1b2c3d4/TECHNICAL_DESIGN.md",
    "wireframes": "/home/user/.claude/homerun/b1c2d3e4/feature-name-a1b2c3d4/WIREFRAMES.md"
  },
  "tasks_file": "docs/tasks.json",
  "traceability": {
    "user_stories": {
      "US-001": {
        "title": "User can register with email and password",
        "acceptance_criteria": ["AC-001", "AC-002", "AC-003"],
        "tasks": []
      }
    },
    "acceptance_criteria": {
      "AC-001": {
        "description": "When user submits registration with invalid email, the system displays 'Please enter a valid email'",
        "story": "US-001",
        "pattern": "assertion",
        "tasks": []
      }
    },
    "adr_decisions": {
      "ADR-001": {
        "title": "Use bcrypt for password hashing",
        "rationale": "Industry standard, configurable work factor",
        "tasks_affected": []
      }
    },
    "non_goals": [
      "NG-001: Social login (OAuth) is out of scope",
      "NG-002: Two-factor authentication is out of scope"
    ]
  },
  "tasks": {},
  "current_task": null,
  "config": {
    "auto_mode": false,
    "timeout_minutes": 30,
    "max_identical_rejections": 3,
    "max_iterations_without_progress": 3,
    "retries": {
      "same_agent": 1,
      "fresh_agent": 1
    }
  },
  "scale": "medium",
  "scale_details": {
    "estimated_files": 4,
    "adr_triggers": [],
    "docs_to_generate": ["prd", "technical_design"],
    "skip_scope_analysis": false
  },
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
        "started_at": "2026-01-25T10:00:00Z",
        "dialogue_turns": 0
      }
    },
    "refresh_log": []
  },
  "dialogue_state": {
    "turns_completed": 0,
    "topics_covered": [],
    "topics_remaining": [],
    "warnings_shown": false
  },
  "progress": {
    "iteration": 0,
    "tasks_completed_this_iteration": 0,
    "last_completion_iteration": 0
  },
  "skill_log": []
}
```

## Field Descriptions

| Field | Description |
|-------|-------------|
| `session_id` | Unique identifier combining feature slug and UUID |
| `branch` | Git branch name for this workflow |
| `worktree` | Path to the git worktree directory |
| `feature` | Slugified feature name |
| `created_at` | ISO 8601 timestamp of session creation |
| `phase` | Current workflow phase (discovery, spec_review, scope_analysis, task_decomposition, implementing, completing) |
| `homerun_docs_dir` | Absolute path to centralized spec document storage |
| `spec_paths` | Explicit absolute paths to each spec document |
| `tasks_file` | Relative path to tasks JSON file (e.g., "docs/tasks.json") |
| `traceability` | Links between user stories, acceptance criteria, ADR decisions, and tasks |
| `tasks` | Map of task IDs to status objects (populated in planning phase) |
| `current_task` | ID of task currently being worked on (null in discovery) |
| `config` | Configuration including auto_mode, timeouts, and retry limits |
| `scale` | Estimated scale: "small", "medium", or "large" |
| `scale_details` | Detailed scale breakdown with file count, ADR triggers, docs to generate |
| `token_tracking` | Token usage tracking configuration and phase data |
| `dialogue_state` | Discovery dialogue progress tracking |
| `progress` | Iteration tracking for deadlock detection |
| `skill_log` | Array of skill invocations for visibility and debugging |

## Traceability Structure

| Field | Purpose |
|-------|---------|
| `traceability.user_stories` | Maps story IDs to titles, acceptance criteria IDs, and implementing task IDs |
| `traceability.acceptance_criteria` | Maps criteria IDs to descriptions, source story, pattern type, and task IDs |
| `traceability.adr_decisions` | Maps ADR decision IDs to titles, rationale, and affected task IDs |
| `traceability.non_goals` | List of explicitly out-of-scope items for boundary checking |

## Path Rules

- Use **fully expanded absolute paths** from `$HOME`, not the variable itself
- Example: If `$HOME` is `/home/alice`, store `/home/alice/.claude/homerun/...`
- Never store `~` or `$HOME` literally — JSON doesn't expand shell variables

## Scale-Based Initialization

For **small** scale, set:
```json
{
  "scale": "small",
  "scale_details": {
    "estimated_files": 2,
    "adr_triggers": [],
    "docs_to_generate": ["technical_design"],
    "skip_scope_analysis": true
  }
}
```

For **medium** scale:
```json
{
  "scale": "medium",
  "scale_details": {
    "estimated_files": 4,
    "adr_triggers": [],
    "docs_to_generate": ["prd", "technical_design"],
    "skip_scope_analysis": false
  }
}
```

For **large** scale:
```json
{
  "scale": "large",
  "scale_details": {
    "estimated_files": 8,
    "adr_triggers": ["architecture_change"],
    "docs_to_generate": ["prd", "adr", "technical_design", "wireframes"],
    "skip_scope_analysis": false
  }
}
```
