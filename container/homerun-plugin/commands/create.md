---
name: create
description: "Start orchestrated development workflow from idea to implementation. Use when building new features, adding functionality, or implementing complete development tasks from scratch."
argument-hint: "<prompt> [--auto] [--resume] [--retries N,M]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, MultiEdit, Skill, Task
---

# /create Command

Start an orchestrated development workflow that takes you from idea to implementation through structured phases: discovery, planning, and execution.

## Usage

```
/create "description of what to build" [options]
```

## Arguments

- `prompt`: Description of what to build (required). Can be provided as:
  - First positional argument: `/create build a REST API for user management`
  - Quoted string: `/create "build a REST API with authentication"`

## Options

- `--auto`: Enable fully automated mode. Skips confirmation prompts between phases and proceeds automatically through discovery, planning, and execution.
- `--resume`: Resume an interrupted session. Finds the existing worktree and continues from where you left off.
- `--retries N,M`: Configure retry limits for phase failures.
  - `N`: Maximum retries using the same agent (default: 2)
  - `M`: Maximum retries spawning a fresh agent (default: 1)
  - Example: `--retries 3,2` allows 3 same-agent retries, then 2 fresh-agent retries

## Workflow

### Architecture: Flat State Machine

**Every phase runs at depth 1** — spawned directly by this command, never chained. This guarantees all agents have full tool access (including Task for spawning subagents). After each phase returns, read `state.json` and spawn the next phase.

```
/create (main session — loop controller)
  ├─ spawn discovery-agent      (depth 1) → returns
  ├─ spawn spec-reviewer        (depth 1) → returns
  ├─ spawn scope-analyzer       (depth 1) → returns  [sonnet — mechanical]
  ├─ spawn task-decomposer      (depth 1) → returns  [opus — judgment]
  ├─ bash: homerun-validate-dag.sh         → validates [zero LLM cost]
  ├─ invoke team-lead skill     (depth 0, dispatches implementers at depth 1)
  └─ invoke finishing skill     (depth 0) → done
```

**Agents do NOT chain to the next phase.** Each agent updates `state.json` with the next phase and returns. This command reads the phase and spawns the next agent. The team-lead runs inline as a skill (not a spawned agent) for reliable orchestration.

**Planning pipeline split:** The old single `planner` (opus, ~20 turns) is replaced by a 3-layer pipeline: scope-analyzer (sonnet, ~10 turns) handles mechanical extraction, task-decomposer (opus, ~8 turns) handles decomposition judgment, and validate-dag.sh handles structural validation at zero LLM cost.

### Resume Mode (--resume flag)

When resuming an interrupted session:

1. Find existing homerun worktrees and show their session info:
   ```bash
   # List all homerun worktrees with their phase and feature name
   for wt in $(git worktree list | grep 'create/' | awk '{print $1}'); do
     if [ -f "$wt/state.json" ]; then
       echo "$wt — $(jq -r '"\(.feature // "unknown") [\(.phase // "unknown")]"' "$wt/state.json")"
     fi
   done
   ```

2. If multiple worktrees exist, ask the user which session to resume

3. Read `state.json` from the selected worktree root

4. Jump into the **Phase Loop** below at the current phase

### New Session (no --resume)

1. **Announce the workflow:**
   ```
   Starting /create workflow for: [brief summary of the prompt]
   ```

2. **Parse and store configuration:**
   ```json
   {
     "auto_mode": false,
     "retries": {
       "same_agent": 1,
       "fresh_agent": 1
     }
   }
   ```
   - Set `auto_mode: true` if `--auto` flag is present
   - Parse `--retries N,M` to override default retry values

3. **Start the Phase Loop** beginning at "discovery"

### Phase Loop

Read the current phase from `state.json` (or start at "discovery" for new sessions). Spawn the appropriate agent, wait for it to return, then read `state.json` again and continue to the next phase. Repeat until complete.

