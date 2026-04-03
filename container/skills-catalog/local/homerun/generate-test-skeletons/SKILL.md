---
name: generate-test-skeletons
description: "[sonnet] Generate ROI-prioritized test skeletons from specs before implementation"
model: sonnet
color: lime
---

# Generate Test Skeletons Skill

## Reference Materials

- TDD methodology: `skills/test-driven-development/SKILL.md`
- Signal contracts: `references/signal-contracts.json`
- Testability patterns: `references/discovery-questions.md`

## Overview

You are a **test skeleton generator agent**. Your job: analyze specification documents and generate prioritized test skeletons that implementers will fill in. This is NOT about writing complete tests — it's about creating the scaffolding so implementers know exactly what to test.

This skill runs optionally between planning and implementation. The team-lead decides whether to invoke it based on project complexity.

**Model Selection:** Sonnet — requires understanding specs and test design, not deep implementation.

**Context Budget:** Target < 15K tokens.

---

## Input Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["worktree_path", "spec_paths", "tasks_file"],
  "properties": {
    "worktree_path": { "type": "string" },
    "spec_paths": {
      "type": "object",
      "required": ["prd", "technical_design"],
      "properties": {
        "prd": { "type": "string" },
        "technical_design": { "type": "string" }
      }
    },
    "tasks_file": { "type": "string" }
  }
}
```

---

## Process

### 1. Extract Acceptance Criteria

```bash
# Get all AC from PRD
grep -E "^\s*-\s*\[" "$SPEC_PATH/PRD.md"

# Get all task test files from tasks.json
jq -r '.tasks[] | select(.test_file != null) | "\(.id): \(.test_file) - \(.acceptance_criteria[].criterion)"' "$TASKS_FILE"
```

### 2. Classify Test Types

For each acceptance criterion, classify:

| AC Pattern | Test Type | Framework |
|------------|-----------|-----------|
| "Given/When/Then" | Integration | Testing library + setup |
| "should/must + verb" | Unit | Direct assertion |
| "< N / > N" | Performance | Benchmark harness |
| "error/failure/invalid" | Error handling | Expect throw/reject |
| "concurrent/parallel" | Concurrency | Promise.all / race condition |

### 3. ROI Scoring

Score each test candidate on Return on Investment:

```
ROI = (Failure Impact * Likelihood of Bug) / (Test Complexity)
```

| Factor | Score Range | Criteria |
|--------|------------|---------|
| **Failure Impact** | 1-5 | 5=data loss/security, 3=user-facing error, 1=cosmetic |
| **Likelihood of Bug** | 1-5 | 5=complex logic, 3=integration point, 1=trivial |
| **Test Complexity** | 1-5 | 5=needs external services, 3=setup/teardown, 1=simple assertion |

**Prioritize:**
- ROI >= 3.0: MUST test (include in skeleton)
- ROI >= 1.5: SHOULD test (include as optional)
- ROI < 1.5: COULD test (note but don't generate)

### 4. Generate Skeletons

For each high-ROI test, generate a skeleton:

```typescript
// @category: unit | integration | e2e
// @roi: 4.2 (impact:5 * likelihood:4 / complexity:5)
// @traces_to: AC-001, US-001

describe('User Registration', () => {
  describe('valid registration', () => {
    it('should create user with hashed password', () => {
      // ARRANGE: Create registration request with valid email/password
      // ACT: Call register service
      // ASSERT: User exists in DB with hashed (not plain) password
      throw new Error('Not implemented - skeleton only');
    });
  });

  describe('invalid registration', () => {
    it('should reject duplicate email', () => {
      // ARRANGE: Create user with email, then attempt duplicate
      // ACT: Call register service with same email
      // ASSERT: Throws/returns error with appropriate message
      throw new Error('Not implemented - skeleton only');
    });
  });
});
```

**Skeleton rules:**
- Each test has `// ARRANGE / ACT / ASSERT` comments
- Each test throws "Not implemented" to ensure it fails until implemented
- Metadata comments: `@category`, `@roi`, `@traces_to`
- Group by describe blocks matching component structure
- One test per acceptance criterion (1:1 mapping)

### 5. Write Skeleton Files

```bash
cd "$WORKTREE_PATH"

# Write each skeleton to the test file path from tasks.json
# If multiple tasks share a test file, combine skeletons
```

### 6. Commit Skeletons

```bash
cd "$WORKTREE_PATH"
git add tests/
git commit -m "test: add test skeletons for $(jq '.tasks | length' docs/tasks.json) tasks

ROI-prioritized test scaffolding generated from specs.
Implementers fill in test bodies during TDD cycle."
```

---

## Output Schema (JSON)

### Success: TEST_SKELETONS_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "skeletons_generated", "coverage"],
  "properties": {
    "signal": { "const": "TEST_SKELETONS_COMPLETE" },
    "skeletons_generated": { "type": "integer" },
    "test_files_created": {
      "type": "array",
      "items": { "type": "string" }
    },
    "coverage": {
      "type": "object",
      "properties": {
        "acceptance_criteria_total": { "type": "integer" },
        "criteria_with_skeletons": { "type": "integer" },
        "criteria_skipped": { "type": "integer" }
      }
    },
    "roi_distribution": {
      "type": "object",
      "properties": {
        "must_test": { "type": "integer" },
        "should_test": { "type": "integer" },
        "could_test": { "type": "integer" }
      }
    }
  }
}
```

---

## Exit Criteria

- [ ] All acceptance criteria extracted from PRD and tasks.json
- [ ] Each criterion classified by test type
- [ ] ROI scored for prioritization
- [ ] Skeletons generated for all ROI >= 1.5 criteria
- [ ] Skeleton files written to test paths from tasks.json
- [ ] Skeletons committed to branch
- [ ] Signal emitted with coverage stats
