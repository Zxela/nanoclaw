---
name: task-decomposition
description: "[opus] Decompose scope analysis into test-bounded, commit-sized tasks with DAG dependencies"
model: opus
color: purple
---

# Task Decomposition Skill

## Reference Materials

- Model routing: `references/model-routing.json`
- Decomposition examples: `cookbooks/task-decomposition-examples.md`
- Agent handoff patterns: `references/context-engineering.md`

## Overview

Decompose a pre-analyzed scope into a sequence of test-bounded tasks. Each task represents exactly one commit with at least one verifying test (unless explicitly exempted). This skill receives `docs/scope-analysis.json` (produced by the scope-analyzer) as its primary input and transforms it into executable implementation units.

**Model Selection:** This skill runs on **opus** because decomposition is high-leverage work — poor task boundaries cascade into implementation failures. See `references/context-engineering.md` for rationale.

**What this skill does NOT do** (handled by scope-analysis):
- Read raw spec documents (PRD, ADR, TECHNICAL_DESIGN)
- Validate acceptance criteria testability
- Extract components, data models, API contracts
- Create JIT context references from scratch

---

## Input

### Primary Input: docs/scope-analysis.json

The scope-analyzer produces this file with:
- `components` — Identified components with layer classification
- `data_models` — Extracted data models with fields and relationships
- `api_contracts` — API endpoints with request/response schemas
- `external_dependencies` — Third-party dependencies
- `acceptance_criteria` — Validated ACs with testability patterns and test assertion templates
- `jit_context_refs` — Pre-computed JIT references by component
- `non_scope` — Explicit exclusions
- `change_impact_map` — Direct and indirect impact areas
- `testing_strategy` — Overall testing approach
- `traceability` — Links from state.json

### Secondary Input: state.json

Read `state.json` for:
- `worktree_path` — Working directory
- `session_id` — Session identifier
- `branch` — Git branch
- `spec_paths` — Paths to spec documents (for targeted reads if needed)
- `config` — Auto mode, retry settings

### Input Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["worktree_path"],
  "properties": {
    "worktree_path": { "type": "string" },
    "session_id": { "type": "string" },
    "branch": { "type": "string" },
    "spec_paths": {
      "type": "object",
      "properties": {
        "prd": { "type": "string" },
        "adr": { "type": "string" },
        "technical_design": { "type": "string" },
        "wireframes": { "type": ["string", "null"] }
      }
    },
    "config": {
      "type": "object",
      "properties": {
        "auto_mode": { "type": "boolean" }
      }
    }
  }
}
```

---

## Output Schema (JSON)

When task decomposition completes, output a JSON signal:

### Success: PLANNING_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "tasks_count", "tasks_file"],
  "properties": {
    "signal": { "const": "PLANNING_COMPLETE" },
    "tasks_count": { "type": "integer" },
    "tasks_file": { "type": "string" },
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "depends_on": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "dependency_graph_valid": { "type": "boolean" },
    "coverage": {
      "type": "object",
      "properties": {
        "user_stories": { "type": "integer" },
        "acceptance_criteria": { "type": "integer" }
      }
    }
  }
}
```

**Example:**

```json
{
  "signal": "PLANNING_COMPLETE",
  "tasks_count": 8,
  "tasks_file": "docs/tasks.json",
  "tasks": [
    {"id": "001", "title": "Setup database schema", "depends_on": []},
    {"id": "002", "title": "Create User model", "depends_on": ["001"]},
    {"id": "003", "title": "Add auth service", "depends_on": ["002"]}
  ],
  "dependency_graph_valid": true,
  "coverage": {
    "user_stories": 3,
    "acceptance_criteria": 12
  }
}
```

---

## Task Decomposition Rules

### Each Task Must Be:

1. **Completable in a single commit** - No partial implementations
2. **Test-bounded** - At least one test verifies the task is done
3. **Clearly scoped** - Acceptance criteria derived from scope analysis
4. **Dependency-aware** - Explicitly declares what it depends on

### Task Sizing Guide

