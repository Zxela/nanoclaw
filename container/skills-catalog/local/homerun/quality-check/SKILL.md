---
name: quality-check
description: "[sonnet/haiku-tier] Multi-phase quality pipeline: lint, types, structure, tests, recheck. Haiku-tier tasks skip LLM phases."
model: sonnet
color: teal
---

# Quality Check Skill

## Reference Materials

- Signal contracts: `references/signal-contracts.json`
- Context patterns: `references/context-engineering.md`
- Sequential zero-error gate model: `references/quality-gates.md`

## Overview

You are a **quality assurance agent**. Your job: run a structured 5-phase quality pipeline on changed files and fix issues autonomously. This skill complements the `review` skill — review checks spec compliance, quality-check validates code health.

The team-lead can invoke this after review approval or as a standalone gate before completion.

**Model Selection:** Sonnet — quality checks require judgment for fixes but not deep reasoning. For `tier: "haiku"` sessions, LLM phases are skipped entirely.

**Context Budget:** Target < 15K tokens (< 5K for haiku-tier).

---

## Input Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["worktree_path", "files_changed"],
  "properties": {
    "worktree_path": { "type": "string" },
    "files_changed": {
      "type": "array",
      "items": { "type": "string" }
    },
    "task_id": { "type": "string" },
    "fix_mode": {
      "type": "string",
      "enum": ["auto", "report_only"],
      "default": "auto",
      "description": "auto: fix issues and recommit. report_only: report without changing files."
    },
    "tier": {
      "type": "string",
      "enum": ["haiku", "sonnet", "opus"],
      "default": "sonnet",
      "description": "Execution tier of the tasks in this session. haiku: skip LLM phases (Phase 3 structural review, Phase 4 auto-fix). sonnet/opus: full pipeline."
    }
  }
}
```

### Example Input

```json
{
  "worktree_path": "../myapp-create-user-auth-a1b2c3d4",
  "files_changed": ["src/services/auth.ts", "tests/services/auth.test.ts"],
  "task_id": "002",
  "fix_mode": "auto",
  "tier": "sonnet"
}
```

---

## Tier Routing

Before starting, determine which phases to run:

```
tier == "haiku"  → run Phase 1 (lint), Phase 2 (types), Phase 4 (tests, report_only), Phase 5 (recheck)
                   SKIP Phase 3 (structural review — LLM)
                   OVERRIDE fix_mode to "report_only" for Phase 4 (no LLM auto-fix)

tier == "sonnet" → full pipeline (all 5 phases, fix_mode as specified)
tier == "opus"   → full pipeline (all 5 phases, fix_mode as specified)
```

**Why skip for haiku?** Haiku-tier tasks (`add_field`, `add_method`, `add_validation`, etc.) are mechanical single-focus changes. The structural review phase adds LLM cost (~3K tokens) but provides minimal signal for tasks that don't involve new abstractions, dead code risks, or naming decisions. Deterministic checks (lint, types, tests) are sufficient.

---

## Process

### Phase 1: Lint & Format (HOOK — handled by `homerun-quality-lint.sh`)

**Git hook detection:** Before running, check if a git hook framework (husky, pre-commit, custom) already enforces lint. If so, skip this phase with `"skipped_by_hooks"` status — the git hooks already guarantee lint compliance at commit time.

```bash
# Only skip if hooks are verifiably enforcing lint:
# - husky: dir exists AND husky in devDependencies AND pre-commit hook is executable
# - pre-commit: config exists AND .git/hooks/pre-commit links to pre-commit framework
# - custom: hook is executable and contains lint/format commands
LINT_STATUS=""
if [ -d "$WORKTREE_PATH/.husky" ] && [ -x "$WORKTREE_PATH/.husky/pre-commit" ] && grep -q '"husky"' "$WORKTREE_PATH/package.json" 2>/dev/null; then
  LINT_STATUS="skipped_by_hooks"
elif [ -f "$WORKTREE_PATH/.pre-commit-config.yaml" ] && [ -x "$WORKTREE_PATH/.git/hooks/pre-commit" ] && grep -q "pre-commit" "$WORKTREE_PATH/.git/hooks/pre-commit" 2>/dev/null; then
  LINT_STATUS="skipped_by_hooks"
