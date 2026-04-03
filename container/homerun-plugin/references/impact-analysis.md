# Impact Analysis Procedure

> Mandatory 3-stage procedure before modifying existing code. Run this in implement Step 0 when the task touches existing files.

## Stage 1: Discovery

Find everything connected to the code you're about to change:

```
- grep for the function/class/type name across the codebase
- grep for the file path in imports
- check for re-exports, barrel files, public API surfaces
- check tests that reference the target
```

**Output:** List of all files that reference or depend on the target.

## Stage 2: Understanding

Read ALL discovered files (not just the first few):

```
- How is the target used in each location?
- What assumptions does each caller make?
- Are there implicit contracts (parameter order, return shape, side effects)?
- What tests would break if the target's behavior changed?
```

**Output:** Understanding of each dependency relationship.

## Stage 3: Identification

Produce a structured impact report:

| Category | Files | Why |
|----------|-------|-----|
| **Direct impact** | Files that call/import the target | Signature or behavior change breaks them |
| **Indirect impact** | Files that depend on direct-impact files | Data flows through, may need updates |
| **No ripple** | Files that are isolated | Safe — no propagation path |

## When to Skip

- Greenfield code (new files, nothing depends on it yet)
- Pure additions (new exports that don't modify existing signatures)
- Test-only changes (modifying test files that nothing imports)

## When to Escalate

Escalate to user if impact analysis reveals:
- 5+ direct-impact files across different domains
- Public API surface changes
- Database schema or data contract changes