**Too Big (split it):**
- Implements multiple user stories
- Touches more than 3-4 files substantially
- Would take more than ~1 hour to implement
- Has acceptance criteria spanning multiple concerns
- Example: "Implement user authentication" (split into: schema, model, routes, middleware, tests)

**Right Size:**
- Single focused change
- One clear acceptance criterion
- Testable in isolation
- 15-45 minutes of implementation
- Example: "Add User model with password hashing"

**Too Small (combine it):**
- Adds a single constant or type
- Changes only whitespace or formatting
- Cannot be meaningfully tested alone
- Example: "Add USER_ROLES constant" (combine with model that uses it)

### No-Test Exceptions

The following task types may skip the test requirement:

| Exception | Reason | Verification Alternative |
|-----------|--------|-------------------------|
| Documentation only | No code behavior to test | Manual review |
| Configuration files | Static data, no logic | Schema validation |
| Type definitions only | TypeScript/Flow types | Type checker passes |
| Dependency updates | Third-party code | Existing tests pass |
| Delete dead code | Removal only | Existing tests pass |

When using an exception, the task must include:
```yaml
test_file: null
no_test_reason: "documentation only"
```

### AC Risk-Level Classification (Test Worthiness)

Not every acceptance criterion needs a dedicated test. Classify each AC by risk level to control test bloat:

| Risk Level | When to Use | Test Requirement |
|---|---|---|
| `must_test` | Core behavior, security checks, data mutations, business logic | Dedicated test per AC |
| `verify_only` | Secondary behavior, simple CRUD, happy-path only | Consolidate into integration test with related ACs |
| `structural` | Type correctness, field existence, config presence | Covered by types/lint — no runtime test needed |

**Classification rules:**
1. Default to `must_test` if uncertain
2. ACs involving user input validation, authentication, or data persistence → always `must_test`
3. ACs that only assert a field exists or a type compiles → `structural`
4. Same-layer subtasks with related ACs can share a test file (`verify_only`)

**Test budget by scale:**

| Scale | Test Budget | Rationale |
|-------|-------------|-----------|
| Small | 2-4 tests | Minimal feature, focused coverage |
| Medium | 4-8 tests | Standard feature, per-component coverage |
| Large | 10-20 tests | Complex feature, per-AC coverage for `must_test` |

**Test consolidation guidance:** Subtasks within the same architectural layer (e.g., two model fields, two config entries) should share a test file rather than each getting a dedicated one.

Add `risk_level` to each AC in the tasks.json output:

```json
{
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "criterion": "User can register with email/password",
      "risk_level": "must_test",
      "test_assertion": "expect(user).toBeDefined()"
    },
    {
      "id": "AC-002",
      "criterion": "User model has created_at field",
      "risk_level": "structural"
    }
  ]
}
```

### Placeholder Rejection (Iron Law: No Vague ACs)

Every acceptance criterion written into tasks.json MUST be concrete and implementable without interpretation. If you catch yourself writing a placeholder, STOP and fix it before proceeding.

**Reject any AC matching these patterns:**

| Pattern | Example | Why It Fails |
|---------|---------|--------------|
| Deferred language | "TBD", "TODO", "implement later", "fill in details" | Not an AC — it's a reminder to write one |
| Generic quality hand-waves | "Add appropriate error handling", "add validation", "handle edge cases" | Describes WHAT without HOW — the implementer cannot verify completion |
| Cross-references without substance | "Similar to Task N", "same as above" | Must repeat the concrete details — the implementer reads one task at a time |
| Vague objectives | "Make it work correctly", "ensure good performance" | Describes intent without observable, testable behavior |

**Detection rule:** If an AC does not suggest a specific test assertion, it is a placeholder. Every AC must answer: "What exact check would a test run to verify this?"

**When placeholder ACs are detected** — whether in scope-analysis.json input or in your own draft — emit `VALIDATION_ERROR` and halt:

