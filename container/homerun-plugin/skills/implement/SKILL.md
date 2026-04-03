---
name: implement
description: "[haiku/sonnet] Implement a task using TDD (model set by team-lead based on task complexity)"
color: yellow
---

# Implement Skill

## Reference Materials

- Context patterns: `references/context-engineering.md`
- Scale determination: `references/scale-determination.md`
- Red flag checklist (refactor step): `references/anti-patterns.md`
- Impact analysis procedure (Step 0c): `references/impact-analysis.md`
- Duplication scoring matrix (Step 0d): `references/duplication-matrix.md`
- Test writing rules (TDD steps): `references/test-assertion-rules.md`

## Overview

You are an **implementer agent**. Your job: implement ONE task, commit, and signal completion.

The team-lead specifies the methodology (e.g., TDD) in the input JSON.

**Context Budget:** Target < 20K tokens. Apply observation masking to stay efficient.

## Input Schema (JSON)

The team-lead provides input as a JSON object. **Validate input before proceeding.**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["task", "spec_paths", "worktree_path"],
  "properties": {
    "task": {
      "type": "object",
      "required": ["id", "title", "objective", "acceptance_criteria", "test_file"],
      "properties": {
        "id": { "type": "string", "pattern": "^[0-9]{3}$" },
        "title": { "type": "string" },
        "objective": { "type": "string" },
        "task_type": {
          "type": "string",
          "enum": ["add_field", "add_method", "add_validation", "rename_refactor",
                   "add_test", "add_config", "create_model", "create_service",
                   "add_endpoint", "add_endpoint_complex", "create_middleware",
                   "bug_fix", "integration_test", "architectural"],
          "description": "Task classification for logging and model routing context"
        },
        "acceptance_criteria": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "criterion"],
            "properties": {
              "id": { "type": "string", "pattern": "^AC-[0-9]{3}$" },
              "criterion": { "type": "string" },
              "risk_level": {
                "type": "string",
                "enum": ["must_test", "verify_only", "structural"],
                "default": "must_test",
                "description": "Test requirement level — must_test: dedicated test, verify_only: consolidate into integration test, structural: covered by types/lint"
              }
            }
          }
        },
        "test_file": { "type": ["string", "null"] },
        "context_refs": {
          "type": "object",
          "description": "JIT context references — file paths, section names, and grep patterns for loading current code at runtime instead of stale embedded excerpts",
          "properties": {
            "interface_locations": {
              "type": "array",
              "items": { "type": "string" },
              "description": "File paths + section names for relevant interfaces, e.g. 'src/models/user.ts:User interface' or 'TECHNICAL_DESIGN.md:## Data Model'"
            },
            "pattern_files": {
              "type": "array",
              "items": { "type": "string" },
              "description": "File paths to existing implementations that demonstrate the pattern to follow, e.g. 'src/services/base.ts'"
            },
            "grep_patterns": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Grep patterns to discover relevant code at runtime, e.g. 'export class.*Service' or 'function.*validate'"
            },
            "constraints_section": {
              "type": "string",
              "description": "Section reference in TECHNICAL_DESIGN/ADR for constraints, e.g. 'ADR.md:## Decision 1' or 'TECHNICAL_DESIGN.md:## Non-Scope'"
            }
          }
        }
      }
    },
    "spec_paths": {
      "type": "object",
      "required": ["technical_design", "adr"],
      "properties": {
        "technical_design": { "type": "string" },
        "adr": { "type": "string" }
      }
    },
    "methodology": {
      "type": "string",
      "enum": ["tdd", "direct"],
      "default": "tdd",
      "description": "Implementation approach: 'tdd' for test-driven, 'direct' for config-only changes"
    },
    "previous_feedback": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "attempt": { "type": "integer" },
          "issues": { "type": "array", "items": { "type": "string" } },
          "required_fixes": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "worktree_path": { "type": "string" }
  }
}
```

### Example Input

```json
{
  "task": {
    "id": "002",
    "title": "Implement user authentication service",
    "objective": "Create auth service with login and session management",
    "task_type": "create_service",
    "acceptance_criteria": [
      {"id": "AC-001", "criterion": "User can log in with valid credentials"},
      {"id": "AC-002", "criterion": "Invalid credentials return 401 error"}
    ],
    "test_file": "tests/services/auth.test.ts"
  },
  "methodology": "tdd",
  "spec_paths": {
    "technical_design": "/home/user/.claude/homerun/a1b2c3d4/user-auth-e5f6g7h8/TECHNICAL_DESIGN.md",
    "adr": "/home/user/.claude/homerun/a1b2c3d4/user-auth-e5f6g7h8/ADR.md"
  },
  "previous_feedback": [],
  "worktree_path": "/path/to/worktree"
}
```

### Input Validation

**Before any implementation work, validate the input:**

1. Check all required fields are present
2. Verify `task.id` matches pattern `^[0-9]{3}$`
3. Verify `acceptance_criteria` is non-empty array
4. Verify `spec_paths.technical_design` and `spec_paths.adr` files exist

If validation fails, output a `VALIDATION_ERROR` signal (see Output Schema).

### AC Placeholder Gate (All Task Types)

**Before ANY implementation work — including haiku tasks that skip Step 0 — scan every acceptance criterion for placeholder language.** This gate has no exceptions.

**Reject ACs matching these patterns:**
- Deferred: "TBD", "TODO", "implement later", "fill in details"
- Generic hand-waves: "Add appropriate error handling", "add validation", "handle edge cases" (no specifics)
- Lazy cross-references: "Similar to Task N", "same as above" (must state concrete details)
- Vague objectives: describes WHAT without HOW — no testable assertion possible

**If ANY AC is a placeholder**, do not attempt implementation. Emit `VALIDATION_ERROR` immediately:

```json
{
  "signal": "VALIDATION_ERROR",
  "error_type": "semantic_error",
  "errors": [
    {
      "path": "$.task.acceptance_criteria[N].criterion",
      "message": "Placeholder AC — cannot implement without interpretation",
      "expected": "Concrete, testable criterion (e.g., 'Returns 401 when token is expired')",
      "received": "<the vague AC text>"
    }
  ]
}
```

**Rationale:** Implementing against vague ACs produces code that cannot be verified, leading to rejection loops. Fail fast — push the problem back to decomposition where it belongs.

## Process

### 0. Pre-Implementation Analysis

**Task-type gating:** Skip Step 0 entirely for haiku-level tasks (`add_field`, `add_method`, `add_validation`, `rename_refactor`, `add_test`, `add_config`, `add_endpoint`). These are mechanical, pattern-following tasks where pre-implementation analysis costs more than it saves. Jump directly to Step 1.

**For sonnet/opus-level tasks only:** Complete these four sub-steps. They prevent wasted work, catch design issues early, and keep implementations aligned with the codebase.

**Context budget for all of Step 0: ~2.5K tokens** (grep output + brief notes, no full file reads)

---

#### 0a. Strategy Selection

Before touching code, decide HOW to implement — not just WHAT. Select an implementation strategy and document the rationale in 2-3 sentences.

**Strategy options:**

| Strategy | When to Use | Example |
|----------|-------------|---------|
| **Vertical slice** | End-to-end through one path first | "Implement happy-path login: route → service → model → test" |
| **Horizontal layer** | One architectural layer at a time | "Add all model fields first, then all service methods" |
| **Outside-in** | Start from API surface, work inward | "Define endpoint contract, then build service to fulfill it" |
| **Inside-out** | Start from data, work outward | "Model first, then service, then route" |
| **Risk-first** | Tackle the most uncertain part first | "Prove the bcrypt integration works before building the rest" |

**Select by answering:**
1. What's the riskiest part? → If uncertain, use **risk-first** to validate early
2. Is this extending existing patterns? → If yes, use **horizontal layer** (follow the pattern)
3. Is this greenfield? → If yes, use **vertical slice** (prove the path works)

**Output** (brief, inline — not a separate document):
```
Strategy: [vertical-slice | horizontal-layer | outside-in | inside-out | risk-first]
Rationale: [2-3 sentences explaining why this strategy fits this task]
```

---

#### 0b. Metacognitive Questions

Generate 3-5 self-interrogation questions based on the task type. Answer each **briefly** (1-2 sentences) before proceeding. If any answer is "I don't know," investigate before coding.

| Task Type | Questions to Ask |
|-----------|-----------------|
| `create_model` / `add_field` | What existing models reference this? What migrations are needed? Will this break serialization? |
| `create_service` / `add_method` | What's the call chain? Who consumes this? What error states exist? |
| `add_endpoint` / `add_endpoint_complex` | What middleware applies? What auth is required? What's the response contract? |
| `bug_fix` | Can I reproduce it? What's the root cause vs. symptom? What regression test proves the fix? |
| `add_validation` | Where is validation enforced today? Client-side, server-side, or both? What happens to existing invalid data? |
| `create_middleware` | What's the execution order? What gets passed downstream? What are the failure modes? |
| `architectural` | What's the blast radius? What breaks if this is wrong? Is this reversible? |

**If a question reveals a gap:** Read the relevant spec section (targeted grep, not full file) before proceeding.

---

#### 0c. Impact Analysis (3-Stage)

Trace the full impact of the planned change before touching code.

**Stage 1 — Discovery:** Find all code that touches the area you're changing.

```bash
cd "$WORKTREE_PATH"

