---
name: review-specialists
description: Specialist code review lenses for deep analysis beyond standard PR review. Each specialist is a focused pass with its own checklist. Use when asked to "specialist review", "deep review", "security review of this code", "performance review", "API review", "migration review", or "red team this code".
categories: ["coding"]
---

# Review Specialists

Extends PR review with deep specialist analysis. Each specialist is a distinct review pass with its own checklist and focus area. Produces a structured report grouped by specialist with MUST FIX vs CONSIDER ratings.

## Setup

Get the diff to review:

```bash
# If given a PR number
gh pr diff {number} > /tmp/pr-diff.txt
cat /tmp/pr-diff.txt

# If reviewing local changes
git diff main...HEAD > /tmp/pr-diff.txt
cat /tmp/pr-diff.txt

# If given a specific file or paste
# Work directly with what the user provided
```

Also read the full files for any modified code — the diff alone lacks context for many specialist checks:

```bash
# For each file changed in the diff
git show HEAD:{path/to/file}
# or
cat {path/to/file}
```

## Selecting Specialists

If the user specifies one or more specialists, run only those. If the user says "all" or doesn't specify, run all seven passes.

Available specialists:
1. Security
2. Performance
3. API Contract
4. Data Migration
5. Testing
6. Maintainability
7. Red Team

---

## Specialist 1: Security

Focus: vulnerabilities introduced or worsened by this change.

Checklist:
- **SQL injection**: any new SQL built via string concatenation or f-strings with user input? Check for missing parameterized queries.
- **XSS**: any new HTML rendering? Is user input escaped before insertion into DOM or templates? Flag `dangerouslySetInnerHTML`, `.innerHTML =`, unescaped template variables.
- **LLM prompt injection**: if user data flows into a system prompt, tool call, or LLM context — is it sanitized or sandboxed?
- **Secrets in logs/errors**: do new log statements, error messages, or exception handlers include tokens, passwords, PII, or internal paths?
- **IDOR**: do new endpoints or queries use a user-supplied ID without verifying the requester owns that resource?
- **Missing auth checks**: do new routes or functions have auth/permission middleware applied? Check for any new endpoints that skip the auth layer.
- **Command injection**: any new `exec`, `shell`, `subprocess`, or `os.system` calls with user-supplied data?
- **Mass assignment**: do new model creation/update calls accept a raw request body without field allowlisting?

Rating guidance:
- MUST FIX: any confirmed injection vector, missing auth on a sensitive endpoint, secrets in logs
- CONSIDER: defense-in-depth improvements, missing input length limits, overly verbose errors

---

## Specialist 2: Performance

Focus: performance regressions or scalability problems introduced by this change.

Checklist:
- **N+1 queries**: any loop that calls a database query or external API on each iteration? Look for ORM calls inside `for` loops or `.map()` callbacks.
- **Missing indexes**: do new `WHERE`, `ORDER BY`, or `JOIN` clauses use columns that lack an index? Check the migration files and schema for index coverage.
- **Blocking I/O in async contexts**: any synchronous file reads, blocking HTTP calls, or CPU-heavy work inside an `async` function or event loop?
- **Unbounded responses**: do new list/search endpoints return all results without pagination, `LIMIT`, or cursor support?
- **Missing caching**: are there expensive repeated computations (repeated DB lookups, expensive calculations) that could be memoized or cached with a short TTL?
- **Memory leaks**: are event listeners registered without a corresponding cleanup? Are large objects captured in closures or stored in module-level variables that grow unboundedly?
- **Expensive operations on hot paths**: is anything added to a frequently called code path (middleware, render loop, message handler) that should be moved off the critical path?

Rating guidance:
- MUST FIX: N+1 in a path that runs at request time, missing index on a high-cardinality join, blocking I/O in async code
- CONSIDER: caching opportunities, pagination on low-traffic endpoints

---

## Specialist 3: API Contract

Focus: changes that could break existing clients or violate API design standards.

Checklist:
- **Removed fields**: does the diff remove or rename any fields from a response that existing clients may depend on?
- **Changed types**: does any field change type (e.g., string to number, array to object)?
- **Renamed or moved endpoints**: are any URL paths, method names, or route structures changed?
- **Versioning**: if a breaking change is intentional, is it behind a version bump (e.g., `/v2/`, a new Accept header version, a feature flag)?
- **Backwards compatibility**: will clients using the old schema get an error or silently wrong data?
- **New required fields**: do new required request fields break clients that don't send them? Should they be optional with a default?
- **Error response consistency**: do new error paths return the same error shape as the rest of the API (status code, error code, message fields)?
- **Documentation**: are new or changed endpoints reflected in OpenAPI specs, docstrings, or README?

Rating guidance:
- MUST FIX: any breaking change without versioning where external clients exist
- CONSIDER: missing docs, inconsistent error shapes, optional vs required field choices

---

## Specialist 4: Data Migration

Focus: database migrations that could cause data loss, downtime, or corruption.

Checklist:
- **Reversibility**: does the migration have a `down()` / rollback method? Is it actually correct (not just `pass`)?
- **Zero-downtime safety**:
  - Safe: adding a nullable column, adding an index `CONCURRENTLY`, creating a new table
  - Unsafe: dropping a column or table while old code still reads it, renaming a column, adding a NOT NULL column without a default or backfill, changing a column type