```bash
PHASE=$(jq -r '.phase // "discovery"' "$WORKTREE_PATH/state.json" 2>/dev/null || echo "discovery")
```

#### Phase: discovery

```javascript
Task({
  description: "Gather requirements",
  subagent_type: "discovery-agent",
  prompt: `Start discovery for: ${userPrompt}

  Configuration: ${JSON.stringify(config)}
  Project root: ${projectRoot}`
});
```

After discovery returns, re-read `state.json`. Discovery sets `phase: "spec_review"`.

#### Phase: spec_review

**Auto-mode skip for non-large features:** If `auto_mode` is enabled and scale is not `"large"`, skip spec review entirely — update `state.json` phase to `"scope_analysis"` and continue the loop. In auto mode, the cost of a full spec review outweighs the risk for small/medium features.

```bash
SCALE=$(jq -r '.scale // .scale_details.estimated // "medium"' "$WORKTREE_PATH/state.json" 2>/dev/null)
AUTO_MODE=$(jq -r '.config.auto_mode // false' "$WORKTREE_PATH/state.json" 2>/dev/null)

if [ "$AUTO_MODE" = "true" ] && [ "$SCALE" != "large" ]; then
  echo "Skipping spec review (auto mode, scale=$SCALE)"
  jq '.phase = "scope_analysis"' "$WORKTREE_PATH/state.json" > tmp.json && mv tmp.json "$WORKTREE_PATH/state.json"
  # Continue phase loop — do not spawn spec-reviewer
fi
```

If not skipping, spawn the spec-reviewer:

```javascript
Task({
  description: "Review specification documents",
  subagent_type: "spec-reviewer",
  prompt: `Review specs for consistency, completeness, and testability.

  Worktree: ${worktree}
  Spec paths: ${JSON.stringify(state.spec_paths)}
  Auto mode: ${state.config.auto_mode}

  Emit SPEC_REVIEW_COMPLETE signal with verdict.`
});
```

**After spec-review returns**, check the verdict:
- If `verdict: "approved"`: update `state.json` phase to `"scope_analysis"` and continue
- If `verdict: "needs_revision"`: report issues to user and **stop** (user fixes specs, then runs `/create --resume`)

**Note:** The spec-reviewer is read-only (no Write tool), so this command handles the phase transition.

#### Phase: scope_analysis

**Scale-based skip:** Before spawning the scope-analyzer, check if the scale is "small":
```bash
SCALE=$(jq -r '.scale // .scale_details.estimated // "medium"' "$WORKTREE_PATH/state.json" 2>/dev/null)
```
If `SCALE` is `"small"`, skip the scope_analysis phase entirely — update `state.json` phase directly to `"task_decomposition"` and continue the loop. Small features don't need the intermediate scope-analysis.json artifact.

```javascript
Task({
  description: "Analyze scope from specs",
  subagent_type: "scope-analyzer",
  model: "sonnet",
  prompt: `Extract scope analysis from specification documents.

  Worktree: ${worktree}
  State file: ${worktree}/state.json

  Read state.json and spec documents, then create docs/scope-analysis.json with components, validated ACs, and JIT context refs.`
});
```

After scope-analyzer returns, re-read `state.json`. Scope analysis sets `phase: "task_decomposition"`.

#### Phase: task_decomposition

```javascript
Task({
  description: "Decompose into tasks",
  subagent_type: "task-decomposer",
  prompt: `Decompose scope analysis into implementation tasks.

  Worktree: ${worktree}
  State file: ${worktree}/state.json

  Read docs/scope-analysis.json and create docs/tasks.json with DAG.`
});
```

After task-decomposer returns, re-read `state.json`. Task decomposition sets `phase: "implementing"`.

**DAG Validation:** Before proceeding to implementation, run the validation script:

