# Technical Design: Homerun Hook-Based Quality Gates and Cost Controls

## Overview

This feature adds 19 deterministic shell-script hooks to the homerun plugin that enforce quality gates and cost controls across all workflow phases. Hooks intercept Claude Code tool calls and lifecycle events via the existing hook system (PreToolUse, PostToolUse, SubagentStop, TaskCompleted, WorktreeCreate), inspecting state and returning exit codes (0=pass, 2=block with actionable error). No agent definitions, skill files, or workflow state structures are modified. See ADR.md for why deterministic hooks were chosen over in-skill enforcement.

## Architecture

### System Context

```
Claude Code Runtime
  |
  |-- Hook Events (PreToolUse, PostToolUse, SubagentStop, TaskCompleted, etc.)
  |     |
  |     v
  | +--------------------------+
  | | Homerun Hook Scripts     |   19 bash scripts in scripts/
  | | (always-on, invisible)   |
  | +-------+------------------+
  |         |
  |         |-- reads --> state.json (read-only, workflow phase)
  |         |-- reads --> tasks.json (read-only, task definitions)
  |         |-- reads --> spec docs in ~/.claude/homerun/ (read-only)
  |         |-- reads/writes --> hooks-state.json (hook-private state)
  |         |
  |         |-- exit 0 --> action proceeds
  |         |-- exit 1 --> log error, action proceeds
  |         |-- exit 2 --> block action, stderr fed back to agent
  |
  |-- Agents (discovery, implementer, reviewer, etc.)
  |     |
  |     v
  |   state.json, tasks.json, source code
```

### Component Diagram

```
scripts/
  +-- lib/
  |     +-- homerun-hook-utils.sh     # Shared utilities (find state.json, parse stdin, atomic writes)
  |
  +-- P0: Quality Gates (blocking)
  |     +-- homerun-ac-coverage.sh          # H01: AC coverage check
  |     +-- homerun-tdd-enforcement.sh      # H02: TDD test file enforcement
  |     +-- homerun-dag-validation.sh       # H03: DAG cycle/orphan detection
  |     +-- homerun-spec-freeze.sh          # H04: Block spec edits during implementation
  |     +-- homerun-commit-format.sh        # H05: Commit message format validation
  |     +-- homerun-signal-validation.sh    # H06: Signal envelope field validation
  |     +-- homerun-state-transition.sh     # H07: State machine transition guard
  |     +-- homerun-task-scope.sh           # H08: Task file boundary enforcement
  |     +-- homerun-pre-review-checks.sh    # H09: Pre-review completeness checks
  |
  +-- P1: Cost Reduction (non-blocking, warn/compress)
  |     +-- homerun-test-output-compress.sh # H10: Compress verbose test output
  |     +-- homerun-large-file-intercept.sh # H11: Warn on large out-of-scope reads
  |     +-- homerun-model-routing-check.sh  # H12: Verify task-model assignment
  |     +-- homerun-context-budget.sh       # H13: Monitor context consumption
  |     +-- homerun-web-search-block.sh     # H14: Block web search during implementation (blocking)
  |
  +-- P2: Medium-Value Quality (non-blocking, warn)
  |     +-- homerun-spec-template-check.sh  # H15: Spec template conformance
  |     +-- homerun-import-guard.sh         # H16: Undeclared dependency warning
  |     +-- homerun-traceability-gap.sh     # H17: AC-to-test traceability check
  |     +-- homerun-test-assertion-quality.sh # H18: Test assertion quality check
  |     +-- homerun-discovery-completeness.sh # H19: Discovery category coverage check
```

## Hook Classification

Each hook is classified as either **universal** (fires regardless of homerun context) or **phase-specific** (requires state.json and exits 0 silently outside homerun workflows).

