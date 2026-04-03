# PRD: Homerun Hook-Based Quality Gates and Cost Controls

## Problem Statement

The homerun plugin's orchestrated workflow (discovery, spec-review, planning, implementing, completing) suffers from recurring quality failures that cascade across phases. Implementers skip tests and mark tasks complete, specs drift during implementation without detection, planning produces broken dependency graphs that cause deadlocks, and wrong models get assigned to tasks. These failures waste reviewer cycles, cause rework, and degrade the overall reliability of the workflow. Additionally, agents consume excessive tokens through verbose test output, unnecessary large file reads, and redundant operations, degrading context window quality for the agents that need it most.

## Goals

1. Eliminate quality failures that cascade between phases by enforcing deterministic, zero-token quality gates at every workflow boundary
2. Reduce wasted review cycles caused by incomplete implementations reaching the reviewer
3. Prevent spec drift during implementation by making specification documents immutable after planning completes
4. Reduce token waste from verbose outputs, unnecessary reads, and wrong model assignments

## Non-Goals

- Modifying agent definitions, skill files, signal contracts, state machine, model routing, templates, or commands
- Adding user-facing configuration for hooks -- all hooks are always-on, invisible infrastructure
- Replacing the existing quality-checker phase -- hooks complement it by catching issues earlier
- Implementing hooks as in-skill instructions -- all enforcement is via shell-script hooks with exit codes
- Adding new workflow phases or state transitions

## Success Metrics

| Metric | Current | Target | How Measured |
|--------|---------|--------|--------------|
| Tasks blocked at TaskCompleted for missing tests | 0% (no gate) | > 95% caught | Hook exit code 2 count in hooks-state.json |
| Spec documents modified during implementation | Untracked | 0 modifications | Spec freeze hook block count |
| DAG validation failures caught before execution | 0% (no gate) | 100% caught | DAG validation hook on planning complete |
| Token waste from test output | ~30% of context | < 10% of context | Test output compression hook byte reduction |
| Context budget warnings issued | 0 (no monitoring) | > 90% of overruns caught | Context budget hook warning count in hooks-state.json |
| Model routing violations logged | 0 (no gate) | All mismatches logged | H12 log count in hooks-state.json |

## User Stories

### US-001: Quality Gates Prevent Incomplete Implementations

**As a** developer using the homerun workflow
**I want** the system to automatically block task completion when quality criteria are not met
**So that** incomplete implementations never reach the reviewer, eliminating wasted review cycles

**Acceptance Criteria:**
- [ ] AC-001: When an implementer attempts to complete a task without corresponding test files, the system shall block completion with exit code 2 and output a message identifying the missing test files
- [ ] AC-002: When a commit message does not match the homerun format (task ID prefix, imperative mood), the system shall block the commit with a descriptive error message
- [ ] AC-003: When the planning phase produces a task DAG, the system shall validate the graph for cycles, orphaned tasks, and missing dependencies before allowing the phase to complete
- [ ] AC-004: When an implementer's output signal is missing required fields (task_id, files_changed, acceptance_criteria_met), the system shall block the signal with a validation error

### US-002: Spec Integrity is Maintained Throughout Execution

**As a** developer using the homerun workflow
**I want** specification documents to be immutable after planning completes
**So that** implementation stays aligned with the reviewed and approved specs

**Acceptance Criteria:**
- [ ] AC-005: While the workflow is in the implementing phase, the system shall block any Write or Edit operation targeting PRD.md, ADR.md, TECHNICAL_DESIGN.md, or WIREFRAMES.md
- [ ] AC-006: If a state transition is attempted that violates the allowed transition graph (e.g., jumping from discovery to implementing), then the system shall block the transition and output the valid transitions for the current phase
- [ ] AC-007: When a task is being implemented, the system shall verify that the task scope stays within its declared file boundaries from tasks.json

### US-003: Cost Controls Reduce Token Waste

**As a** developer using the homerun workflow
**I want** the system to automatically reduce token consumption from wasteful operations
**So that** agents have more context budget available for productive work

