---
name: plan-ceo-review
description: CEO/founder-mode plan review that rethinks scope, challenges premises, and finds the 10-star product. Use when asked to "think bigger", "expand scope", "strategy review", "rethink this", "is this ambitious enough", "CEO review", "product review", or when the user is questioning the ambition or scope of a plan.
categories: ["general"]
---

# Plan CEO Review

A CEO/founder-mode plan review. The goal is not to rubber-stamp — it's to rethink the problem, find the 10-star product, and challenge every premise. This is the review that happens before engineering review, not after.

Four modes are available. The agent picks based on context or asks the user.

## Modes

**SCOPE EXPANSION** — Dream big. What would this look like if 10x more ambitious? What features are being left on the table? What adjacent problems could this also solve? Use when the plan feels conservative or when the user wants to explore the ceiling.

**SELECTIVE EXPANSION** — Hold the core scope but cherry-pick 2-3 expansions that create disproportionate value. Add what's worth it, cut what's not. Use when the plan is solid but may be leaving key leverage points on the table.

**HOLD SCOPE** — Maximum rigor. Question every assumption. Does each feature earn its complexity? Is there a simpler path to the same outcome? Use when the plan is already ambitious and needs tightening, not growing.

**SCOPE REDUCTION** — Strip to the essential core. What's the minimum that creates real value? What can ship in half the time without losing the point? Use when the plan is overbuilt, too slow to ship, or trying to do too many things.

---

## How to Use

### Step 1: Read the Plan

Look for an existing plan or spec file. Check in order:
- Any file the user has mentioned or linked
- `/workspace/group/plan.md`
- `/workspace/group/spec.md`
- `/workspace/group/design-notes.md`

If no file exists, ask the user to paste or describe the plan before proceeding.

Read the full plan before forming any opinion. Do not skim.

---

### Step 2: Pick a Mode

**Auto-detect from context:**
- User says "think bigger", "is this ambitious enough", "what are we missing" → SCOPE EXPANSION
- User says "what's worth adding", "should we expand", "any quick wins" → SELECTIVE EXPANSION
- User says "is this the right plan", "too complex", "challenge this", "is this necessary" → HOLD SCOPE
- User says "cut this down", "what's the MVP", "what can we ship faster" → SCOPE REDUCTION

**If unclear:** Ask the user directly — "Which lens do you want me to apply: expand everything, selectively expand, hold scope with rigor, or reduce to core?" Give the one-line description of each so they can choose quickly.

Do not start the review until mode is confirmed.

---

### Step 3: Run the Review

Work through the plan systematically. Think from first principles, not from the document's own framing.

**Start with the problem statement:**
- Is this solving the right problem?
- Is the stated problem the real problem, or a symptom of a deeper one?
- Who benefits, and is the plan actually designed for them?

**Then review each major component through the mode's lens:**

For **SCOPE EXPANSION:**
- What would this look like at 10x the ambition?
- What features or surfaces are obviously missing?
- What adjacent problem does this not solve, but could?
- What would make this irreplaceable vs. nice-to-have?
- What would the category-defining version of this look like?

For **SELECTIVE EXPANSION:**
- Which 2-3 additions would create disproportionate value relative to their cost?
- What is being left out that users will immediately ask for?
- What is the one insight this plan is missing that changes the category of the product?
- What should stay out, and why?

For **HOLD SCOPE:**
- Does each feature earn its complexity?
- What assumption is the plan making that hasn't been validated?
- Is there a simpler path to the same outcome?
- What would break if you removed each major component?
- What is this plan optimizing for, and is that the right thing to optimize for?

For **SCOPE REDUCTION:**
- What is the irreducible core — the minimum that still creates real value?
- What can be cut without changing the fundamental value proposition?
- What could ship in half the time?
- What are the 1-2 things that must work perfectly vs. the many things that would be nice?
- What is the version that a user would still love, even if incomplete?

---

### Step 4: Output the Review

Structure the output as follows:

**CEO Take** — 2-3 sentences on the overall assessment. Be direct. Don't hedge.

**Things to Add** (or "N/A — we are reducing scope")
- Bulleted list. For each item: what to add and why it creates disproportionate value.

**Things to Cut**
- Bulleted list. For each item: what to cut and what it costs vs. what it saves.

**Things to Rethink**
- Bulleted list. For each item: what the current assumption is, why it may be wrong, and what to explore instead.

**Revised Priority Order**
- If the plan has phases or a roadmap, suggest a reordered sequence based on the review. What ships first, and why?

**Open Questions Before Moving Forward**
- What must be answered before execution begins? No more than 3 questions.

---

### Step 5: Suggest Next Step

End with a clear handoff. Say:

"If this looks right, the next step is an engineering review to validate feasibility and estimate scope. Use the `plan-eng-review` skill for that."

If the plan changed significantly during the review, offer to write the revised plan to a file:

"Want me to write the updated plan to `/workspace/group/plan-revised.md`?"

Only write the file if the user confirms.