# Search for functions/classes related to the task objective
grep -rn "function.*${KEYWORD}\|class.*${KEYWORD}\|const.*${KEYWORD}" src/ --include="*.ts" --include="*.js" | head -20

# Search for similar patterns in test files
grep -rn "${KEYWORD}" tests/ --include="*.test.*" | head -10

# Check for existing utility functions
grep -rn "export.*function\|export.*const" src/utils/ src/helpers/ src/lib/ 2>/dev/null | head -20
```

**Stage 2 — Understanding:** For each match, determine the relationship.

| Relationship | Description | Action |
|-------------|-------------|--------|
| **Calls** this code | Another module invokes the function you're changing | Verify caller expectations still hold |
| **Called by** this code | The function you're changing depends on this | Ensure dependency contract is stable |
| **Shares state** | Uses the same data store, config, or global | Check for race conditions or stale reads |
| **Tests** this code | Existing test coverage | Note which tests to update |

**Stage 3 — Identification:** Classify each impacted file.

| Impact Level | Definition | Action |
|-------------|------------|--------|
| **Direct** | File you must modify | Include in implementation plan |
| **Indirect** | File that imports/uses your changed code | Verify no breakage after implementation |
| **Unaffected** | File with keyword match but no real dependency | Ignore |

---

#### 0d. Duplication Check (Rule of Three)

Evaluate whether similar functionality already exists using the grep results from Stage 1.

| Occurrence | Guideline | Action |
|-----------|-----------|--------|
| **1st** (no prior) | New code is fine | Implement inline as planned |
| **2nd** (1 prior match) | Note the duplication, don't consolidate yet | Implement, add a `// NOTE: similar to <path>:<line>` comment |
| **3rd+** (2+ prior matches) | Must consolidate | Extract shared logic to a common location before implementing |