```bash
VALIDATE_RESULT=$(bash scripts/homerun-validate-dag.sh "${worktree}/docs/tasks.json" "${worktree}/docs/scope-analysis.json")
VALIDATE_EXIT=$?

if [ $VALIDATE_EXIT -eq 2 ]; then
  echo "DAG validation FAILED:"
  echo "$VALIDATE_RESULT" | jq '.errors[]'
  echo "Fix the issues and run /create --resume"
  # STOP — do not proceed to implementing
fi

if [ $VALIDATE_EXIT -eq 1 ]; then
  echo "DAG validation passed with warnings:"
  echo "$VALIDATE_RESULT" | jq '.warnings[]'
  # Continue to implementing
fi
```

If validation fails (exit code 2): report errors and **stop**. User fixes issues and runs `/create --resume`.
If validation passes (exit code 0 or 1): check mode before continuing.

**Plan-then-stop (default for interactive mode):**

If `auto_mode` is **not** enabled, print a task summary and stop — directing the user to start implementation explicitly:

```bash
AUTO_MODE=$(jq -r '.config.auto_mode // false' "$WORKTREE_PATH/state.json" 2>/dev/null)

if [ "$AUTO_MODE" != "true" ]; then
  TASK_COUNT=$(jq '.tasks | length' "$WORKTREE_PATH/docs/tasks.json")
  echo ""
  echo "Planning complete — $TASK_COUNT tasks ready for implementation:"
  jq -r '.tasks[] | "  \(.id): \(.title) [\(.task_type)] → \(.model // "sonnet")"' "$WORKTREE_PATH/docs/tasks.json"
  echo ""
  echo "To start implementation, run:"
  echo "  /build $WORKTREE_PATH"
  # STOP — do not proceed to implementing
fi
```

If `auto_mode` is enabled: continue to `implementing` as before.

#### Phase: implementing

```javascript
Skill({ skill: "homerun:team-lead" });
```

The team-lead skill runs inline — it reads tasks.json, dispatches implementers via Task(), tracks progress, and runs the quality gate. After completing, it sets `state.json` phase to `"completing"`.

#### Phase: completing

```javascript
Skill({ skill: "homerun:finishing-a-development-branch" });
```

Invoke the finishing skill in the current context to present merge/PR/continue options.

## Examples

### Basic usage
```
/create "build a CLI tool that converts markdown to HTML"
```

### Automated mode
```
/create "add user authentication to the API" --auto
```

### Custom retry configuration
```
/create "refactor the database layer" --retries 3,2
```

### Resume interrupted session
```
/create --resume
```

## Phase Flow

```
/create command
     │
     ▼
┌─────────────────┐
│   Discovery     │  ← Gather requirements, explore codebase
└─────────────────┘
     │
     ▼
┌─────────────────┐
│  Spec Review    │  ← Validate specs for consistency, completeness, testability
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Scope Analysis  │  ← [sonnet] Extract components, validate ACs, create JIT refs
└─────────────────┘
     │
     ▼
┌─────────────────┐
│Task Decomposition│ ← [opus] Decompose into tasks with DAG dependencies
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ DAG Validation  │  ← [bash] Cycle detection, coverage, field validation
└─────────────────┘
     │
     ▼
┌─────────────────┐
│   Execution     │  ← Team lead orchestrates parallel implementation
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Quality Check   │  ← Lint, types, structure, tests, recheck
└─────────────────┘
     │
     ▼
┌─────────────────┐
│   Complete      │  ← Merge, PR, keep, or discard
└─────────────────┘
```

Each phase can be retried on failure according to the retry configuration. The workflow state is persisted to `state.json` in the worktree, allowing recovery from interruptions.

## Related Commands

These commands allow jumping directly into specific phases:

- `/plan` — Skip to planning with existing specs
- `/build` — Skip to execution with existing tasks
- `/review` — Run spec review and/or quality checks
- `/diagnose` — Investigate a bug with the 3-phase evidence pipeline
- `/reverse-engineer` — Generate specs from an existing codebase