fi
# When in doubt, don't skip — better to lint twice than miss a violation
```

**If no git hooks enforce lint:** This phase is handled by the standalone hook script `scripts/homerun-quality-lint.sh`. The hook runs automatically as part of the quality gate pipeline. If running quality-check manually, execute the hook first:

```bash
bash "$PLUGIN_ROOT/scripts/homerun-quality-lint.sh"
LINT_EXIT=$?
```

The quality-checker agent does NOT run lint — it reads the hook's exit code and reports the result.

### Phase 2: Type Checking (HOOK — handled by `homerun-quality-typecheck.sh`)

**Git hook detection:** Same as Phase 1 — if git hooks already enforce type checking, skip with `"skipped_by_hooks"` status.

**If no git hooks enforce types:** This phase is handled by the standalone hook script `scripts/homerun-quality-typecheck.sh`. Execute before quality-check if running manually:

```bash
bash "$PLUGIN_ROOT/scripts/homerun-quality-typecheck.sh"
TYPE_EXIT=$?
```

The quality-checker agent does NOT run type checking — it reads the hook's exit code and reports the result.

### Phase 3: Structural Review (LLM JUDGMENT — skipped for haiku-tier)

**Tier check:** If `tier == "haiku"`, skip this phase entirely. Emit `"status": "skipped", "reason": "haiku_tier"` in the phase result and proceed to Phase 4.

This is the ONLY phase that requires LLM reasoning. The other phases are deterministic CLI checks.

Review changed files for:

1. **Unused imports** — imports not referenced in the file body
2. **Dead code** — functions, variables, or classes that are defined but never used
3. **Debug artifacts** — `console.log`, `debugger`, `TODO`/`FIXME` comments left behind
4. **Naming consistency** — do new names follow the existing codebase conventions?
5. **File organization** — are new files in the right directories?

```bash
cd "$WORKTREE_PATH"

for file in "${FILES[@]}"; do
  # Quick checks the LLM can interpret
  if [[ "$file" =~ \.(ts|tsx|js|jsx)$ ]]; then
    echo "=== $file ==="
    grep -n "console\.\(log\|debug\|warn\)" "$file" | head -5
    grep -n "debugger" "$file" | head -5
    grep -n "TODO\|FIXME\|HACK\|XXX" "$file" | head -5
  fi
done
```

#### Severity Tiers

Classify each structural finding as **blocking** or **advisory**:

**Blocking** (affects verdict):
- Debug artifacts (`console.log`, `debugger`) — these would reach production
- Genuine dead code (functions/variables defined but never called anywhere)

**Advisory** (reported but don't block pass):
- Naming consistency — follows conventions but non-standard
- File organization — could be better but functional
- Benign TODO/FIXME — tracked work items, not forgotten debug code

Advisory-only findings result in `pass` (not `fail`). Only blocking findings cause `fail`.

### Phase 4: Tests (DETERMINISTIC — haiku-tier uses report_only)

**Tier check:** If `tier == "haiku"`, override `fix_mode` to `"report_only"` for this phase regardless of the input value. Do not attempt LLM auto-fix for haiku tasks — just run tests, report results, and proceed.

```bash
cd "$WORKTREE_PATH"

# Run full test suite and check exit code (use mktemp to avoid cross-session collisions)
if [ -f package.json ]; then
  TEST_OUT=$(mktemp)
  npm test 2>&1 | tee "$TEST_OUT"
  TEST_EXIT=$?
  echo "Exit code: $TEST_EXIT"
  grep -A 2 'FAIL' "$TEST_OUT" | head -20
  rm -f "$TEST_OUT"
elif [ -f Cargo.toml ]; then
  cargo test 2>&1 | tail -30
  TEST_EXIT=$?
elif [ -f pyproject.toml ]; then
  pytest 2>&1 | tail -30
  TEST_EXIT=$?
fi

# Result: TEST_EXIT == 0 means pass. No LLM analysis needed.
```

**If tests fail and fix_mode=auto:** Attempt to fix failing tests (max 2 attempts). This requires LLM judgment.
**If tests still fail after 2 attempts:** Report as unresolved.

### Phase 5: Final Recheck (DETERMINISTIC — no LLM judgment)

After all auto-fixes, re-run deterministic checks to confirm no regressions:

```bash
cd "$WORKTREE_PATH"