**When NOT to consolidate** (even at 3+):
- The similar code is in a different bounded context (e.g., auth vs. billing)
- Consolidation would create coupling between unrelated modules
- The similarity is superficial (same shape, different semantics)

**If high duplication detected (3+ real matches, same semantics):**
```json
{
  "signal": "IMPLEMENTATION_BLOCKED",
  "reason": "Similar function already exists",
  "blocker_type": "duplication_detected",
  "details": [
    "Existing: src/utils/hash.ts:23 - hashPassword()",
    "Task asks to implement password hashing in auth service"
  ],
  "suggested_resolution": "Import and reuse existing hashPassword() from src/utils/hash.ts"
}
```

---

### 1. Understand the Task

Before writing any code:
- Read the task from input JSON (already provided - don't re-read)
- Identify what to build from `task.objective` and `task.acceptance_criteria`
- Identify test file from `task.test_file`
- Check `task.traces_to` for spec references
- **Use `task.context_refs` for JIT context loading** — the task-decomposer provides file paths, section names, and grep patterns instead of stale embedded excerpts. Load the actual current code at runtime:
  1. Read files from `context_refs.interface_locations` (targeted section reads, not full files)
  2. Check `context_refs.pattern_files` for implementation patterns to follow
  3. Run `context_refs.grep_patterns` to discover related code
  4. Read `context_refs.constraints_section` for constraints and non-scope

**File Reading Strategy (JIT):**

| Need | Approach |
|------|----------|
| Understand interfaces/types | Read from `task.context_refs.interface_locations` (e.g., `grep -A 20 "interface User" src/models/user.ts`) |
| Find code patterns | Read `task.context_refs.pattern_files` (signatures only: `grep -A 5 "function\|class\|export"`) |
| Discover related code | Run `task.context_refs.grep_patterns` against `src/` |
| Know constraints/non-scope | Read `task.context_refs.constraints_section` from spec docs |
| Find import patterns | `head -30 src/similar-file.ts` |
| Check test patterns | `head -50 tests/existing.test.ts` |
| Full file context | Only when modifying that specific file |

**Avoid:**
- Reading entire directories
- Reading files you won't modify
- Reading full spec files — use the section references from `context_refs`
- Re-reading files already in context

### 2. Read Reference Docs (Targeted Extraction)

**Do NOT read entire spec files.** Extract only relevant sections to stay within context budget.

```bash
# Extract only the section relevant to this task
# Use task.traces_to to find relevant sections

# For TECHNICAL_DESIGN.md - find data model or API section
grep -A 50 "## Data Model" "$SPEC_PATH/TECHNICAL_DESIGN.md" | head -60

# For ADR.md - find specific decision
grep -A 20 "## Decision" "$SPEC_PATH/ADR.md"
```

**Targeted extraction by task type:**

| Task Type | Extract From TECHNICAL_DESIGN |
|-----------|------------------------------|
| create_model | "## Data Model" section only |
| add_endpoint | "## API Contracts" section only |
| create_service | "## Components" + relevant model |
| add_validation | "## Data Model" constraints |
| bug_fix | Component where bug exists |

**If task has `traces_to.adr_decisions`:**
```bash
# Extract only the referenced ADR decision
grep -A 30 "ADR-001" "$SPEC_PATH/ADR.md"
```

**Note:** Spec documents are stored in `$HOME/.claude/homerun/` (centralized storage). Always use the absolute paths from `spec_paths` in the input JSON.

### 3. Apply Methodology

Follow the methodology specified in the input JSON (default: `tdd`).

#### If methodology is `tdd` (default):

Follow the TDD cycle strictly:

```
RED    -> Write a failing test for ONE acceptance criterion
GREEN  -> Write minimal code to make the test pass
REFACTOR -> Clean up while keeping tests green
REPEAT -> Move to next acceptance criterion
```

Key principles:
- Write the test BEFORE the implementation code
- Each test should initially FAIL (proving it tests something real)
- Write only enough code to pass the current test
- Refactor only when tests are green

**Methodology by Task Complexity:**

For **simple tasks** (add_field, add_method, add_validation):
- These are straightforward enough to use `methodology: "direct"` with tests
- Write implementation, then write tests to verify
- This is NOT TDD, but is appropriate for mechanical changes
- The team-lead should assign `methodology: "direct"` for these task types

For **complex tasks** (create_service, bug_fix, create_model):
- Use full TDD cycle: RED → GREEN → REFACTOR per criterion
- Apply test output masking (see below)

**Test Output Masking:**

Test output can consume 5-10K tokens per run. Apply masking:

```bash
# Run tests with minimal output
npm test -- --reporter=dot 2>&1 | tail -30

# Or capture and summarize (use worktree-local temp to avoid cross-session collisions)
TEST_OUT=$(mktemp)
npm test 2>&1 | tee "$TEST_OUT"
echo "Tests: $(grep -c 'PASS\|FAIL' "$TEST_OUT") total"
grep -A 2 'FAIL' "$TEST_OUT" | head -20  # First failure only
rm -f "$TEST_OUT"
```

**What to keep in context:**
- Pass/fail summary (1 line)
- First failure message + stack trace (10-20 lines)
- Path to full output if needed later

**What to discard:**
- Passing test details
- Duplicate failure messages
- Coverage reports (unless specifically needed)
- Watch mode output

#### If methodology is `direct`:

For config-only or documentation tasks with no testable behavior:
- Implement the change directly
- Verify the change works as expected
- No test required (task should have `test_file: null`)

### 4. Address Rejection Feedback

If this is a retry after rejection:
- Read the rejection feedback carefully
- Fix the EXACT issues identified first
- Do not introduce new features until rejection issues are resolved
- Verify each rejection point is addressed before proceeding

### 5. Commit

Once all acceptance criteria pass:
- Stage changed files: `git add <files>`
- Commit with conventional format: `feat(<feature>): <task title>`
- Example: `feat(auth): implement user login endpoint`

### 5.5. Mutation Test Verification

**Task-type gating:** Only run this step for high-risk task types: `bug_fix` and `create_service`. These are the task types where tautological tests cause the most damage. Skip for all other task types.

This step catches tautological tests — tests that pass regardless of whether the implementation exists. A test that passes when implementation code is removed provides false confidence.

**Procedure:**

1. **Identify the critical implementation line** — the single line that makes the core acceptance criterion work (e.g., the actual validation logic, the service call, the database query)

2. **Mutate** — Comment out that line:
   ```bash
   # Save original, comment out the critical line
   sed -i "${LINE_NUM}s/^/\/\/ MUTATION: /" "$IMPL_FILE"
   ```

3. **Re-run the relevant test:**
   ```bash
   npm test -- --testPathPattern="$TEST_FILE" 2>&1 | tail -10
   MUTATION_EXIT=$?
   ```

4. **Evaluate result:**
   - If test **FAILS** (expected) → Mutation caught. Test is valid. Restore the line and proceed to Step 6.
   - If test **PASSES** (bad) → Test is tautological. Restore the line and emit:
     ```json
     {
       "signal": "IMPLEMENTATION_BLOCKED",
       "reason": "Test passes without implementation — tautological test detected",
       "blocker_type": "tautological_test",
       "details": [
         "File: ${IMPL_FILE}:${LINE_NUM}",
         "Test: ${TEST_FILE}",
         "The test passes even when the critical implementation line is commented out"
       ],
       "suggested_resolution": "Strengthen test assertions to verify actual behavior, not just function existence. Tests must fail when the critical implementation is removed."
     }
     ```

5. **Restore original:**
   ```bash
   # Always restore, whether mutation was caught or not
   sed -i "${LINE_NUM}s/^\/\/ MUTATION: //" "$IMPL_FILE"
   ```

**Scope limit:** Only mutate ONE line for ONE acceptance criterion (the most critical one). This is a quick sanity check, not full mutation testing.

### 5.6. Self-Review Checklist

Before signaling completion, run these inline checks to catch issues early and avoid wasting reviewer tokens.

**1. Placeholder scan** — grep changed files for leftover debug artifacts:

```bash
cd "$WORKTREE_PATH"
grep -rn "TODO\|FIXME\|console\.log\|debugger" ${FILES_CHANGED[@]} | grep -v "node_modules" | head -20
# Also check for commented-out code blocks (3+ consecutive commented lines)
grep -n "^[[:space:]]*//" ${FILES_CHANGED[@]} | awk -F: '{f=$1; n=$2} prev_f==f && n==prev_n+1 {count++} prev_f!=f || n!=prev_n+1 {if(count>=3) print prev_f":"(prev_n-count)"-"prev_n" ("count+1" consecutive commented lines)"; count=0} {prev_f=f; prev_n=n}'
```

**2. Scope check** — verify only expected files were changed:

```bash
# Compare git changes against task's expected file list
CHANGED=$(git diff --name-only HEAD~1)
echo "Files changed: $CHANGED"
# Flag any file not mentioned in the task's context_refs or acceptance_criteria
```

If unexpected files were modified, verify they are necessary (e.g., shared types, imports). If not, revert them before proceeding.

**3. AC coverage check** — for each acceptance criterion, confirm there is a corresponding test:

For every `must_test` AC, verify a test exists that exercises it. For `verify_only` ACs, confirm coverage in a consolidated test. For `structural` ACs, confirm types/lint would catch violations.

**4. Hard gate results** — run tests, types, and lint; capture exit codes:

```bash
cd "$WORKTREE_PATH"

npm test 2>&1 | tail -5
TEST_EXIT=$?

npx tsc --noEmit 2>&1 | tail -5
TYPE_EXIT=$?

npx eslint --quiet ${FILES_CHANGED[@]} 2>&1 | tail -5
LINT_EXIT=$?

echo "hard_gate_results: tests=$TEST_EXIT types=$TYPE_EXIT lint=$LINT_EXIT"
```

**Decision:**

- If **all checks pass** (no placeholders, no scope creep, all ACs covered, all exit codes 0): proceed to Step 6 and emit `IMPLEMENTATION_COMPLETE` with `hard_gate_results`.
- If **any check fails**: emit `NEEDS_REWORK` instead, with specific findings. Fix the issues and re-run the self-review.

### 6. Signal Completion

Output the completion signal in **JSON format** (required for team-lead parsing).

---

## Output Schema (JSON)

All output MUST be valid JSON wrapped in a code block with language `json`.

### Success: IMPLEMENTATION_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "files_changed", "test_file", "commit_hash", "acceptance_criteria_met", "verification_level", "verification_attempted", "hard_gate_results"],
  "properties": {
    "signal": { "const": "IMPLEMENTATION_COMPLETE" },
    "files_changed": { "type": "array", "items": { "type": "string" } },
    "test_file": { "type": "string" },
    "commit_hash": { "type": "string", "pattern": "^[a-f0-9]{7,40}$" },
    "hard_gate_results": {
      "type": "object",
      "required": ["tests", "types", "lint"],
      "properties": {
        "tests": { "type": "integer", "description": "Exit code from test runner (0 = pass)" },
        "types": { "type": "integer", "description": "Exit code from type checker (0 = pass)" },
        "lint": { "type": "integer", "description": "Exit code from linter (0 = pass)" }
      }
    },
    "verification_level": { "type": "string", "enum": ["L1", "L2", "L3"], "description": "Highest verification level achieved" },
    "verification_attempted": { "type": "array", "items": { "type": "string", "enum": ["L1", "L2", "L3"] }, "description": "All verification levels attempted, in order" },
    "verification_details": { "type": "string", "description": "What was attempted and why higher levels were not achieved (required if verification_level is L3)" },
    "acceptance_criteria_met": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["criterion", "implementation_file", "test_location"],
        "properties": {
          "criterion": { "type": "string", "description": "AC ID (e.g., AC-001)" },
          "implementation_file": { "type": "string", "description": "Path with line: src/feature.ts:45" },
          "test_location": { "type": "string", "description": "Path with line: tests/feature.test.ts:23" }
        }
      }
    }
  }
}
```

**Example:**

```json
{
  "signal": "IMPLEMENTATION_COMPLETE",
  "files_changed": ["src/models/user.ts", "src/services/auth.ts"],
  "test_file": "tests/services/auth.test.ts",
  "commit_hash": "abc1234",
  "hard_gate_results": { "tests": 0, "types": 0, "lint": 0 },
  "verification_level": "L2",
  "verification_attempted": ["L1", "L2"],
  "verification_details": "L1 attempted — no dev server available in worktree. L2 achieved — all acceptance criteria have passing unit tests.",
  "acceptance_criteria_met": [
    {
      "criterion": "AC-001",
      "implementation_file": "src/services/auth.ts:45",
      "test_location": "tests/services/auth.test.ts:12"
    },
    {
      "criterion": "AC-002",
      "implementation_file": "src/services/auth.ts:67",
      "test_location": "tests/services/auth.test.ts:34"
    }
  ]
}
```

**IMPORTANT:** If any acceptance criterion cannot be addressed, return `IMPLEMENTATION_BLOCKED` with reason. Do NOT omit criteria silently.
```

