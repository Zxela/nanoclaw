---
name: design-shotgun
description: Generate 3-5 distinct design variants simultaneously, then compare tradeoffs and recommend one. Use when asked to "shotgun this", "design shotgun", "give me variants", "explore approaches", "show me options", "what are the ways to do this", "brainstorm designs".
categories: ["general", "coding", "engineering"]
---

# Design Shotgun

Multi-variant design exploration. Generate 3-5 clearly distinct approaches to a problem simultaneously, then compare tradeoffs side by side before committing to one direction.

## When to Use

- Exploring product features or UI/UX decisions
- Architecture or system design choices
- API design (endpoint shape, auth model, pagination strategy)
- Naming (functions, tables, routes, features)
- Any decision where multiple valid approaches exist and you want to see them before committing

Trigger phrases: "shotgun this", "design shotgun", "give me variants", "explore approaches", "show me options", "what are the ways to do this", "brainstorm designs".

## Steps

### 1. Understand the design space

Before generating variants, clarify:
- What exactly is being designed?
- Who is it for (users, developers, ops)?
- What hard constraints exist (tech stack, deadlines, existing systems)?
- What does success look like?

If the request is ambiguous, ask one targeted question rather than a list of questions. Then proceed.

### 2. Generate 3-5 distinct variants

Each variant must be **genuinely different** — not minor tweaks of the same idea. Aim for variants that make different core bets. Give each a memorable label (e.g., "The Monolith", "The Pipeline", "The Event-Driven Approach").

Minimum 3 variants. Maximum 5. Stop at 3-4 if the design space is narrow.

### 3. Describe each variant

For each variant, write:

```markdown
## Variant N: {Label}

**Approach** — What it looks like or how it works. Be concrete: show pseudocode, component names, screen layouts, or API shapes as appropriate.

**Key bets** — What assumptions this variant relies on being true. If those bets are wrong, this variant fails.

**Strengths** — Where this approach shines. Be specific.

**Weaknesses** — Where this breaks down or costs you something. Be honest.
```

Format guidance by design type:
- **Code / architecture**: show pseudocode or a component/module diagram
- **UI / product**: describe layout, key interactions, and the critical screens
- **API**: show a sample request and response for the main use case
- **Naming / conceptual**: show usage examples in context

### 4. Render mockups (UI designs only)

If the variants are UI or visual designs, invoke the `visual-explainer` skill to render an HTML mockup of each variant. Pass each variant's description as the prompt. Send the rendered images to chat alongside the text writeup.

### 5. Comparison matrix

Produce a grid of variants vs. evaluation criteria. Choose criteria relevant to the design space. Common ones:

| Criterion | Variant 1 | Variant 2 | Variant 3 |
|-----------|-----------|-----------|-----------|
| Simplicity | High | Medium | Low |
| Scalability | Low | High | Medium |
| Time to build | Fast | Slow | Medium |
| User delight | Low | High | Medium |
| Reversibility | Hard to change | Easy to swap out | Moderate |

Use qualitative ratings (High/Medium/Low or Good/OK/Poor). Do not use numbers — false precision undermines the exercise.

### 6. Make a recommendation

**Always give an explicit recommendation.** Do not hedge. State:

- Which variant (or which hybrid combination) you recommend
- The single most important reason why
- What would change your recommendation (i.e., under what conditions a different variant wins)

```markdown
## Recommendation

**Go with Variant 2: {Label}.**

{One to three sentences explaining the core reason.}

If {condition changes}, reconsider Variant 3 instead.
```

### 7. Invite a decision

End by asking the user to:
- Pick a variant to proceed with
- Ask follow-up questions about any variant
- Request a deeper dive on one option

Do not proceed to implementation until the user makes a choice.

## Notes

- Resist the urge to make one variant obviously superior. If all variants except one are strawmen, the exercise has no value. Steel-man each approach.
- If the user already has a preferred direction, still generate the full set — the goal is to surface tradeoffs they may not have considered.
- For small decisions (e.g., naming a variable), 3 variants is enough. Reserve 5 variants for genuinely open-ended design spaces.