| # | Hook Name | Priority | Hook Event | Behavior | Context | Phase(s) |
|---|-----------|----------|------------|----------|---------|----------|
| H01 | AC Coverage | P0 | TaskCompleted | Block | Phase-specific | implementing |
| H02 | TDD Enforcement | P0 | TaskCompleted | Block | Phase-specific | implementing |
| H03 | DAG Validation | P0 | SubagentStop (planner) | Block | Phase-specific | planning |
| H04 | Spec Freeze | P0 | PreToolUse (Edit\|Write) | Block | Phase-specific | implementing |
| H05 | Commit Format | P0 | PreToolUse (Bash) | Block | Universal | all |
| H06 | Signal Validation | P0 | SubagentStop | Block | Phase-specific | all |
| H07 | State Transition | P0 | PostToolUse (Write) | Block | Phase-specific | all |
| H08 | Task Scope | P0 | PreToolUse (Edit\|Write) | Block | Phase-specific | implementing |
| H09 | Pre-Review Checks | P0 | SubagentStop (implementer) | Block | Phase-specific | implementing |
| H10 | Test Output Compress | P1 | PostToolUse (Bash) | Transform | Phase-specific | implementing |
| H11 | Large File Intercept | P1 | PreToolUse (Read) | Warn | Phase-specific | implementing |
| H12 | Model Routing Check | P1 | SubagentStop | Warn | Phase-specific | implementing |
| H13 | Context Budget | P1 | PostToolUse | Warn | Phase-specific | all |
| H14 | Web Search Block | P1 | PreToolUse (WebSearch) | Block | Phase-specific | implementing |
| H15 | Spec Template Check | P2 | SubagentStop (discovery) | Warn | Phase-specific | discovery |
| H16 | Import Guard | P2 | PostToolUse (Edit\|Write) | Warn | Universal | all |
| H17 | Traceability Gap | P2 | TaskCompleted | Warn | Phase-specific | implementing |
| H18 | Test Assertion Quality | P2 | PostToolUse (Edit\|Write) | Warn | Phase-specific | implementing |
| H19 | Discovery Completeness | P2 | SubagentStop (discovery) | Warn | Phase-specific | discovery |

## Data Models

### hooks-state.json

Stored in the worktree root alongside state.json. Only hooks read/write this file. Agents never touch it.

```json
{
  "version": "1.0.0",
  "session_id": "hooks-quality-gates-19adcf7a",
  "created_at": "2026-02-26T10:00:00Z",
  "updated_at": "2026-02-26T10:30:00Z",
  "hooks": {
    "H01_ac_coverage": {
      "invocations": 5,
      "blocks": 1,
      "last_invoked": "2026-02-26T10:25:00Z",
      "last_result": "pass"
    },
    "H02_tdd_enforcement": {
      "invocations": 5,
      "blocks": 2,
      "last_invoked": "2026-02-26T10:25:00Z",
      "last_result": "block",
      "last_message": "No test file for src/services/auth.ts"
    }
  },
  "context_budget": {
    "estimated_tokens_consumed": 85000,
    "warning_threshold": 120000,
    "warnings_issued": 1
  }
}
```

### Shared Utility Library: scripts/lib/homerun-hook-utils.sh

Common functions sourced by all hooks:

```bash
#!/bin/bash
# scripts/lib/homerun-hook-utils.sh
# Shared utilities for homerun hooks

# Find state.json by walking worktrees
find_state_json() {
  local dir="${CLAUDE_WORKTREE_PATH:-$(pwd)}"
  if [ -f "$dir/state.json" ]; then
    echo "$dir/state.json"
    return 0
  fi
  for wt in $(git -C "$dir" worktree list 2>/dev/null | awk '{print $1}'); do
    if [ -f "$wt/state.json" ]; then
      echo "$wt/state.json"
      return 0
    fi
  done
  return 1
}

# Get current workflow phase from state.json
get_phase() {
  local state_file="$1"
  jq -r '.phase // "unknown"' "$state_file"
}

# Get homerun docs directory from state.json
get_docs_dir() {
  local state_file="$1"
  jq -r '.homerun_docs_dir // ""' "$state_file"
}

# Get hooks-state.json path (sibling of state.json)
get_hooks_state() {
  local state_file="$1"
  echo "$(dirname "$state_file")/hooks-state.json"
}

# Read stdin JSON (cached -- call once per hook)
read_stdin_json() {
  if [ -z "$_STDIN_JSON" ]; then
    _STDIN_JSON=$(cat)
  fi
  echo "$_STDIN_JSON"
}

# Get tool name from stdin JSON
get_tool_name() {
  echo "$1" | jq -r '.tool_name // .tool // ""'
}

# Get file path from tool input
get_file_path() {
  echo "$1" | jq -r '.tool_input.file_path // .tool_input.path // ""'
}

# Atomic write to hooks-state.json (write to temp, then rename)
atomic_write_hooks_state() {
  local hooks_state_file="$1"
  local content="$2"
  local tmp_file="${hooks_state_file}.tmp.$$"
  echo "$content" > "$tmp_file"
  mv "$tmp_file" "$hooks_state_file"
}

# Initialize hooks-state.json if it does not exist
init_hooks_state() {
  local hooks_state_file="$1"
  local session_id="$2"
  if [ ! -f "$hooks_state_file" ]; then
    atomic_write_hooks_state "$hooks_state_file" "$(cat <<HEOF
{
  "version": "1.0.0",
  "session_id": "$session_id",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hooks": {},
  "context_budget": {
    "estimated_tokens_consumed": 0,
    "warning_threshold": 120000,
    "warnings_issued": 0
  }
}
HEOF
)"
  fi
}

# Log hook invocation to hooks-state.json
log_hook_invocation() {
  local hooks_state_file="$1"
  local hook_id="$2"
  local result="$3"  # "pass", "block", or "warn"
  local message="${4:-}"

  local now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local updated
  updated=$(jq --arg id "$hook_id" --arg result "$result" \
    --arg msg "$message" --arg now "$now" '
    .updated_at = $now |
    .hooks[$id] = (.hooks[$id] // {invocations: 0, blocks: 0}) |
    .hooks[$id].invocations += 1 |
    .hooks[$id].last_invoked = $now |
    .hooks[$id].last_result = $result |
    if $result == "block" then .hooks[$id].blocks += 1 else . end |
    if $msg != "" then .hooks[$id].last_message = $msg else . end
  ' "$hooks_state_file")

  atomic_write_hooks_state "$hooks_state_file" "$updated"
}

# Check if we are in a homerun context (state.json exists on create/ branch)
is_homerun_context() {
  local state_file
  state_file=$(find_state_json) || return 1
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  [[ "$branch" == create/* ]] && return 0
  return 1
}

# Output blocking error to stderr (agent sees this)
block_with_message() {
  echo "BLOCKED: $1" >&2
  exit 2
}

# Output warning to stderr (agent sees this as info)
warn_with_message() {
  echo "WARNING: $1" >&2
  exit 0
}
```

## Hook Specifications (All 19)

### P0: Quality Gates (Blocking)

#### H01: AC Coverage Check
- **Event:** TaskCompleted
- **Context:** Phase-specific (implementing)
- **Logic:** Read the current task from tasks.json via task ID. Extract linked acceptance criteria. For each criterion, grep the task's test files for a test description or assertion matching the criterion ID (e.g., "AC-001"). If any linked criterion has zero matching test assertions, block.
- **Error message:** "BLOCKED: Acceptance criteria not covered by tests: AC-003, AC-005. Add test assertions referencing these criteria in your test files."

#### H02: TDD Enforcement
- **Event:** TaskCompleted
- **Context:** Phase-specific (implementing)
- **Logic:** Read the list of source files changed by the task (from git diff or the implementation signal). For each source file (excluding test files, configs, types-only files per model-routing.json no_test_exceptions), verify a corresponding test file exists. Use naming convention: `src/foo/bar.ts` expects `tests/foo/bar.test.ts` or `src/foo/__tests__/bar.test.ts`.
- **Error message:** "BLOCKED: No test file found for src/services/auth.ts. Expected test at: tests/services/auth.test.ts or src/services/__tests__/auth.test.ts"