```json
{
  "signal": "VALIDATION_ERROR",
  "error_type": "semantic_error",
  "errors": [
    {
      "path": "$.acceptance_criteria[N]",
      "message": "Placeholder AC detected — not implementable without interpretation",
      "expected": "Concrete criterion with testable assertion (e.g., 'Returns 401 when token is expired')",
      "received": "Add appropriate error handling"
    }
  ]
}
```

**Do NOT proceed to tasks.json output with placeholder ACs.** Fix them first by deriving concrete criteria from the scope analysis, or escalate if the source specs lack sufficient detail.

### Task Type Classification (Model Routing)

See `references/model-routing.json` for the authoritative task type to model mapping.

**Classification rules:**
1. Default to `haiku` for mechanical, pattern-following tasks
2. Use `sonnet` when task requires design decisions or security implications
3. Use `opus` only for architectural tasks requiring broad context
4. If `decomposable=true` in the routing config, break into haiku-sized subtasks

---

## Subtask Decomposition Rules

### MUST Decompose (Required)

A task MUST be decomposed into subtasks if ANY of these conditions:

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| Acceptance criteria count | > 3 | Too many behaviors for single focus |
| Estimated files changed | > 4 | Too much scope for single commit |
| Multiple architectural layers | >= 2 layers | E.g., model + service + API |
| Task type is decomposable | See model-routing.json | Sonnet tasks often need subtasks |
| Title contains "and" | Connecting distinct ops | "Create user AND send email" |

### SHOULD Decompose (Recommended)

Consider decomposition if ANY of these:

| Condition | Signal | Action |
|-----------|--------|--------|
| Multiple test files needed | Different test concerns | Split by test file |
| Mixed methodologies | TDD + config changes | Separate TDD from direct |
| External dependencies | API calls, DB setup | Isolate integration points |
| Risk concentration | One task blocks many | Reduce blast radius |

### MUST NOT Decompose

Do NOT decompose if:
- Task is already haiku-level (add_field, add_method, etc.)
- Single acceptance criterion
- Pure refactoring with no behavior change
- Documentation-only changes

### Decomposition Patterns

**Pattern 1: Vertical Slice**
```
Parent: "Create user registration"
  +-- 001a: Create User model with fields
  +-- 001b: Add validation methods to User
  +-- 001c: Create UserService.register()
  +-- 001d: Add /register endpoint
  +-- 001e: Add registration tests
```

**Pattern 2: By Acceptance Criterion**
```
Parent: "Implement password reset" (AC-001, AC-002, AC-003)
  +-- 001a: AC-001 - Generate reset token
  +-- 001b: AC-002 - Send reset email
  +-- 001c: AC-003 - Validate and update password
```

**Pattern 3: By Layer**
```
Parent: "Add audit logging"
  +-- 001a: Create AuditLog model
  +-- 001b: Create AuditService
  +-- 001c: Add middleware for auto-logging
  +-- 001d: Add audit log endpoint
```

### Subtask Specifications

When decomposing, each subtask MUST have:

```json
{
  "id": "001a",
  "parent_id": "001",
  "title": "Create User model with fields",
  "task_type": "add_field",
  "model": "haiku",
  "acceptance_criteria": [
    { "id": "001a-AC1", "text": "User model exists with email, password_hash fields" }
  ],
  "test_file": "tests/models/user.test.ts",
  "blocked_by": [],
  "estimated_scope": "single_file"
}
```

**Subtask constraints:**
- Max 1 acceptance criterion per subtask (prefer)
- Single file focus when possible
- Haiku model unless requires judgment
- Clear dependency chain (a -> b -> c)

---

## Process

### 1. Read Scope Analysis

Read the scope analysis produced by the scope-analyzer:

```bash
cd "$WORKTREE_PATH"

# Read scope analysis
cat docs/scope-analysis.json | jq .

# Summary of components
jq '.components[] | "\(.name) [\(.layer)]: \(.responsibility)"' docs/scope-analysis.json

# Summary of acceptance criteria
jq '.acceptance_criteria[] | "\(.id): \(.criterion) [testable=\(.testable)]"' docs/scope-analysis.json

# Non-scope boundaries
jq '.non_scope[]' docs/scope-analysis.json
```