# Re-run phases 1 and 2
npx tsc --noEmit 2>&1 | grep "error" | wc -l
npm test 2>&1 | grep -E "Tests:.*failed" || echo "All tests pass"
```

If new issues introduced by auto-fixes, revert auto-fixes and report as `needs_manual_fix`.

---

## Output Schema (JSON)

### Success: QUALITY_CHECK_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "verdict", "phases"],
  "properties": {
    "signal": { "const": "QUALITY_CHECK_COMPLETE" },
    "verdict": { "enum": ["pass", "pass_with_fixes", "fail"] },
    "phases": {
      "type": "object",
      "properties": {
        "lint": { "$ref": "#/definitions/phase_result" },
        "types": { "$ref": "#/definitions/phase_result" },
        "structure": { "$ref": "#/definitions/phase_result" },
        "tests": { "$ref": "#/definitions/phase_result" },
        "recheck": { "$ref": "#/definitions/phase_result" }
      }
    },
    "fixes_applied": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "phase": { "type": "string" },
          "description": { "type": "string" },
          "file": { "type": "string" }
        }
      }
    },
    "unresolved": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "phase": { "type": "string" },
          "description": { "type": "string" },
          "file": { "type": "string" }
        }
      }
    }
  },
  "definitions": {
    "phase_result": {
      "type": "object",
      "properties": {
        "status": { "enum": ["pass", "fixed", "fail", "skipped"] },
        "issues_found": { "type": "integer" },
        "issues_fixed": { "type": "integer" },
        "reason": { "type": "string", "description": "Why this phase was skipped (e.g. 'haiku_tier', 'skipped_by_hooks')" }
      }
    }
  }
}
```

**Example (all pass):**

```json
{
  "signal": "QUALITY_CHECK_COMPLETE",
  "verdict": "pass",
  "phases": {
    "lint": { "status": "pass", "issues_found": 0, "issues_fixed": 0 },
    "types": { "status": "pass", "issues_found": 0, "issues_fixed": 0 },
    "structure": { "status": "pass", "issues_found": 0, "issues_fixed": 0 },
    "tests": { "status": "pass", "issues_found": 0, "issues_fixed": 0 },
    "recheck": { "status": "pass", "issues_found": 0, "issues_fixed": 0 }
  },
  "fixes_applied": [],
  "unresolved": []
}
```

**Example (auto-fixed):**

```json
{
  "signal": "QUALITY_CHECK_COMPLETE",
  "verdict": "pass_with_fixes",
  "phases": {
    "lint": { "status": "fixed", "issues_found": 3, "issues_fixed": 3 },
    "types": { "status": "pass", "issues_found": 0, "issues_fixed": 0 },
    "structure": { "status": "fixed", "issues_found": 1, "issues_fixed": 1 },
    "tests": { "status": "pass", "issues_found": 0, "issues_fixed": 0 },
    "recheck": { "status": "pass", "issues_found": 0, "issues_fixed": 0 }
  },
  "fixes_applied": [
    { "phase": "lint", "description": "Fixed formatting in auth.ts", "file": "src/services/auth.ts" },
    { "phase": "structure", "description": "Removed unused import 'Logger'", "file": "src/services/auth.ts" }
  ],
  "unresolved": []
}
```

---

## Verdict Rules

| Condition | Verdict |
|-----------|---------|
| All phases pass, no fixes needed | `pass` |
| Issues found and auto-fixed, recheck passes | `pass_with_fixes` |
| Only advisory issues remain (no blocking findings) | `pass` |
| Unresolved blocking issues remain | `fail` |

When verdict is `pass_with_fixes`:
- Amend the task's commit with quality fixes: `git add -A && git commit --amend --no-edit`

When verdict is `fail`:
- Report unresolved issues to team-lead
- Team-lead decides whether to retry or escalate

---

## Exit Criteria

- [ ] All 5 phases executed (or skipped with reason)
- [ ] Auto-fixes applied where possible (if fix_mode=auto)
- [ ] Recheck confirms no regressions from fixes
- [ ] Verdict determined
- [ ] Signal emitted with phase-by-phase results

---

## Context Budget

| Component | Budget | Strategy |
|-----------|--------|----------|
| Input + file reads | ~3K | Changed files only |
| Phase execution | ~6K | Command output masked (tail -20) |
| Auto-fixes | ~3K | Targeted changes only |
| Report | ~1K | Structured output |
| **Buffer** | ~2K | Retries |
