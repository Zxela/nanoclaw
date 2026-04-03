# 5 Whys Root Cause Analysis

> Structured escalation for debugging. Use when the surface-level fix feels wrong or the same issue recurs.

## Process

```
Symptom: [What you observe]
  Why 1: [Immediate cause]
    Why 2: [Cause of that cause]
      Why 3: [Deeper cause]
        Why 4: [Structural cause]
          Why 5: [Root cause]
→ Fix the root cause, not the symptom.
```

## Example

```
Symptom: Build fails with type error
  Why 1: Type definitions don't match function signature
    Why 2: Interface was updated but callers weren't
      Why 3: No automated check for breaking changes
        Why 4: CI pipeline doesn't run type-check on dependent packages
          Why 5: Monorepo type-checking is per-package, not cross-package
→ Root cause fix: Add cross-package type-check to CI
→ Symptomatic fix: Update the one caller (leaves others vulnerable)
```

## When to Use

- Quick fix didn't work or feels like a band-aid
- Same bug recurred after a previous "fix"
- Cause is unclear after initial investigation
- Fix would require modifying 3+ unrelated files (smell)

## When to Stop Early

- You hit an external constraint you can't change (OS behavior, third-party API)
- The root cause is already known and tracked
- You reach a policy/process decision (out of code scope)

## Common Failure Patterns

| Pattern | Symptom | Typical Root Cause |
|---------|---------|-------------------|
| **Error Fix Chain** | Fix A causes bug B, fix B causes bug C | Surface-level fix, not root cause |
| **Type Safety Bypass** | Scattered `as any` / `@ts-ignore` | Missing type guards at boundary |
| **Test Rot** | Tests pass but feature is broken | Tests assert implementation, not behavior |
| **Config Drift** | Works locally, fails in CI | Environment-specific assumptions |