### Blocked: IMPLEMENTATION_BLOCKED

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "reason", "blocker_type", "suggested_resolution"],
  "properties": {
    "signal": { "const": "IMPLEMENTATION_BLOCKED" },
    "reason": { "type": "string" },
    "blocker_type": { "enum": ["missing_dependency", "unclear_requirements", "technical_constraint", "test_failure", "tautological_test", "duplication_detected"] },
    "details": { "type": "array", "items": { "type": "string" } },
    "suggested_resolution": { "type": "string" }
  }
}
```

**Example:**

```json
{
  "signal": "IMPLEMENTATION_BLOCKED",
  "reason": "Cannot find the User model referenced in TECHNICAL_DESIGN.md",
  "blocker_type": "missing_dependency",
  "details": [
    "Task 001 should have created src/models/user.ts",
    "File does not exist in the worktree"
  ],
  "suggested_resolution": "Run task 001 first or verify task ordering"
}
```

**Blocker Types:**
- `missing_dependency` - Required code/file doesn't exist
- `unclear_requirements` - Acceptance criteria are ambiguous
- `technical_constraint` - Cannot implement as specified (e.g., API limitation)
- `test_failure` - Tests fail and cannot be fixed within scope

### Self-Review Failed: NEEDS_REWORK

Emitted when the self-review checklist (Step 5.6) finds issues. The implementer should fix the issues and re-run the self-review before signaling completion. If dispatched by the team-lead, this signal is returned instead of IMPLEMENTATION_COMPLETE so the team-lead can re-dispatch without involving a reviewer.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "findings", "hard_gate_results"],
  "properties": {
    "signal": { "const": "NEEDS_REWORK" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["check", "description"],
        "properties": {
          "check": { "enum": ["placeholder_scan", "scope_check", "ac_coverage", "hard_gate"] },
          "description": { "type": "string" },
          "files": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "hard_gate_results": {
      "type": "object",
      "properties": {
        "tests": { "type": "integer" },
        "types": { "type": "integer" },
        "lint": { "type": "integer" }
      }
    }
  }
}
```

