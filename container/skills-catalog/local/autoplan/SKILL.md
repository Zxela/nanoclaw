---
name: autoplan
description: Runs the full review pipeline automatically — office-hours, CEO review, and engineering review — making all architectural decisions autonomously using 6 decision principles, surfacing only genuine taste/judgment calls at the end. Use when asked to "auto review", "autoplan", "run all reviews", "full review pipeline", "review this plan automatically", or "make the decisions for me".
categories: ["general", "coding"]
---

# Autoplan

Runs the full review pipeline (office-hours → CEO review → engineering review) in one pass, using 6 auto-decision principles to resolve all architectural questions autonomously. Only surfaces genuine taste/preference decisions at the end, so the user gets a single approval gate instead of being peppered with questions throughout.

## The 6 Auto-Decision Principles

When any architectural question arises during the review, resolve it automatically using these principles in priority order:

1. **Simplicity wins** — When two approaches are equivalent in outcome, pick the simpler one. Fewer moving parts, fewer abstractions, fewer dependencies.
2. **Ship beats perfect** — A working v1 beats an ideal v2 that takes 3x longer. Optimize for getting something in users' hands.
3. **Reversibility** — Prefer decisions that can be changed later over ones that lock you in. Avoid tight coupling, proprietary formats, and load-bearing abstractions.
4. **User-facing first** — Prioritize what the user sees and experiences over internal architecture elegance. A slightly messy backend that ships a great UX beats a beautiful architecture with a rough UX.
5. **Scope discipline** — Reject scope additions unless they are on the critical path to v1. Log them as future work instead.
6. **Testability** — Designs that are hard to test are bad designs. If a component can't be tested in isolation, that's a design flaw, not a test problem.

When a question cannot be resolved by these principles (both options are valid and it genuinely depends on the user's preferences, values, or context), flag it as a **taste decision** for the final gate.

## How to Use

### Step 1 — Acquire the Plan

If the user has not already provided a plan, spec, or description, ask once:

> "Share your plan or describe what you're building. A rough outline is fine — I'll run the full review pipeline automatically and only ask you questions at the very end."

Wait for the user's input, then proceed without interrupting further.

### Step 2 — Office Hours (Abbreviated, 3 Questions)

Run a compressed startup analysis. Internally answer these 3 questions based on the plan — do NOT ask the user:

1. **Who is the user and what problem are they actually solving?** Identify the real underlying need, not just the stated feature.
2. **What is the single biggest risk to this plan succeeding?** Technical, product, or execution.
3. **What assumptions is this plan making that haven't been validated?** List up to 3.

Record your findings. Do not output them yet — they will feed into the next steps.

### Step 3 — CEO Review (Selective Expansion Mode)

Auto-select SELECTIVE EXPANSION mode: focus only on the areas with the highest leverage. Do not expand scope broadly.

Internally evaluate:

- **Core value proposition** — Is the plan solving the right problem in a direct way, or is it over-engineered for the problem size?
- **Cut list** — Identify any features or components in the plan that are not on the critical path to a working v1. Flag them for deferral, applying the Scope Discipline principle.
- **Strategic risk** — Is there a competitor, technical trend, or user behavior that could make this plan obsolete? Note it if significant.
- **One strategic recommendation** — The single highest-leverage change to the plan from a product/business perspective.

Auto-decide anything that falls under the 6 principles. Flag genuine preference calls as taste decisions.

### Step 4 — Engineering Review (Full Walkthrough, Auto-Decide)

Run the full engineering review internally, resolving every question with the 6 principles:

**Architecture**
- Trace the data flow end-to-end. Fill any gaps using Simplicity Wins and Reversibility.
- Identify circular dependencies and propose the simpler resolution.
- Flag separation of concerns violations; recommend the fix.

**Component Stress Test**
- For each major component: identify the top failure mode and how to handle it.
- For scale: identify what breaks first and the simplest mitigation.
- Auto-select interface patterns using Simplicity Wins. Flag custom protocol choices as taste decisions only if the tradeoff is genuinely preference-based.

**Top 3 Edge Cases** (abbreviated from full eng review)
- List the 3 highest-risk edge cases the plan doesn't address.
- For each, propose a mitigation and auto-include it in the plan.

**Test Coverage**
- Classify what needs unit, integration, and e2e tests.
- Flag anything untestable as designed and auto-apply the Testability principle to redesign it.

**Performance**
- Check for N+1 risks, blocking operations, memory concerns.
- Auto-apply the simplest fix. Only escalate if the fix requires a significant architectural change.

### Step 5 — Collect Taste Decisions

Compile all items flagged as taste decisions throughout Steps 2–4. These are decisions where:
- Both options are architecturally valid
- The right answer depends on the user's preferences, values, team norms, or future plans
- The 6 principles do not clearly favor one option

Format each taste decision as:

> **[TD-N] Short label**
> Option A: [description] — [tradeoff]
> Option B: [description] — [tradeoff]
> My lean: [which option and why, if you have a preference]

### Step 6 — Final Approval Gate

Present everything in one consolidated output:

---

**Autoplan Review Complete**

**What I found (Office Hours)**
[2–3 sentences: the real problem being solved, the top risk, and the key unvalidated assumption]

**Strategic recommendation (CEO Review)**
[The single highest-leverage change from a product perspective]

**Deferred scope** (not in v1):
[Bulleted list of things cut, with rationale]

**Architecture decisions made automatically**
[Bulleted list of decisions resolved using the 6 principles — one line each, e.g., "Used REST over GraphQL (Simplicity Wins — no complex nested queries required)"]

**Engineering changes incorporated**
[Bulleted list: edge case mitigations added, test requirements, performance fixes]

**The reviewed plan**
[Paste the full plan with all changes from the review incorporated inline]

---

**Taste Decisions — Your Input Needed**

[List each taste decision using the TD-N format from Step 5]

[If there are no taste decisions:]
> No taste decisions found. The 6 principles resolved everything. Ready to proceed.

---

After the user resolves the taste decisions, incorporate their answers and produce the **Final Plan Document**:

**Final Plan**

[The complete, implementation-ready plan with all decisions locked in. Organized as: Overview → Components → Data Flow → Test Plan → Performance Notes → Deferred Scope]

State: "This plan is locked. You can start coding."