Also read `state.json` for session context and traceability:

```bash
jq '{session_id, branch, spec_paths, traceability}' state.json
```

### 2. Create Dependency Graph

Using components from scope-analysis.json, map out which components depend on others:

```
                    ┌─────────────┐
                    │   Schema    │
                    │  (001-xxx)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Model   │ │  Model   │ │  Types   │
        │ (002-xx) │ │ (003-xx) │ │ (004-xx) │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └────────────┼────────────┘
                          │
                          ▼
                   ┌────────────┐
                   │  Service   │
                   │  (005-xx)  │
                   └──────┬─────┘
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │  Route   │ │  Route   │ │Middleware│
       │ (006-xx) │ │ (007-xx) │ │ (008-xx) │
       └──────────┘ └──────────┘ └──────────┘
```

**Rules for ordering:**
1. Foundation tasks first (schemas, types, configs)
2. Data layer before business logic
3. Business logic before API/UI
4. Integration tests after unit tests
5. Documentation last

### 3. Populate Task Context Refs

For each task, populate `context_refs` using pre-computed JIT references from `scope-analysis.json`:

```bash
# Read pre-computed JIT refs for a component
jq '.jit_context_refs.by_component["UserService"]' docs/scope-analysis.json
```

Each task's `context_refs` should include:

| Field | Source | Example |
|-------|--------|---------|
| `interface_locations` | `scope-analysis.json → jit_context_refs.by_component[X].interface_locations` | `["src/models/user.ts:User interface"]` |
| `pattern_files` | `scope-analysis.json → jit_context_refs.by_component[X].pattern_files` | `["src/services/base.ts"]` |
| `grep_patterns` | `scope-analysis.json → jit_context_refs.by_component[X].grep_patterns` | `["export class.*Service"]` |
| `constraints_section` | `scope-analysis.json → jit_context_refs.by_component[X].constraints_section` | `"ADR.md:## Decision 1"` |

### 4. Write tasks.json

Create a single `tasks.json` file containing all tasks:

```
docs/
├── scope-analysis.json   # Input from scope-analyzer
├── specs/
│   ├── PRD.md
│   ├── ADR.md
│   └── TECHNICAL_DESIGN.md
└── tasks.json            # Output from task-decomposer
```

