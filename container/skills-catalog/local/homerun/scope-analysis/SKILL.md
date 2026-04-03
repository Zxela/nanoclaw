---
name: scope-analysis
description: "[sonnet] Extract scope, validate ACs, and create JIT context refs from spec documents"
model: sonnet
color: cyan
---

# Scope Analysis Skill

## Reference Materials

- Model routing: `references/model-routing.json`
- Signal contracts: `references/signal-contracts.json`
- Agent handoff patterns: `references/context-engineering.md`

## Overview

Read specification documents and extract a structured scope analysis for the task-decomposer. This skill handles the mechanical work of spec reading: component extraction, AC validation, JIT context ref creation, and dependency mapping. The output is a condensed `docs/scope-analysis.json` that the task-decomposer uses as its primary input.

**Model Selection:** This skill runs on **sonnet** because the work is mechanical — reading, extracting, and validating patterns. No judgment calls about decomposition or task sizing.

---

## Input Schema (JSON)

The scope-analyzer agent receives input from the `/create` or `/plan` command:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["worktree_path", "spec_paths"],
  "properties": {
    "worktree_path": { "type": "string" },
    "session_id": { "type": "string" },
    "branch": { "type": "string" },
    "spec_paths": {
      "type": "object",
      "required": ["prd", "adr", "technical_design"],
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

## Output Schema

### Success: SCOPE_ANALYSIS_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "scope_file", "components_count", "acceptance_criteria_count", "all_criteria_testable"],
  "properties": {
    "signal": { "const": "SCOPE_ANALYSIS_COMPLETE" },
    "scope_file": { "type": "string" },
    "components_count": { "type": "integer" },
    "acceptance_criteria_count": { "type": "integer" },
    "all_criteria_testable": { "type": "boolean" },
    "untestable_criteria": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

**Example:**

```json
{
  "signal": "SCOPE_ANALYSIS_COMPLETE",
  "timestamp": "2026-02-27T10:30:00Z",
  "source": { "skill": "homerun:scope-analysis" },
  "payload": {
    "scope_file": "docs/scope-analysis.json",
    "components_count": 5,
    "acceptance_criteria_count": 12,
    "all_criteria_testable": true,
    "untestable_criteria": []
  },
  "envelope_version": "1.0.0"
}
```

---

## scope-analysis.json Schema

The output artifact written to `docs/scope-analysis.json`:

```json
{
  "components": [
    {
      "name": "UserService",
      "responsibility": "Handle user CRUD operations",
      "layer": "service",
      "files": ["src/services/user.ts"]
    }
  ],
  "data_models": [
    {
      "name": "User",
      "fields": ["id", "email", "password_hash", "created_at"],
      "relationships": ["has_many: sessions"]
    }
  ],
  "api_contracts": [
    {
      "method": "POST",
      "path": "/api/users",
      "request": { "body": { "email": "string", "password": "string" } },
      "response": { "status": 201, "body": { "id": "string", "email": "string" } }
    }
  ],
  "external_dependencies": [
    { "name": "bcrypt", "purpose": "Password hashing" }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "criterion": "User must be able to register with email and password",
      "testable": true,
      "pattern": "assertion",
      "test_assertion_template": "expect(response.status).toBe(201)",
      "source_story": "US-001"
    }
  ],
  "jit_context_refs": {
    "by_component": {
      "UserService": {
        "interface_locations": ["TECHNICAL_DESIGN.md:## UserService"],
        "pattern_files": ["src/services/base.ts"],
        "grep_patterns": ["export class.*Service"],
        "constraints_section": "ADR.md:## Decision 1"
      }
    }
  },
  "non_scope": ["Payment processing", "Email verification"],
  "change_impact_map": {
    "direct": ["src/services/", "src/models/"],
    "indirect": ["src/middleware/auth.ts"]
  },
  "testing_strategy": "Unit tests for models/services, integration tests for API endpoints",
  "traceability": {
    "user_stories": {},
    "acceptance_criteria": {},
    "adr_decisions": {}
  }
}
```

---

## Process

### 1. Read All Spec Documents

Read spec documents from paths in `state.json`:

```bash
cd "$WORKTREE_PATH"

# Read state.json to get spec paths
jq -r '.spec_paths | to_entries[] | "\(.key): \(.value)"' state.json
```

Read each document:
- **PRD.md** — User stories, acceptance criteria, success metrics
- **ADR.md** — Architecture decisions and rationale
- **TECHNICAL_DESIGN.md** — Components, data models, API contracts, dependencies
- **WIREFRAMES.md** — UI layouts and user flows (if applicable)

Also read:
- `CLAUDE.md` — Project conventions and patterns

**Important:** Always use absolute paths from `state.json.spec_paths`.

### 2. Extract Components, Data Models, API Contracts, Dependencies

From TECHNICAL_DESIGN.md, extract:

```bash
# Extract component headers
grep -E "^#{1,3} " "$TECH_DESIGN_PATH"

# Extract data models
grep -A 30 "## Data Model" "$TECH_DESIGN_PATH"

# Extract API contracts
grep -A 30 "## API" "$TECH_DESIGN_PATH"

# Extract external dependencies
grep -A 20 "## Dependencies\|## External" "$TECH_DESIGN_PATH"
```

Classify each component by layer:
- `data` — Models, schemas, migrations
- `service` — Business logic, services
- `api` — Routes, endpoints, controllers
- `ui` — Components, pages, layouts

### 3. Validate Acceptance Criteria Testability

For each acceptance criterion from the PRD, check testability patterns:

#### EARS Format Recognition

Acceptance criteria MUST use EARS (Easy Approach to Requirements Syntax). Validate against these patterns:

| EARS Pattern | Regex | Example |
|--------------|-------|---------|
| Event-driven | `^When .+, the system shall` | "When user submits invalid email, the system shall display error" |
| State-driven | `^While .+, the system shall` | "While unauthenticated, the system shall redirect to /login" |
| Conditional | `^If .+, then the system shall` | "If token is expired, then the system shall return 401" |
| Unconditional | `^The system shall` | "The system shall hash passwords using bcrypt" |
| Quantitative | `shall .+ (within\|under\|less than\|<) [0-9]` | "The API shall respond within 200ms at p95" |
| Legacy behavioral | `(Given\|When\|Then)` | "Given a user, when they log in, then session is created" |

**Note:** Legacy Given/When/Then is accepted but EARS is preferred for new criteria.

#### Invalid Patterns to Reject

| Pattern | Example | Problem |
|---------|---------|---------|
| Adjective-only | "should be user-friendly" | No observable outcome |
| Vague outcome | "should work correctly" | "correctly" is undefined |
| No threshold | "must be fast" | No measurable target |
| Passive/vague | "errors are handled" | What handling? |
| Missing "shall" | "the system returns 200" | No obligation keyword — ambiguous intent |

#### Validation Process

```bash
cd "$WORKTREE_PATH"

# Extract all acceptance criteria from PRD
CRITERIA_FILE=$(mktemp)
grep -E "^\s*-\s*\[" "$PRD_PATH" > "$CRITERIA_FILE"

# Check each criterion for testable patterns
while read -r line; do
  criterion=$(echo "$line" | sed 's/^[^]]*\] *//')

  if echo "$criterion" | grep -qE "(Given|When|Then)"; then
    pattern="behavioral"
  elif echo "$criterion" | grep -qE "(should|must|can|will) [a-z]+ [a-z]+"; then
    pattern="assertion"
  elif echo "$criterion" | grep -qE "[<>=≤≥] ?[0-9]"; then
    pattern="quantitative"
  else
    echo "UNTESTABLE: $criterion"
    pattern="invalid"
  fi
done < "$CRITERIA_FILE"
rm -f "$CRITERIA_FILE"
```

### 4. Transform ACs to Test Assertion Templates

For each valid criterion, generate a corresponding test assertion template:

| Criterion Pattern | Test Assertion Template |
|-------------------|------------------------|
| "User must see X" | `expect(screen.getByText('X')).toBeVisible()` |
| "API returns X" | `expect(response.body).toEqual(X)` |
| "X < N" | `expect(X).toBeLessThan(N)` |
| "Given A, when B, then C" | `describe('given A', () => { it('when B, should C', ...) })` |

### 5. Create JIT Context References

For each component identified in Step 2, create JIT context references:

| Field | What to Provide | Example |
|-------|----------------|---------|
| `interface_locations` | File paths + section names for relevant types/interfaces | `["src/models/user.ts:User interface", "TECHNICAL_DESIGN.md:## Data Model"]` |
| `pattern_files` | Paths to existing implementations showing the pattern to follow | `["src/services/base.ts"]` |
| `grep_patterns` | Grep patterns to discover related code at runtime | `["export class.*Service", "interface Auth"]` |
| `constraints_section` | Section reference in ADR/TECHNICAL_DESIGN for constraints | `"ADR.md:## Decision 1"` |

Discover pattern files and interfaces from the codebase:

```bash
cd "$WORKTREE_PATH"

# Find existing service patterns
find src/ -name "*.ts" -o -name "*.js" | head -20

# Find existing model patterns
grep -rn "export class\|export interface\|export type" src/ --include="*.ts" | head -20

# Find existing test patterns
ls tests/ 2>/dev/null || ls __tests__/ 2>/dev/null || echo "No test directory found"
```

### 6. Extract Non-Scope and Change Impact Map

From TECHNICAL_DESIGN.md:

```bash
# Extract non-scope section
grep -A 20 "## Non.Scope\|## Out of Scope\|## Exclusions" "$TECH_DESIGN_PATH"

# Extract change impact
grep -A 20 "## Impact\|## Affected" "$TECH_DESIGN_PATH"
```

### 7. Extract Traceability from State

```bash
# Extract traceability links from state.json
jq '.traceability // {}' state.json
```

### 8. Write scope-analysis.json

Assemble all extracted data into `docs/scope-analysis.json`:

```bash
cd "$WORKTREE_PATH"
mkdir -p docs

# Write the scope analysis file
cat > docs/scope-analysis.json << 'SCOPE_EOF'
{
  "components": [...],
  "data_models": [...],
  "api_contracts": [...],
  "external_dependencies": [...],
  "acceptance_criteria": [...],
  "jit_context_refs": { "by_component": {...} },
  "non_scope": [...],
  "change_impact_map": { "direct": [...], "indirect": [...] },
  "testing_strategy": "...",
  "traceability": {...}
}
SCOPE_EOF
```

### 9. Update State and Commit

```bash
cd "$WORKTREE_PATH"

# Update state.json phase
jq '.phase = "task_decomposition"' state.json > tmp.json && mv tmp.json state.json

# Commit scope analysis
git add docs/scope-analysis.json state.json
git commit -m "scope: extract scope analysis from specifications

Components: N, Acceptance Criteria: N
All criteria testable: yes/no"
```

### 10. Emit Signal

Return the `SCOPE_ANALYSIS_COMPLETE` signal:

```json
{
  "signal": "SCOPE_ANALYSIS_COMPLETE",
  "timestamp": "<ISO8601>",
  "source": { "skill": "homerun:scope-analysis" },
  "payload": {
    "scope_file": "docs/scope-analysis.json",
    "components_count": N,
    "acceptance_criteria_count": N,
    "all_criteria_testable": true,
    "untestable_criteria": []
  },
  "envelope_version": "1.0.0"
}
```

**Do NOT spawn the next phase.** Return after emitting this signal.

---

## Exit Criteria

- [ ] All spec documents read and analyzed
- [ ] Components extracted with layer classification
- [ ] Data models, API contracts, and dependencies extracted
- [ ] All acceptance criteria validated for testability
- [ ] Test assertion templates generated for valid criteria
- [ ] JIT context refs created per component (interface locations, pattern files, grep patterns)
- [ ] Non-scope boundaries and change impact map extracted
- [ ] Traceability links preserved from state.json
- [ ] `docs/scope-analysis.json` written and committed
- [ ] `state.json` phase updated to `"task_decomposition"`
- [ ] `SCOPE_ANALYSIS_COMPLETE` signal emitted