#### H03: DAG Validation
- **Event:** SubagentStop (matcher: planner)
- **Context:** Phase-specific (planning)
- **Logic:** Read tasks.json after planner completes. Build adjacency list from depends_on fields. Run cycle detection (DFS with coloring). Check for orphaned tasks (no dependents and not a leaf). Check for missing dependency references (depends_on ID that does not exist). If any issue found, block.
- **Error message:** "BLOCKED: Task DAG validation failed. Cycle detected: task-003 -> task-005 -> task-003. Fix dependency graph before proceeding."

#### H04: Spec Freeze
- **Event:** PreToolUse (matcher: Edit|Write)
- **Context:** Phase-specific (implementing, quality_check)
- **Logic:** Extract file_path from stdin JSON. Check if file_path matches any spec document path (PRD.md, ADR.md, TECHNICAL_DESIGN.md, WIREFRAMES.md) by comparing against spec_paths in state.json. If phase is implementing or later, block.
- **Error message:** "BLOCKED: Spec documents are frozen during implementation. PRD.md cannot be modified in phase 'implementing'. If specs need changes, escalate to the user."

#### H05: Commit Format
- **Event:** PreToolUse (matcher: Bash)
- **Context:** Universal
- **Logic:** Extract command from stdin JSON. If command contains `git commit`, extract the commit message. Verify it follows the pattern: `<type>(<scope>): <description>` or includes a task ID prefix (e.g., `[task-001]`). Check imperative mood (first word not past tense). If format invalid, block.
- **Error message:** "BLOCKED: Commit message format invalid. Expected: '<type>(<scope>): <description>' or '[task-ID] <description>'. Got: 'fixed the bug'. Use imperative mood: 'fix' not 'fixed'."

#### H06: Signal Validation
- **Event:** SubagentStop
- **Context:** Phase-specific (all phases)
- **Logic:** Read the agent's output. Parse for JSON signal envelopes. Validate required fields per signal-contracts.json: signal, timestamp, source.skill, payload. For IMPLEMENTATION_COMPLETE signals, verify payload contains files_changed, test_file, acceptance_criteria_met. If validation fails, block.
- **Error message:** "BLOCKED: Signal validation failed for IMPLEMENTATION_COMPLETE. Missing required field: payload.acceptance_criteria_met. Include which AC IDs were covered."

#### H07: State Transition Guard
- **Event:** PostToolUse (matcher: Write)
- **Context:** Phase-specific (all phases)
- **Logic:** If the written file is state.json, read the previous and new phase values. Validate against the allowed transition graph: discovery -> spec_review -> planning -> implementing -> completing. Block invalid transitions (e.g., discovery -> implementing).
- **Error message:** "BLOCKED: Invalid state transition from 'discovery' to 'implementing'. Allowed transitions from 'discovery': ['spec_review']. Follow the workflow phases in order."

#### H08: Task Scope Guard
- **Event:** PreToolUse (matcher: Edit|Write)
- **Context:** Phase-specific (implementing)
- **Logic:** Extract file_path from stdin JSON. Read the current task from state.json (current_task). Look up the task in tasks.json to get its declared file scope (files_to_modify, files_to_create). If the file being edited is not in the declared scope and is not a test file, block.
- **Error message:** "BLOCKED: File src/models/user.ts is outside the scope of task-003. Declared scope: [src/services/auth.ts, tests/services/auth.test.ts]. Stay within task boundaries or escalate if scope needs adjustment."

#### H09: Pre-Review Completeness
- **Event:** SubagentStop (matcher: implementer)
- **Context:** Phase-specific (implementing)
- **Logic:** Before an implementer's output reaches the reviewer, verify: (1) at least one commit was made, (2) test files exist for changed source files, (3) the implementation signal contains all required fields. If any check fails, block the implementer from completing.
- **Error message:** "BLOCKED: Pre-review checks failed. Issues: [No commits found for this task]. Fix these before submitting for review."

### P1: Cost Reduction (Non-blocking unless noted)