#### tasks.json Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["tasks"],
  "properties": {
    "tasks": {
      "type": "array",
      "items": { "$ref": "#/definitions/task" }
    }
  },
  "definitions": {
    "task": {
      "type": "object",
      "required": ["id", "title", "objective", "acceptance_criteria", "status", "depends_on", "task_type"],
      "properties": {
        "id": { "type": "string", "pattern": "^[0-9]{3}[a-z]?$" },
        "title": { "type": "string" },
        "objective": { "type": "string" },
        "task_type": {
          "type": "string",
          "enum": ["add_field", "add_method", "add_validation", "rename_refactor",
                   "add_test", "add_config", "create_model", "create_service",
                   "add_endpoint", "add_endpoint_complex", "create_middleware",
                   "bug_fix", "integration_test", "architectural"],
          "description": "Task classification for model routing"
        },
        "methodology": {
          "type": "string",
          "enum": ["tdd", "direct"],
          "default": "tdd",
          "description": "Implementation approach - 'direct' for config/docs only"
        },
        "acceptance_criteria": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "criterion"],
            "properties": {
              "id": { "type": "string" },
              "criterion": { "type": "string" },
              "risk_level": {
                "type": "string",
                "enum": ["must_test", "verify_only", "structural"],
                "default": "must_test",
                "description": "Test requirement level — determines testing approach for this AC"
              },
              "test_assertion": { "type": "string" }
            }
          }
        },
        "test_file": { "type": ["string", "null"] },
        "no_test_reason": { "type": "string" },
        "status": { "enum": ["pending", "in_progress", "completed", "blocked", "failed"] },
        "depends_on": { "type": "array", "items": { "type": "string" } },
        "traces_to": {
          "type": "object",
          "properties": {
            "user_stories": { "type": "array", "items": { "type": "string" } },
            "acceptance_criteria": { "type": "array", "items": { "type": "string" } },
            "adr_decisions": { "type": "array", "items": { "type": "string" } }
          }
        },
        "technical_notes": { "type": "string" },
        "context_refs": {
          "type": "object",
          "description": "JIT context references — populated from scope-analysis.json pre-computed refs",
          "properties": {
            "interface_locations": { "type": "array", "items": { "type": "string" }, "description": "File paths + section names for relevant interfaces" },
            "pattern_files": { "type": "array", "items": { "type": "string" }, "description": "Paths to existing implementations showing patterns to follow" },
            "grep_patterns": { "type": "array", "items": { "type": "string" }, "description": "Grep patterns to discover related code at runtime" },
            "constraints_section": { "type": "string", "description": "Section reference in ADR/TECHNICAL_DESIGN for constraints" }
          }
        },
        "model": { "enum": ["opus", "sonnet", "haiku"], "default": "sonnet" },
        "subtasks": { "type": "array", "items": { "$ref": "#/definitions/task" } }
      }
    }
  }
}
```

#### Example tasks.json

```json
{
  "tasks": [
    {
      "id": "001",
      "title": "Setup database schema for users",
      "objective": "Create the database schema for the users table with all required fields for authentication as specified in TECHNICAL_DESIGN.md.",
      "task_type": "add_config",
      "methodology": "tdd",
      "acceptance_criteria": [
        {
          "id": "AC-001",
          "criterion": "Users table has id, email, password_hash, created_at, updated_at",
          "test_assertion": "expect(columns).toContain(['id', 'email', 'password_hash'])",
          "risk_level": "must_test"
        },
        {
          "id": "AC-002",
          "criterion": "Email has unique constraint",
          "test_assertion": "expect(insertDuplicate).toThrow(/unique/i)",
          "risk_level": "must_test"
        }
      ],
      "test_file": "tests/schema/user.test.ts",
      "status": "pending",
      "depends_on": [],
      "traces_to": {
        "user_stories": ["US-001"],
        "acceptance_criteria": ["AC-001", "AC-002"],
        "adr_decisions": ["ADR-001"]
      },
      "technical_notes": "Use UUID for primary key. Password hash using bcrypt (ADR-001). Soft delete via deleted_at.",
      "context_refs": {
        "interface_locations": ["TECHNICAL_DESIGN.md:## Data Model:Users table"],
        "pattern_files": [],
        "grep_patterns": ["CREATE TABLE.*users", "migration.*user"],
        "constraints_section": "ADR.md:## Decision 1"
      },
      "model": "haiku"
    }
  ]
}
```

#### Task Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Sequential ID: "001", "002", or subtask "001a", "001b" |
| title | string | Yes | Brief, imperative task description |
| objective | string | Yes | What this task accomplishes |
| task_type | enum | Yes | Classification for model routing (see Task Type Classification) |
| methodology | enum | No | `tdd` (default) or `direct` for config/docs only |
| acceptance_criteria | array | Yes | List of criteria with test assertions |
| test_file | string | Conditional | Path to test file, null if exception applies |
| no_test_reason | string | Conditional | Required if test_file is null |
| status | enum | Yes | pending, in_progress, completed, blocked, failed |
| depends_on | array | Yes | Task IDs that must complete first |
| traces_to | object | Yes | Links to user stories, acceptance criteria, ADR decisions |
| technical_notes | string | No | Implementation hints from specs |
| context_refs | object | No | JIT references populated from scope-analysis.json |
| model | enum | No | Which model executes: opus, sonnet (default), haiku |
| subtasks | array | No | Decomposed subtasks for Haiku execution |

#### Model Selection Guidelines

| Task Complexity | Model | Examples |
|-----------------|-------|----------|
| **Complex** | opus | Architecture decisions, complex algorithms, refactoring |
| **Standard** | sonnet | Most implementation tasks (default) |
| **Simple** | haiku | Single-file changes, straightforward CRUD, config updates |

#### Subtask Decomposition for Haiku

When a task is too complex for Haiku, decompose into subtasks:

```json
{
  "id": "002",
  "title": "Create User model with validation",
  "model": "sonnet",
  "status": "pending",
  "subtasks": [
    {
      "id": "002a",
      "title": "Create User class with fields",
      "objective": "Define User class with id, email, password_hash fields",
      "acceptance_criteria": [
        {"id": "AC-003a", "criterion": "User class exists with required fields"}
      ],
      "test_file": "tests/models/user.test.ts",
      "status": "pending",
      "depends_on": ["001"],
      "model": "haiku"
    }
  ]
}
```

**Subtask Rules:**
- Subtask IDs use parent ID + letter suffix: "002a", "002b"
- Each subtask should be completable in ~5-10 minutes
- Subtasks can depend on each other or parent's dependencies
- Parent task completes when all subtasks complete

---

### 5. Validate Traceability

After creating tasks.json, verify coverage using traceability from scope-analysis.json:

```bash
cd "$WORKTREE_PATH"