**Acceptance Criteria:**
- [ ] AC-008: When test runner output exceeds 50 lines, the system shall compress it to show only the summary (pass/fail counts, first 3 failures) and omit passing test details
- [ ] AC-009: When an agent attempts to read a file larger than 500 lines that is not in its task's declared file scope, the system shall warn the agent and suggest reading only the relevant section
- [ ] AC-010: While model routing is defined in model-routing.json, the system shall verify that task assignments match the expected model for their task type and log violations
- [ ] AC-011: While a workflow session is active, the system shall monitor cumulative context consumption and warn when usage exceeds 60% of the estimated context budget
- [ ] AC-016: While the workflow is in the implementing phase, the system shall block WebSearch and WebFetch tool usage, requiring implementers to work from specs and local codebase only

### US-004: Medium-Value Quality Improvements

**As a** developer using the homerun workflow
**I want** additional quality checks that catch subtle issues before they become problems
**So that** the overall output quality of homerun workflows improves incrementally

**Acceptance Criteria:**
- [ ] AC-012: When spec documents are generated, the system shall verify they conform to the expected template structure (required sections present, no empty sections)
- [ ] AC-013: When implementation code introduces imports from outside the declared dependency scope, the system shall warn about undeclared dependencies
- [ ] AC-014: When a task is completed, the system shall verify that every linked acceptance criterion has at least one corresponding test assertion
- [ ] AC-015: When the discovery phase completes, the system shall verify all five question categories were addressed and measurable success metrics exist

## User Flows

### Flow 1: Implementer Blocked by TDD Enforcement

```
1. Implementer completes code changes for a task
2. Implementer attempts to mark task as completed (TaskCompleted event)
3. TDD enforcement hook fires, checks for test files matching changed source files
4. Hook finds no test file for src/services/auth.ts
5. Hook exits with code 2, stderr: "BLOCKED: No test file found for src/services/auth.ts. Expected: tests/services/auth.test.ts"
6. Agent reads the error, creates the missing test file
7. Agent retries task completion
8. Hook passes (exit 0), task completes normally
```

### Flow 2: Spec Freeze Prevents Drift

```
1. Workflow is in implementing phase
2. Implementer attempts to Edit PRD.md to change an acceptance criterion
3. PreToolUse hook fires on Edit, checks file path against spec paths
4. Hook reads state.json phase, confirms phase is "implementing"
5. Hook exits with code 2, stderr: "BLOCKED: Spec documents are frozen during implementation. PRD.md cannot be modified in phase 'implementing'."
6. Agent abandons the edit and works within the existing spec
```

## Constraints

### Technical
- All hooks must be implementable as bash shell scripts using available Claude Code hook events
- Hooks receive context via stdin JSON and environment variables only
- Hook state must be stored separately from agent state (hooks-state.json)
- Hooks must work with both Agent Teams mode and conductor fallback mode

### Business
- Hooks must be invisible to users -- zero configuration, always-on
- Hooks must not break non-homerun Claude Code usage -- universal hooks work everywhere, phase-specific hooks exit 0 outside homerun context

## Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| Claude Code hook events (PreToolUse, PostToolUse, SubagentStop, TaskCompleted, WorktreeCreate) | External | Available | Core hook infrastructure provided by Claude Code |
| jq | External | Available | JSON parsing in shell scripts |
| state.json | Internal | Available | Workflow state for phase-specific hooks |
| tasks.json | Internal | Available | Task definitions for scope and coverage checks |
| Spec documents in ~/.claude/homerun/ | Internal | Available | Spec paths stored in state.json |

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Hook blocks agent in infinite retry loop | High | Medium | Hooks output actionable fix instructions; circuit breakers already exist in conductor |
| Hook incorrectly blocks legitimate action | Medium | Medium | Conservative checks -- only block on clear violations, warn on ambiguous cases |
| hooks-state.json concurrent write conflicts | Medium | Low | Hooks use atomic write patterns (write temp, rename) |
| Claude Code hook API changes | High | Low | Hooks use only documented, stable hook events |

## Open Questions

- None remaining -- all questions resolved during discovery dialogue