#### H10: Test Output Compression
- **Event:** PostToolUse (matcher: Bash)
- **Context:** Phase-specific (implementing)
- **Logic:** Inspect the tool output from a Bash command. If it looks like test runner output (contains patterns like "PASS", "FAIL", "Tests:", "test suites") and exceeds 50 lines, compress to: (1) total pass/fail counts, (2) first 3 failure details, (3) omit all passing test output. Return compressed output as the tool result.
- **Error message:** (not blocking -- transforms output) Appends: "[Compressed by homerun: 247 lines -> 12 lines. Full output in test logs.]"

#### H11: Large File Read Interception
- **Event:** PreToolUse (matcher: Read)
- **Context:** Phase-specific (implementing)
- **Logic:** Extract file_path from stdin JSON. Check file size with `wc -l`. If file exceeds 500 lines and is not in the current task's declared file scope, warn the agent to read only the relevant section.
- **Warning:** "WARNING: File src/legacy/bigmodule.ts is 1,247 lines and outside your task scope. Consider reading only the specific function you need (use offset/limit parameters)."

#### H12: Model Routing Enforcement
- **Event:** SubagentStop
- **Context:** Phase-specific (implementing)
- **Logic:** After a task completes, read the task type from tasks.json and the model used from the agent info. Compare against model-routing.json. If a haiku-level task was run on opus, or an opus-level task on haiku, log the mismatch.
- **Warning:** "WARNING: Task task-005 (type: add_field) was routed to sonnet but model-routing.json specifies haiku for this task type. Consider adjusting for cost efficiency."

#### H13: Context Budget Monitor
- **Event:** PostToolUse
- **Context:** Phase-specific (all phases)
- **Logic:** Estimate tokens from the tool output length (rough: characters / 4). Accumulate in hooks-state.json context_budget.estimated_tokens_consumed. If cumulative consumption exceeds warning_threshold (default 120K), issue a warning suggesting /compact.
- **Warning:** "WARNING: Estimated context consumption is ~125K tokens (62% of 200K window). Consider running /compact to free context space."

#### H14: Web Search Block
- **Event:** PreToolUse (matcher: WebSearch|WebFetch)
- **Context:** Phase-specific (implementing)
- **Logic:** During implementation phase, block web search/fetch tool usage. Implementers should work from specs and local codebase only.
- **Error message:** "BLOCKED: Web search is not permitted during the implementing phase. Implementation must be based on spec documents and existing codebase. If you need external information, escalate to the user."

### P2: Medium-Value Quality (Non-blocking)

#### H15: Spec Template Conformance
- **Event:** SubagentStop (matcher: discovery-agent)
- **Context:** Phase-specific (discovery)
- **Logic:** After discovery completes, read the generated spec documents. Verify each has the required sections per template: PRD (Problem Statement, Goals, Non-Goals, Success Metrics, User Stories), ADR (Context, Options, Decision, Consequences), TECHNICAL_DESIGN (Overview, Architecture, Data Models). Warn about missing or empty sections.
- **Warning:** "WARNING: PRD.md missing section 'Success Metrics'. Template requires measurable metrics with target values."

#### H16: Import Guard
- **Event:** PostToolUse (matcher: Edit|Write)
- **Context:** Universal
- **Logic:** After a file edit/write, scan the changed file for import/require statements. Compare imported modules against the project's declared dependencies (package.json dependencies, or tasks.json declared deps). Warn about imports from packages not in dependencies.
- **Warning:** "WARNING: File src/services/auth.ts imports 'jsonwebtoken' which is not listed in package.json dependencies. Add it to dependencies or verify it is a transitive dependency."

#### H17: Traceability Gap Detection
- **Event:** TaskCompleted
- **Context:** Phase-specific (implementing)
- **Logic:** Read the task's linked acceptance criteria from tasks.json. For each linked criterion, search the task's test files for a reference to the criterion ID (AC-NNN pattern). Report any criteria that have no corresponding test reference.
- **Warning:** "WARNING: Traceability gap detected. Task task-003 links to AC-005 but no test file references AC-005. Consider adding a test that explicitly verifies this criterion."