# Check every AC from scope-analysis maps to at least one task
jq -r '.acceptance_criteria[].id' docs/scope-analysis.json | while read ac; do
  if ! jq -e ".tasks[] | select(.traces_to.acceptance_criteria | contains([\"$ac\"]))" docs/tasks.json > /dev/null 2>&1; then
    echo "COVERAGE_GAP: $ac has no implementing task"
  fi
done
```

### 6. Update State

After creating tasks.json, update state.json:

```bash
cd "$WORKTREE_PATH"

# Update state.json phase to "implementing"
jq '.phase = "implementing" | .tasks_file = "docs/tasks.json"' state.json > tmp.json && mv tmp.json state.json
```

### 7. Transition

1. **Commit tasks and state together:**
   ```bash
   TASK_COUNT=$(jq '.tasks | length' docs/tasks.json)
   SUBTASK_COUNT=$(jq '[.tasks[].subtasks // [] | length] | add' docs/tasks.json)

   git add docs/tasks.json state.json
   git commit -m "plan: create ${TASK_COUNT} tasks for implementation

   Tasks: ${TASK_COUNT} (${SUBTASK_COUNT} subtasks)
   Ready for implementation phase.

   Task list:
   $(jq -r '.tasks[] | "- \(.id): \(.title)"' docs/tasks.json)"
   ```

2. **Return signal — do NOT spawn the next phase:**

   ```json
   {
     "signal": "PLANNING_COMPLETE",
     "timestamp": "<ISO8601>",
     "source": { "skill": "homerun:task-decomposition" },
     "payload": {
       "tasks_count": N,
       "tasks_file": "docs/tasks.json",
       "dependency_graph_valid": true,
       "coverage": {
         "user_stories": N,
         "acceptance_criteria": N
       }
     },
     "envelope_version": "1.0.0"
   }
   ```

   **Do NOT spawn the next phase.** Return after emitting this signal.

---

## Output Structure

After task decomposition completes, the worktree should contain:

```
docs/
├── scope-analysis.json   # Input (from scope-analyzer)
├── specs/
│   ├── PRD.md
│   ├── ADR.md
│   ├── TECHNICAL_DESIGN.md
│   └── WIREFRAMES.md
└── tasks.json            # Output (from task-decomposer)
```

---

## Exit Criteria

Before transitioning to implementation, verify all criteria are met:

- [ ] `docs/scope-analysis.json` read and understood
- [ ] Dependency graph created showing task relationships
- [ ] Each task is single-commit sized
- [ ] Each task has test file specified (or valid exception documented)
- [ ] Acceptance criteria trace back to scope analysis
- [ ] context_refs populated from scope-analysis.json JIT refs
- [ ] tasks.json written with all required fields
- [ ] state.json updated with phase: "implementing" and tasks_file
- [ ] All files committed to the feature branch
- [ ] PLANNING_COMPLETE signal emitted
