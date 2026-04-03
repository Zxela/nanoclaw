# ADR: Deterministic Shell-Script Hooks for Quality Enforcement

## Status

Proposed

## Context

The homerun plugin (v4.0.0) orchestrates a multi-phase development workflow using 11 named subagents. Quality issues recur across phases: implementers skip tests, specs drift during implementation, planning produces broken DAGs, and wrong models get assigned. Currently, quality enforcement relies on two mechanisms: (1) agent instructions in skill files that agents may not follow, and (2) a quality-checker phase that runs after all implementation is complete, catching issues too late.

The existing hook infrastructure consists of 3 shell scripts using Claude Code hook events. Claude Code provides a deterministic hook system where shell scripts can intercept tool calls (PreToolUse, PostToolUse), agent lifecycle events (SubagentStop), task events (TaskCompleted), and worktree events (WorktreeCreate). Hooks return exit codes: 0 (pass), 1 (log error), 2 (block the action).

We need to decide how to enforce quality across the 19 identified quality and cost-control checkpoints.

## Decision Drivers

- Quality issues cascade across phases -- catching them late means rework
- Agent instructions are probabilistic -- agents can and do ignore them
- Hook enforcement is deterministic -- exit code 2 always blocks, regardless of agent behavior
- Zero-token cost -- shell script hooks consume no LLM tokens
- The 19 hooks span multiple hook events and two categories: phase-specific (require homerun context) and universal (useful everywhere)

## Considered Options

### Option 1: In-Skill Enforcement

**Description:** Embed quality checks directly into skill markdown files. Each skill would include explicit instructions like "Before completing a task, verify tests exist for all changed files."

**Pros:**
- No infrastructure changes needed
- Skills already contain behavioral instructions
- Flexible -- can express complex, context-dependent rules in natural language

**Cons:**
- Probabilistic -- agents may skip, misinterpret, or partially follow instructions
- Consumes LLM tokens for every check
- No audit trail -- cannot verify whether the check ran
- Cannot block actions deterministically -- agent could simply not check and proceed
- Requires updating 10+ skill files, violating non-scope

### Option 2: Deterministic Shell-Script Hooks (all 19)

**Description:** Implement all 19 quality and cost checks as bash shell scripts using Claude Code's hook system. Each hook reads stdin JSON, inspects state, and returns exit 0 (pass) or exit 2 (block with actionable error message).

**Pros:**
- Deterministic -- exit code 2 always blocks the action, regardless of agent behavior
- Zero LLM tokens consumed for enforcement
- Auditable -- hook invocations logged in hooks-state.json
- Clear separation of concerns -- hooks enforce, agents implement
- Agents self-correct by reading hook stderr messages
- Universal hooks work outside homerun context too

**Cons:**
- Shell scripts have limited expressiveness for complex logic
- Some checks (like "traceability gap detection") may be hard to express in bash
- Adds ~19 new shell scripts to maintain
- Hook scripts must handle concurrent execution safely

### Option 3: Hybrid (hooks for blocking, skills for advisory)

**Description:** Use hooks for checks that must block (exit 2) and skill instructions for advisory checks that only warn.

**Pros:**
- Best of both worlds -- deterministic blocking plus flexible advisory
- Fewer scripts to maintain for non-critical checks

**Cons:**
- Two enforcement mechanisms to understand and maintain
- Unclear boundary between "must block" and "should advise"
- Advisory checks still probabilistic -- may be ignored

## Decision

We chose **Option 2: Deterministic Shell-Script Hooks** because the primary driver is quality improvement through deterministic enforcement, not advisory guidance. The key insight is that quality gates must be guaranteed -- a gate that fires 90% of the time is not a gate. Shell scripts with exit code 2 provide this guarantee. The limited expressiveness of bash is mitigated by keeping each hook focused on a single, well-defined check. Complex checks like traceability gap detection are implementable through jq queries against structured JSON (tasks.json, state.json).

The decision to keep hooks separate from agent state (hooks-state.json) ensures clean separation of concerns and prevents hooks from accidentally corrupting workflow state.

## Consequences

### Positive

- Every quality gate fires deterministically on every relevant action
- Zero LLM tokens consumed for enforcement
- Agents self-correct by reading clear error messages from hook stderr
- Hook execution is auditable through hooks-state.json
- Universal hooks improve quality even outside homerun workflows
- No changes needed to agent definitions or skill files (preserves non-scope boundary)

### Negative

- 19 new shell scripts to maintain and test
- Shell script debugging is less ergonomic than debugging agent behavior
- Concurrent hook execution on shared hooks-state.json requires atomic write patterns
- Hooks cannot express nuanced, context-dependent checks as well as natural language instructions

### Neutral

- The existing 3 hook scripts remain unchanged and continue to work alongside the new hooks
- hooks-state.json introduces a new file in the worktree root, but is gitignored

## Kill Criteria

We would reverse this decision if:
- Claude Code changes its hook API in a way that breaks exit-code-2 blocking semantics
- More than 5 hooks prove too complex for bash and need to be implemented differently
- Hook execution latency exceeds 5 seconds per hook on average, causing noticeable workflow slowdowns
- The 19 hooks collectively require more maintenance than the quality issues they prevent

## Non-Goals / Out of Scope

- Modifying agent definitions or skill files to support hooks
- Adding per-project hook configuration or opt-in/opt-out toggles
- Replacing the existing quality-checker phase -- hooks are complementary, not a replacement
- Building a hook management UI or dashboard
