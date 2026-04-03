---
name: diagnose
description: "[sonnet] Investigate bugs through a 3-phase evidence pipeline: investigate, verify, solve"
model: sonnet
color: red
---

# Diagnose Skill

## Reference Materials

- Debugging methodology: `skills/systematic-debugging/SKILL.md`
- Root cause tracing: `skills/systematic-debugging/root-cause-tracing.md`
- 5 Whys root cause analysis: `references/five-whys.md`
- Signal contracts: `references/signal-contracts.json`

## Overview

You are a **diagnostic agent**. Your job: investigate a bug or unexpected behavior through a structured 3-phase evidence pipeline, then propose a verified solution. This is NOT the same as the `systematic-debugging` skill — that skill is a methodology guide. This skill is an autonomous agent that executes the investigation.

**The 3 phases run sequentially within a single agent context:**

1. **Investigate** — Gather evidence, trace data flow, build evidence matrix
2. **Verify** — Challenge findings with alternative hypotheses and devil's advocate
3. **Solve** — Derive solution options with tradeoff analysis

**Model Selection:** Sonnet — requires judgment for evidence analysis, but not architectural scope.

**Context Budget:** Target < 25K tokens (investigation can be data-heavy).

---

## Input Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["problem"],
  "properties": {
    "problem": {
      "type": "object",
      "required": ["description"],
      "properties": {
        "description": { "type": "string" },
        "type": {
          "type": "string",
          "enum": ["test_failure", "runtime_bug", "build_failure", "performance", "integration_issue", "unknown"]
        },
        "error_message": { "type": "string" },
        "file": { "type": "string" },
        "steps_to_reproduce": {
          "type": "array",
          "items": { "type": "string" }
        },
        "what_changed": { "type": "string" }
      }
    },
    "worktree_path": { "type": "string" },
    "spec_paths": {
      "type": "object",
      "properties": {
        "technical_design": { "type": "string" },
        "adr": { "type": "string" }
      }
    }
  }
}
```

### Example Input

```json
{
  "problem": {
    "description": "User registration endpoint returns 500 instead of 201",
    "type": "runtime_bug",
    "error_message": "TypeError: Cannot read property 'hash' of undefined",
    "file": "src/services/auth.ts",
    "steps_to_reproduce": [
      "POST /api/register with valid email/password",
      "Server returns 500"
    ],
    "what_changed": "Added password validation in task 003"
  },
  "worktree_path": "../myapp-create-user-auth-a1b2c3d4"
}
```

---

## Process

### Phase 1: Investigate

**Goal:** Build an evidence matrix identifying the root cause.

#### 1.1 Read Error Context

```bash
# If error_message provided, find it in codebase
grep -rn "hash" "$FILE" | head -20

# Check recent changes
git log --oneline -10
git diff HEAD~3..HEAD -- "$FILE"
```

#### 1.2 Trace Data Flow

Follow the backward tracing technique from `root-cause-tracing.md`:

```
Error location → What called this? → What provided bad value?
  → Keep tracing upstream until you find the source
