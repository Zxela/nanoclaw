# Discovery Validation Gates

Run these automated validations before transitioning from discovery to the spec_review phase. They catch common issues that would cause problems during planning and implementation.

## PRD Validation

```bash
# Check for measurable success metrics (must have at least one with target value)
grep -E "Target.*[0-9]|[0-9]+%|< ?[0-9]|> ?[0-9]" "$HOMERUN_DOCS_DIR/PRD.md" || echo "VALIDATION_FAILED: No measurable success metrics found"

# Check for explicit non-goals section with content
grep -A 5 "## Non-Goals" "$HOMERUN_DOCS_DIR/PRD.md" | grep -E "^- " || echo "VALIDATION_FAILED: Non-goals section empty"
```

## User Story Testability Validation

Every acceptance criterion must match at least one testable pattern:

| Pattern | Example | Regex |
|---------|---------|-------|
| Behavioral (Given/When/Then) | "Given a logged-in user, when they click logout, then session is destroyed" | `(Given\|When\|Then)` |
| Assertion (should/must/can) | "User should see an error message" | `(should\|must\|can\|will) [a-z]+ [a-z]+` |
| Quantitative | "Response time < 2s" | `[<>=≤≥] ?[0-9]` |

**Reject these vague patterns:**
- Adjective-only: "should be user-friendly" (no observable outcome)
- No outcome: "should work correctly" (what does "correctly" mean?)
- Passive/vague: "is handled properly" (what does "properly" mean?)

```bash
# Extract acceptance criteria and check for testable patterns
grep -E "^\s*-\s*\[" "$HOMERUN_DOCS_DIR/PRD.md" | while read -r criterion; do
  if ! echo "$criterion" | grep -qE "(Given|When|Then|should|must|can|will) [a-z]+|[<>=≤≥] ?[0-9]"; then
    echo "VALIDATION_WARNING: Potentially untestable criterion: $criterion"
  fi
done
```

## ADR Validation

```bash
# Check for explicit non-goals or constraints in ADR
grep -E "## (Non-Goals|Constraints|Out of Scope)" "$HOMERUN_DOCS_DIR/ADR.md" || echo "VALIDATION_WARNING: ADR missing non-goals/constraints section"

# Check decision has rationale
grep -A 10 "## Decision" "$HOMERUN_DOCS_DIR/ADR.md" | grep -E "(because|due to|since|rationale)" || echo "VALIDATION_WARNING: Decision lacks explicit rationale"
```

## Handling Validation Results

**VALIDATION_FAILED errors:**
1. Do not transition to the spec_review phase
2. Present the specific failures to the user
3. Return to dialogue to address the issues
4. Re-run validation after corrections

**VALIDATION_WARNING items:**
1. Present warnings to the user
2. **Auto mode:** Log warnings and proceed — do not ask for confirmation
3. **Interactive mode:** Ask whether to address now or proceed:
   - "Address" → return to dialogue to refine
   - "Proceed" → continue to spec_review phase
