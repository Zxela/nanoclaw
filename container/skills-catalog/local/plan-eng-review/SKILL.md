---
name: plan-eng-review
description: Engineering manager-mode plan review. Locks in the execution plan before coding starts — architecture, data flow, edge cases, test coverage, performance. Use when the user asks to "review the architecture", "engineering review", "lock in the plan", "eng review", "technical review", or when they have a plan and are about to start coding.
categories: ["general", "coding"]
---

# Plan Engineering Review

A structured engineering manager walkthrough that stress-tests a plan before a single line of code is written. The goal is to surface architectural weaknesses, uncovered edge cases, and test gaps while changes are still cheap.

Use this skill proactively when a user presents a plan, spec, or design doc and is about to start implementation.

## How to Use

### Step 1 — Acquire the Plan

If the user has already pasted a plan or spec, proceed to Step 2.

If not, ask:

> "Please share your plan, spec, or design doc. This can be a rough outline, a PRD, a list of components, or even a description of what you're building. The more detail, the better the review."

Wait for the user's response before proceeding.

### Step 2 — Architecture Analysis

Read the plan carefully, then respond with your architecture findings under these headings:

**Data Flow**
- Trace the path of data through the system end-to-end. Is every step explicit?
- Are there any gaps where data origin or destination is unclear?
- Are there circular dependencies between components?

**Separation of Concerns**
- Is each component doing exactly one thing?
- Are business logic, data access, and presentation cleanly separated?
- Flag any components that look like they're doing too much.

**Interface Contracts**
- Are the interfaces between components clearly defined?
- Are inputs and outputs typed and bounded?
- What happens if a component receives unexpected input?

### Step 3 — Component-by-Component Stress Test

For each major component or service in the plan, work through:

1. **Failure modes** — What are the three most likely ways this component fails in production?
2. **Scale behavior** — What breaks first when load is 10x? 100x?
3. **Interface cleanliness** — Is this component easy to swap out or extend without touching its consumers?

Format as a table or bulleted list per component. Be concrete — avoid generic answers like "it could crash."

### Step 4 — Top 5 Edge Cases

List the five most dangerous edge cases the plan does not explicitly address. For each:

- **Name** — Short label for the case
- **Scenario** — What triggers it?
- **Risk** — What goes wrong if unhandled?
- **Mitigation** — What change to the plan would cover it?

Focus on cases that would be expensive to fix post-launch: data corruption, silent failures, security gaps, and race conditions.

### Step 5 — Test Coverage Assessment

Classify what needs testing and how:

**Unit tests** — Pure functions, validation logic, transformations. List the specific modules or functions that must have unit test coverage.

**Integration tests** — Cross-component flows, external API calls, database reads/writes. List the critical integration paths.

**End-to-end tests** — Full user journeys. List the two or three flows that must pass e2e before shipping.

**Untestable as designed** — Flag any components or behaviors that are hard or impossible to test given the current design. For each, suggest a design change that would make it testable.

### Step 6 — Performance Review

Check for these specific risks:

- **N+1 query risk** — Any loop that triggers a database or API call per iteration?
- **Blocking operations** — Any synchronous I/O, heavy computation, or long-running tasks on the main thread or request path?
- **Memory concerns** — Any unbounded data structures, large in-memory caches, or streaming data loaded all at once?
- **Cold start / startup cost** — Any expensive initialization that happens on every request instead of once at startup?

For each risk found, state: where it is, what the worst-case impact is, and how to fix it.

### Step 7 — Architecture Decision Record (ADR)

Produce a final summary in ADR format:

---

**Architecture Decision Record**

**Status:** [Approved with changes / Approved / Requires rework]

**Approved Decisions**
List the parts of the plan that are sound and should proceed as written.

**Required Changes Before Coding**
List changes that must be made before implementation starts. These are blockers — do not proceed without resolving them. For each: what to change and why.

**Optional Improvements**
List improvements that would strengthen the design but are not blockers. Mark each as Low / Medium / High value.

**Open Questions**
Any questions that require the user's input or a product decision before they can be resolved.

---

After delivering the ADR, ask: "Do you want to resolve any of the required changes now, or are you ready to proceed with implementation?"
