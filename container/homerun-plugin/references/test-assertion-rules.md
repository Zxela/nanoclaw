# Test Assertion Rules

> Quality rules for writing meaningful tests. Reference during implement test-writing steps.

## Literal Expected Values

Use hardcoded expected values, never replicate implementation logic:

```
GOOD: expect(calcTax(100)).toBe(10)
BAD:  expect(calcTax(100)).toBe(100 * TAX_RATE)
```

Why: If `TAX_RATE` is wrong, the bad test passes with the wrong answer. Tests should verify the contract, not mirror the code.

## Verify Results, Not Invocation Order

```
GOOD: expect(mockDb.save).toHaveBeenCalledWith({ name: "Alice", role: "admin" })
BAD:  expect(mockDb.save).toHaveBeenNthCalledWith(1, { name: "Alice" })
```

Why: Tests coupled to call order break on harmless refactors. Test *what* was called with, not *when*.

## No Dead Tests

- `test.skip()` → delete or fix immediately
- Commented-out tests → delete (git has history)
- Tests with no assertions → add assertion or delete
- Tests that can never fail → tautological, delete

## Assertion Completeness

Each test should assert the **observable outcome**, not just "no error":

```
GOOD: expect(result).toEqual({ id: 1, status: "active" })
BAD:  expect(result).toBeDefined()
      expect(result).not.toBeNull()
```

## Mock Scope

Mock ONLY direct external I/O dependencies:
- External APIs, databases, file system, network
- Do NOT mock the unit's own internal helpers
- Do NOT mock indirect dependencies (let them use real implementations)

## Test Independence

Each test must run standalone:
- No shared mutable state between tests
- No dependency on test execution order
- Setup/teardown in `beforeEach`/`afterEach`, not at module level