- **Table locking**: does the migration take an exclusive lock on a large table? (e.g., `ALTER TABLE` on PostgreSQL without `CONCURRENTLY`, adding a non-nullable column)
- **Missing indexes on foreign keys**: do any new foreign key columns lack an index? Unindexed FKs cause full table scans on joins.
- **Backfill scripts**: if data is being backfilled, does the script batch in small chunks (e.g., 1000 rows at a time) with a delay between batches? Un-batched backfills can kill database performance.
- **Data loss risk**: does any part of the migration delete or transform data irreversibly? Is there a backup or a way to verify before applying?

Rating guidance:
- MUST FIX: unsafe zero-downtime operations on a live table, irreversible data transforms without a backup plan, missing rollback
- CONSIDER: missing index on FK, non-batched backfill on small tables

---

## Specialist 5: Testing

Focus: gaps in test coverage and test quality problems introduced by this change.

Checklist:
- **What's untested**: list the code paths, branches, or functions in the diff that have no corresponding test. Prioritize: new business logic, error handling paths, edge cases.
- **Implementation testing**: do any tests assert on internal implementation details (private method calls, internal state) rather than observable behavior? These break on refactors.
- **Missing edge cases**: for each new function or handler, check:
  - Empty or null inputs
  - Maximum/boundary values
  - Concurrent access (if applicable)
  - Failure modes (what if a dependency throws?)
- **Test balance**: is new functionality tested only with unit tests when integration tests would catch more? Or are heavy integration tests used where a unit test would suffice?
- **Flaky test patterns**:
  - `Date.now()`, `new Date()`, or time-based assertions without mocking
  - Tests that depend on execution order (shared mutable state)
  - Tests that call real external services without VCR/mocking
  - `setTimeout` or `sleep` in tests

Rating guidance:
- MUST FIX: zero tests for new business-critical logic, tests that pass incorrectly (false negatives), obvious missing error-path tests
- CONSIDER: additional edge cases, flaky pattern risks, integration test gaps

---

## Specialist 6: Maintainability

Focus: whether this change makes the codebase harder to understand, modify, or extend.

Checklist:
- **Coupling**: does this change create a new tight dependency between modules that were previously independent? Will changing one now force changes in the other?
- **Magic numbers and strings**: are there unnamed numeric constants or string literals that should be named constants or enums?
- **Function length**: are any new functions longer than ~50 lines? If so, do they have a single clear responsibility, or should they be split?
- **Duplicated logic**: does the diff repeat logic that already exists elsewhere? Flag opportunities to extract a shared utility.
- **Naming clarity**: without reading the surrounding code, are the variable, function, and class names self-explanatory? Would a new team member understand them?
- **Comment quality**: are there missing comments on non-obvious algorithms or business rules? Are there outdated comments that no longer match the code?
- **Error handling**: are errors handled or silently swallowed? Are error messages actionable?

Rating guidance:
- MUST FIX: logic duplication that will lead to bugs when one copy is updated but not the other, functions that are impossible to test due to excessive coupling
- CONSIDER: naming improvements, splitting large functions, adding comments

---

## Specialist 7: Red Team

Think like an adversarial user or attacker who knows the code. Try to break it.

For each significant new code path, ask:

- **Max-size inputs**: what happens if someone sends a 100MB request body, a 10,000-item array, or a string with 1 million characters? Is there a size limit enforced?
- **Unexpected order**: what if requests arrive out of order — create before update, delete before create, two concurrent creates? Are there race conditions?
- **Dependency misbehavior**: what if a database query returns `null` unexpectedly, an external API returns a 500, or a message queue delivers a message twice? Does the code handle it or crash?
- **Concurrent requests**: what if two users trigger the same mutation simultaneously? Is there a TOCTOU (time-of-check to time-of-use) race? Missing transactions or locks?
- **Malicious knowledge**: if an attacker reads this code and crafts requests knowing exactly how it works, what is the worst they can do? Enumerate the top 2–3 concrete attack scenarios.
- **Business logic abuse**: can the feature be used in a way that's technically valid but violates the intended use? (e.g., referral code abuse, free tier bypass, voting manipulation)

Rating guidance:
- MUST FIX: any scenario where a single malicious user can crash the service, corrupt data, or access others' data
- CONSIDER: abuse cases that require high volume or coordination, edge cases that fail gracefully

---

## Output Format

Produce a structured report. For each specialist run:

```
## [Specialist Name] Review

### MUST FIX
- **[Issue title]** (`path/to/file.ts:42`)
  What the problem is, why it matters, and the concrete fix.

### CONSIDER
- **[Issue title]** (`path/to/file.ts:88`)
  What to consider and why.

### Clean
[If no issues found, briefly state what was checked and confirmed clean.]
```

After all specialists, add a summary table:

```
## Summary

| Specialist     | Must Fix | Consider |
|----------------|----------|----------|
| Security       | 2        | 1        |
| Performance    | 0        | 3        |
| API Contract   | 1        | 0        |
| ...            | ...      | ...      |
| **Total**      | **3**    | **4**    |
```

End with a clear top recommendation: the single most important issue to address before merging.