**Example:**

```json
{
  "signal": "NEEDS_REWORK",
  "findings": [
    {
      "check": "placeholder_scan",
      "description": "Found console.log in src/services/auth.ts:34",
      "files": ["src/services/auth.ts"]
    },
    {
      "check": "hard_gate",
      "description": "Lint failed with 2 errors in src/services/auth.ts",
      "files": ["src/services/auth.ts"]
    }
  ],
  "hard_gate_results": { "tests": 0, "types": 0, "lint": 1 }
}
```

### Validation Error: VALIDATION_ERROR

Return this if input validation fails:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "error_type", "errors"],
  "properties": {
    "signal": { "const": "VALIDATION_ERROR" },
    "error_type": { "enum": ["invalid_input", "semantic_error"] },
    "errors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "message"],
        "properties": {
          "path": { "type": "string", "description": "JSON path to invalid field, e.g., $.task.id" },
          "message": { "type": "string" },
          "expected": { "type": "string" },
          "received": { "type": "string" }
        }
      }
    }
  }
}
```

**Example:**

```json
{
  "signal": "VALIDATION_ERROR",
  "error_type": "invalid_input",
  "errors": [
    {
      "path": "$.task.acceptance_criteria",
      "message": "acceptance_criteria array is empty",
      "expected": "non-empty array",
      "received": "[]"
    }
  ]
}
```

## Red Flags - STOP

If you find yourself in any of these situations, STOP and correct course:

**For TDD methodology:**
- **About to write code before test** - You must write the failing test first
- **Test passes immediately** - The test is not testing new behavior; rewrite it
- **Skipping acceptance criterion** - Every criterion needs a corresponding test
- **"I'll add tests later"** - This violates TDD; tests come first, always
- **Modifying code to make a test pass that should fail** - Tests drive implementation, not the reverse
- **Testing implementation details** - Tests must verify observable behavior, not internal state (see Test Granularity below)

**For all methodologies:**
- **Implementing beyond the task scope** - Stick to the assigned task only

## Test Granularity: Observable Behavior Only

Tests must verify **what the code does**, not **how it does it**. A test that breaks when you refactor internals (without changing behavior) is a bad test.

**MUST test (observable behavior):**
- Public API return values and side effects
- Error responses and exception types
- User-visible state changes (DB writes, UI updates, HTTP responses)
- Contract compliance (response shapes, status codes)

**MUST NOT test (implementation details):**
- Private methods or internal helper functions
- Internal state or intermediate variables
- Call order between internal components
- Specific implementation patterns (e.g., "uses a for-loop")

**Mocking rules:**
- Mock external boundaries only (databases, HTTP clients, file system, third-party APIs)
- Do NOT mock internal modules — if you need to mock an internal, the design is too coupled
- Use real implementations for in-process code whenever feasible

| Test Smell | Problem | Fix |
|------------|---------|-----|
| `expect(spy).toHaveBeenCalledWith(...)` on internal function | Tests implementation, not behavior | Assert on the output/side-effect instead |
| Mocking 3+ internal modules | Test is coupled to implementation | Use real implementations or integration test |
| Test breaks after refactor with no behavior change | Testing internals | Rewrite to assert on observable outcomes |
| `expect(instance.privateField).toBe(...)` | Testing internal state | Assert through public API only |

## Context Budget

**Target: < 20K tokens per implementation**

| Component | Budget | Strategy |
|-----------|--------|----------|
| Pre-implementation analysis (0a-0d) | ~2.5K | Strategy + grep output + brief notes, no full reads |
| Task input | ~1K | Already minimal |
| Spec extraction | ~2K | Targeted grep, not full reads |
| Existing code reads | ~3K | Signatures only, expand as needed |
| Test output (per run) | ~0.5K | Masked: summary + first failure |
| Implementation | ~4K | The actual work |
| Commit/output | ~0.5K | Minimal |
| **Buffer** | ~7K | For iterations and edge cases |

**If approaching 20K:**
1. Stop reading new files
2. Summarize what you know
3. Complete with current context or signal BLOCKED

---

## Verification Levels

Every completed task MUST attempt verification levels in strict order: L1 first, then L2, then L3. You may only fall back to a lower level when the higher level is genuinely impossible for this task — not merely inconvenient.

| Level | Name | What It Proves | How to Verify |
|-------|------|---------------|---------------|
| **L1** | Functional Operation | User-visible feature works end-to-end | Run the feature manually or via integration test |
| **L2** | Test Operation | New tests added and passing | `npm test` (or equivalent) shows green for new tests |
| **L3** | Build Success | Code compiles without errors | `npm run build` (or equivalent) exits 0 |

**Required attempt order:**
1. **Attempt L1 first.** Only skip if genuinely infeasible (e.g., no UI to exercise, no running server, no integration test harness).
2. **Attempt L2 next.** Only skip if no test runner is available or configured.
3. **L3 is the absolute minimum.** If L3 is the only level achieved, you MUST include a brief explanation of why L1 and L2 were not possible.

**Claiming L3-only without justification is a review finding.** The reviewer will flag implementations that report only L3 without explaining why higher levels were impossible.

Include the verification level and attempted levels in the completion signal:
```json
{
  "signal": "IMPLEMENTATION_COMPLETE",
  "verification_level": "L2",
  "verification_attempted": ["L1", "L2"],
  "verification_details": "L1 attempted — no dev server in worktree, could not exercise endpoint. L2 achieved — all 3 acceptance criteria have passing unit tests."
}
```

If only L3 was achieved:
```json
{
  "signal": "IMPLEMENTATION_COMPLETE",
  "verification_level": "L3",
  "verification_attempted": ["L1", "L2", "L3"],
  "verification_details": "L1 not possible — config-only change with no UI surface. L2 not possible — no test runner configured in project. L3 achieved — build exits 0."
}
```

---

## Exit Criteria

Before signaling completion, verify this checklist:

**For TDD methodology:**
- [ ] All `must_test` ACs have dedicated passing tests
- [ ] `verify_only` ACs confirmed in integration/consolidated tests
- [ ] `structural` ACs confirmed by types/lint passing
- [ ] Tests were written BEFORE implementation code

**For direct methodology:**
- [ ] All acceptance criteria are implemented
- [ ] Change verified to work as expected

**For all methodologies:**
- [ ] Verification levels attempted in order (L1 > L2 > L3), all attempts reported in `verification_attempted`
- [ ] If only L3 achieved, `verification_details` explains why L1 and L2 were not possible
- [ ] Code is committed with proper message format: `feat(<feature>): <task title>`
- [ ] `IMPLEMENTATION_COMPLETE` signal sent with files, test file, commit hash, and verification level
- [ ] No rejection feedback items remain unaddressed (if retry)
- [ ] Context stayed within budget (< 20K tokens)