#### H18: Test Assertion Quality
- **Event:** PostToolUse (matcher: Edit|Write)
- **Context:** Phase-specific (implementing)
- **Logic:** When a test file is edited/written (matches `*.test.*` or `*.spec.*`), scan for assertion patterns. Warn if: (1) test has no assertions (empty test body), (2) only uses trivial assertions like `expect(true).toBe(true)`, (3) test file has fewer assertions than the task has acceptance criteria.
- **Warning:** "WARNING: Test file tests/services/auth.test.ts has 1 assertion but task links to 3 acceptance criteria. Consider adding more specific assertions."

#### H19: Discovery Completeness
- **Event:** SubagentStop (matcher: discovery-agent)
- **Context:** Phase-specific (discovery)
- **Logic:** Read state.json dialogue_state. Verify categories_covered includes all five required categories (purpose, users, scope, constraints, edge_cases). Verify the PRD contains at least one success metric with a numeric target.
- **Warning:** "WARNING: Discovery may be incomplete. Missing categories: ['edge_cases']. PRD has no measurable success metrics (expected numeric targets)."

## Hook Event to Settings Mapping

The `.claude/settings.json` configuration needed to wire all 19 hooks:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-spec-freeze.sh" },
          { "type": "command", "command": "./scripts/homerun-task-scope.sh" }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-commit-format.sh" }
        ]
      },
      {
        "matcher": "Read",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-large-file-intercept.sh" }
        ]
      },
      {
        "matcher": "WebSearch|WebFetch",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-web-search-block.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-import-guard.sh" },
          { "type": "command", "command": "./scripts/homerun-test-assertion-quality.sh" }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-state-transition.sh" }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-test-output-compress.sh" }
        ]
      },
      {
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-context-budget.sh" }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "planner",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-dag-validation.sh" }
        ]
      },
      {
        "matcher": "implementer",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-post-implement.sh" },
          { "type": "command", "command": "./scripts/homerun-pre-review-checks.sh" }
        ]
      },
      {
        "matcher": "discovery-agent",
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-spec-template-check.sh" },
          { "type": "command", "command": "./scripts/homerun-discovery-completeness.sh" }
        ]
      },
      {
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-signal-validation.sh" },
          { "type": "command", "command": "./scripts/homerun-model-routing-check.sh" }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-task-completed.sh" },
          { "type": "command", "command": "./scripts/homerun-ac-coverage.sh" },
          { "type": "command", "command": "./scripts/homerun-tdd-enforcement.sh" },
          { "type": "command", "command": "./scripts/homerun-traceability-gap.sh" }
        ]
      }
    ],
    "WorktreeCreate": [
      {
        "hooks": [
          { "type": "command", "command": "./scripts/homerun-worktree-setup.sh" }
        ]
      }
    ]
  }
}
```

## Dependencies

### Internal

| Dependency | Purpose | Path |
|------------|---------|------|
| state.json | Read workflow phase, session ID, spec paths | `<worktree>/state.json` |
| tasks.json | Read task definitions, acceptance criteria links, file scopes | `<worktree>/docs/tasks.json` |
| hooks-state.json | Read/write hook-private state | `<worktree>/hooks-state.json` |
| signal-contracts.json | Reference for signal field validation | `references/signal-contracts.json` |
| model-routing.json | Reference for task-type-to-model mapping | `references/model-routing.json` |
| Spec documents | Read-only access for template conformance checks | `~/.claude/homerun/<hash>/<slug>/` |
| Existing hook scripts | Unchanged, run alongside new hooks | `scripts/homerun-*.sh` |

### External

| Package | Version | Purpose |
|---------|---------|---------|
| jq | 1.6+ | JSON parsing in all hook scripts |
| bash | 4.0+ | Shell script execution |
| git | 2.0+ | Worktree detection, diff, branch detection |

## Non-Scope Declaration

The following are explicitly NOT being changed:

- `agents/*.md` -- No agent definition changes
- `skills/*/SKILL.md` -- No skill instruction changes
- `references/signal-contracts.json` -- No new signal types
- `references/state-machine.md` -- No new phases or transitions
- `references/model-routing.json` -- No routing changes (hook reads but does not modify)
- `templates/*.md` -- No template changes
- `commands/*.md` -- No command changes
- `scripts/homerun-worktree-setup.sh` -- Existing script unchanged
- `scripts/homerun-post-implement.sh` -- Existing script unchanged
- `scripts/homerun-task-completed.sh` -- Existing script unchanged
- `scripts/lib/tasks-bridge.js` -- Existing bridge unchanged

## Change Impact Map

### Direct Impact

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/homerun-hook-utils.sh` | Create | Shared hook utility library |
| `scripts/homerun-ac-coverage.sh` | Create | H01 hook script |
| `scripts/homerun-tdd-enforcement.sh` | Create | H02 hook script |
| `scripts/homerun-dag-validation.sh` | Create | H03 hook script |
| `scripts/homerun-spec-freeze.sh` | Create | H04 hook script |
| `scripts/homerun-commit-format.sh` | Create | H05 hook script |
| `scripts/homerun-signal-validation.sh` | Create | H06 hook script |
| `scripts/homerun-state-transition.sh` | Create | H07 hook script |
| `scripts/homerun-task-scope.sh` | Create | H08 hook script |
| `scripts/homerun-pre-review-checks.sh` | Create | H09 hook script |
| `scripts/homerun-test-output-compress.sh` | Create | H10 hook script |
| `scripts/homerun-large-file-intercept.sh` | Create | H11 hook script |
| `scripts/homerun-model-routing-check.sh` | Create | H12 hook script |
| `scripts/homerun-context-budget.sh` | Create | H13 hook script |
| `scripts/homerun-web-search-block.sh` | Create | H14 hook script |
| `scripts/homerun-spec-template-check.sh` | Create | H15 hook script |
| `scripts/homerun-import-guard.sh` | Create | H16 hook script |
| `scripts/homerun-traceability-gap.sh` | Create | H17 hook script |
| `scripts/homerun-test-assertion-quality.sh` | Create | H18 hook script |
| `scripts/homerun-discovery-completeness.sh` | Create | H19 hook script |
| `references/hooks-configuration.md` | Modify | Add documentation for all 19 new hooks |

### Indirect Impact

| File | Relationship | Verification |
|------|-------------|--------------|
| `state.json` | Hooks read phase, spec_paths, session_id | Verify hooks handle all phase values correctly |
| `tasks.json` | Hooks read task definitions | Verify hooks handle missing/empty tasks gracefully |
| `.claude/settings.json` | Must be updated to register all new hooks | Verify hook registration matches script names |

### No Ripple Effect

- All agent definitions and skills -- hooks operate at the Claude Code runtime level, not the agent instruction level
- Signal contracts -- hooks validate signals but do not produce new signal types
- Model routing -- hooks read the routing config but do not change it
- Templates -- hooks check conformance against templates but do not modify templates
- Commands -- hooks fire on hook events, not on commands
- The `/create`, `/plan`, `/build`, `/review`, `/diagnose` command flows remain unchanged

## Security Considerations

### File Access
- Hooks only read state.json, tasks.json, and spec documents -- they do not modify agent-managed files
- hooks-state.json uses atomic write patterns (write to temp file, then rename) to prevent corruption
- Hooks do not execute user-provided code -- they only inspect tool inputs/outputs

### Error Isolation
- A hook crash (exit 1) logs the error but does not block the action -- only exit 2 blocks
- Hooks have no network access requirements
- Hooks run in the same security context as the Claude Code process

## Error Handling

| Error Case | Response | Recovery |
|------------|----------|----------|
| state.json not found (non-homerun context) | Phase-specific hooks exit 0; universal hooks run normally | No recovery needed -- expected behavior |
| tasks.json not found | Hooks that need tasks.json exit 0 with warning | Tasks may not exist yet in early phases |
| jq not installed | Hooks exit 1 with error message | User must install jq |
| hooks-state.json write conflict | Atomic write pattern prevents corruption; worst case: lost one log entry | Retry on next invocation |
| Hook script has syntax error | Bash exits with code 1; action proceeds | Fix script; action was not blocked |
| Git not available | Hooks requiring git (commit format, worktree detection) exit 0 | Graceful degradation |

## Testing Strategy

### Unit Tests

Each hook script will have a corresponding test that validates its behavior with mock inputs.

| Component | Test File | Coverage Focus |
|-----------|-----------|----------------|
| homerun-hook-utils.sh | tests/hooks/test-hook-utils.sh | find_state_json, get_phase, atomic writes, is_homerun_context |
| homerun-ac-coverage.sh | tests/hooks/test-ac-coverage.sh | Block when AC not covered by tests, pass when all ACs covered |
| homerun-tdd-enforcement.sh | tests/hooks/test-tdd-enforcement.sh | Block when tests missing, pass when tests exist, skip for no_test_exceptions |
| homerun-dag-validation.sh | tests/hooks/test-dag-validation.sh | Detect cycles, orphans, missing deps, pass valid DAGs |
| homerun-spec-freeze.sh | tests/hooks/test-spec-freeze.sh | Block spec edits in implementing, allow in discovery/planning |
| homerun-commit-format.sh | tests/hooks/test-commit-format.sh | Block bad format, pass valid format, handle non-commit bash commands |
| homerun-signal-validation.sh | tests/hooks/test-signal-validation.sh | Block missing signal fields, pass valid signals, skip outside homerun |
| homerun-state-transition.sh | tests/hooks/test-state-transition.sh | Block invalid transitions, allow valid transitions, pass non-state.json writes |
| homerun-task-scope.sh | tests/hooks/test-task-scope.sh | Block out-of-scope edits, allow in-scope edits, allow test files |
| homerun-pre-review-checks.sh | tests/hooks/test-pre-review-checks.sh | Block when no commits, block when tests missing, pass when complete |
| homerun-test-output-compress.sh | tests/hooks/test-test-output-compress.sh | Compress >50 line output, pass short output, detect test runner patterns |
| homerun-large-file-intercept.sh | tests/hooks/test-large-file-intercept.sh | Warn on >500 line files, pass small files, pass in-scope large files |
| homerun-model-routing-check.sh | tests/hooks/test-model-routing-check.sh | Warn on model mismatch, pass correct routing |
| homerun-context-budget.sh | tests/hooks/test-context-budget.sh | Warn at threshold, accumulate tokens, initialize hooks-state.json |
| homerun-web-search-block.sh | tests/hooks/test-web-search-block.sh | Block during implementing, pass during other phases |
| homerun-spec-template-check.sh | tests/hooks/test-spec-template-check.sh | Warn on missing sections, pass complete specs |
| homerun-import-guard.sh | tests/hooks/test-import-guard.sh | Warn on undeclared imports, pass declared imports |
| homerun-traceability-gap.sh | tests/hooks/test-traceability-gap.sh | Warn on untraced ACs, pass fully traced tasks |
| homerun-test-assertion-quality.sh | tests/hooks/test-test-assertion-quality.sh | Warn on trivial assertions, pass meaningful assertions |
| homerun-discovery-completeness.sh | tests/hooks/test-discovery-completeness.sh | Warn on missing categories, pass complete discovery |

### Integration Tests

| Scenario | Test File | Setup Required |
|----------|-----------|----------------|
| Full workflow with all hooks enabled | tests/hooks/test-integration.sh | Mock state.json, tasks.json, and spec docs |
| Hook interaction (multiple hooks on same event) | tests/hooks/test-multi-hook.sh | Register multiple hooks on PostToolUse, verify all fire |
| Universal hooks outside homerun context | tests/hooks/test-universal-standalone.sh | No state.json, verify commit format still enforces |

## Open Questions

- None remaining -- all questions resolved during discovery dialogue