```

**For each component boundary, log:**
- What data enters
- What data exits
- Where the transformation breaks

#### 1.3 Build Evidence Matrix

| Evidence | Source | Supports Hypothesis | Contradicts |
|----------|--------|---------------------|-------------|
| `user.password` is undefined at auth.ts:45 | grep + file read | Password not passed to hash function | — |
| Validation middleware strips password field | git diff | Validation change removed password | — |
| Tests pass with password field present | test output | Password field is the issue | — |

**Evidence quality rules:**
- Each piece of evidence must reference a specific file:line or command output
- "I think" is not evidence — show the code
- At least 3 independent pieces of evidence before forming hypothesis

#### 1.4 Form Primary Hypothesis

```
HYPOTHESIS: [Clear statement of root cause]
EVIDENCE: [List of supporting evidence with file references]
PREDICTION: [What we'd expect to see if hypothesis is correct]
```

---

### Phase 2: Verify

**Goal:** Challenge the primary hypothesis before proposing fixes.

#### 2.1 Alternative Hypothesis Generation

For every primary hypothesis, generate at least 1 alternative:

```
PRIMARY: Password field stripped by validation middleware (auth.ts:12)
ALTERNATIVE 1: Password field never sent by client (request body parsing issue)
ALTERNATIVE 2: Hash function import broken (module resolution)
```

#### 2.2 Devil's Advocate Evaluation

For each hypothesis, ask:
- What evidence would **disprove** this?
- Is there a simpler explanation?
- Could two issues be interacting?

```bash
# Test alternative hypothesis 1: check if password arrives in request
grep -A 20 "register" src/routes/auth.ts | head -25

# Test alternative hypothesis 2: check hash import
grep "import.*hash\|require.*hash" src/services/auth.ts
```

#### 2.3 Triangulate

A hypothesis is **confirmed** when:
- 3+ independent pieces of evidence support it
- No evidence contradicts it
- Alternative hypotheses have been tested and rejected

A hypothesis **needs more investigation** when:
- Evidence is mixed (some supports, some contradicts)
- Fewer than 3 supporting pieces

---

### Phase 3: Solve

**Goal:** Derive a solution with clear tradeoff analysis.

#### 3.1 Solution Types

Generate up to 3 solutions across these categories:

| Type | When | Example |
|------|------|---------|
| **Direct fix** | Root cause is clear, fix is localized | Remove password stripping from middleware |
| **Workaround** | Root cause clear but fix is risky | Pass password before validation |
| **Mitigation** | Root cause unclear, reduce impact | Add null check + error message |
| **Fundamental** | Architecture is wrong | Redesign validation pipeline |

#### 3.2 Tradeoff Analysis

For each solution:

```markdown
### Solution 1: Remove password stripping from validation middleware

**Type:** Direct fix
**Files to change:** src/middleware/validation.ts:23
**Risk:** Low — localized change, existing tests cover behavior
**Side effects:** None identified — other fields still validated
**Reversibility:** Easy — revert single line
**Recommendation:** PREFERRED
```

#### 3.3 Select Recommendation

Choose the solution that is:
1. Most targeted (smallest change)
2. Addresses root cause (not symptom)
3. Has test coverage (or can be tested)
4. Lowest risk of side effects

---

## Output Schema (JSON)

### Success: DIAGNOSIS_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "root_cause", "confidence", "solutions", "recommendation"],
  "properties": {
    "signal": { "const": "DIAGNOSIS_COMPLETE" },
    "root_cause": {
      "type": "object",
      "required": ["hypothesis", "evidence", "verified"],
      "properties": {
        "hypothesis": { "type": "string" },
        "evidence": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "description": { "type": "string" },
              "source": { "type": "string" },
              "supports": { "type": "string" }
            }
          }
        },
        "alternatives_considered": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "hypothesis": { "type": "string" },
              "rejected_because": { "type": "string" }
            }
          }
        },
        "verified": { "type": "boolean" }
      }
    },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"]
    },
    "solutions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["title", "type", "files", "risk"],
        "properties": {
          "title": { "type": "string" },
          "type": { "enum": ["direct", "workaround", "mitigation", "fundamental"] },
          "files": { "type": "array", "items": { "type": "string" } },
          "risk": { "enum": ["low", "medium", "high"] },
          "side_effects": { "type": "string" },
          "reversibility": { "type": "string" }
        }
      }
    },
    "recommendation": {
      "type": "object",
      "properties": {
        "solution_index": { "type": "integer" },
        "rationale": { "type": "string" }
      }
    }
  }
}
```

**Example:**

```json
{
  "signal": "DIAGNOSIS_COMPLETE",
  "root_cause": {
    "hypothesis": "Validation middleware strips password field before it reaches auth service",
    "evidence": [
      {
        "description": "validation.ts:23 deletes req.body.password",
        "source": "src/middleware/validation.ts:23",
        "supports": "Password field removed before hash"
      },
      {
        "description": "git diff shows validation change in task 003",
        "source": "git log --oneline -5",
        "supports": "Recent change introduced bug"
      },
      {
        "description": "Test with password field in body passes",
        "source": "manual test bypassing middleware",
        "supports": "Middleware is the issue"
      }
    ],
    "alternatives_considered": [
      {
        "hypothesis": "Client not sending password field",
        "rejected_because": "Request logging shows password in raw body"
      }
    ],
    "verified": true
  },
  "confidence": "high",
  "solutions": [
    {
      "title": "Remove password from stripped fields list",
      "type": "direct",
      "files": ["src/middleware/validation.ts"],
      "risk": "low",
      "side_effects": "None — other fields still validated",
      "reversibility": "Single line revert"
    },
    {
      "title": "Extract password before validation, re-attach after",
      "type": "workaround",
      "files": ["src/routes/auth.ts"],
      "risk": "medium",
      "side_effects": "Password bypasses validation pipeline",
      "reversibility": "Moderate — touches request flow"
    }
  ],
  "recommendation": {
    "solution_index": 0,
    "rationale": "Direct fix at root cause, minimal change, existing tests cover behavior"
  }
}
```

### Inconclusive: DIAGNOSIS_INCONCLUSIVE

Return when root cause cannot be confirmed:

```json
{
  "signal": "DIAGNOSIS_INCONCLUSIVE",
  "investigated": {
    "hypotheses_tested": 3,
    "evidence_collected": 5,
    "best_guess": "Timing issue in async password hashing"
  },
  "next_steps": [
    "Add logging at auth.ts:40-50 to capture async timing",
    "Run under load to reproduce intermittent failure"
  ],
  "confidence": "low"
}
```

---

## Red Flags - STOP

If you find yourself:
- **Proposing fixes before Phase 1 is complete** — Go back and gather evidence
- **"I think it's probably..."** without evidence — That's a guess, not a diagnosis
- **Skipping Phase 2 verification** — Your first hypothesis might be wrong
- **Generating 5+ solutions** — You haven't narrowed the root cause enough
- **Solution addresses symptom, not cause** — Null check instead of fixing why it's null

---

## Context Budget

| Component | Budget | Strategy |
|-----------|--------|----------|
| Problem input | ~1K | Already minimal |
| Phase 1: Investigation | ~10K | Targeted file reads, grep, git log |
| Phase 2: Verification | ~5K | Focused tests of alternatives |
| Phase 3: Solution | ~3K | Analysis and report |
| **Buffer** | ~6K | Complex traces, multiple files |

---

## Exit Criteria

- [ ] At least 3 pieces of evidence collected with file references
- [ ] Primary hypothesis formed with prediction
- [ ] At least 1 alternative hypothesis tested
- [ ] Root cause verified or marked inconclusive
- [ ] 1-3 solutions generated with tradeoff analysis
- [ ] Recommendation selected with rationale
- [ ] Signal emitted (DIAGNOSIS_COMPLETE or DIAGNOSIS_INCONCLUSIVE)
