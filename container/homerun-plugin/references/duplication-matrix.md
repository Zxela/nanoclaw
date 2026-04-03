# Similar Function Duplication Matrix

> Decision framework for when to reuse vs. create new. Check during implement similar-function discovery step.

## 5 Similarity Dimensions

When you find a function that looks similar to what you're about to write, score it:

| # | Dimension | Match? |
|---|-----------|--------|
| 1 | **Same domain/responsibility** | Does it serve the same business concept? |
| 2 | **Same input/output pattern** | Same parameter types and return shape? |
| 3 | **Same processing logic** | Does it do the same transformations? |
| 4 | **Same architectural layer** | Same level (handler/service/repo/util)? |
| 5 | **Similar naming** | Would a developer expect them to be the same? |

## Escalation Decision

| Matches | Action |
|---------|--------|
| **3+** | **Escalate** — likely duplication, reuse or refactor |
| **2** | **Escalate if** domain+processing OR input+processing match |
| **≤1** | **Continue** — coincidental similarity |

## Gray Zone Guidelines

These distinctions help when the decision isn't obvious:

| Situation | Minor (continue) | Major (escalate) |
|-----------|-------------------|-------------------|
| Adding a parameter | Appending optional param at end | Inserting required param, changing signature |
| Optimization | Same layer, better algorithm | Crosses layer boundaries |
| Type change | `unknown` → concrete type (narrowing) | Changing types defined in design doc |
| Similarity | Simple CRUD with same shape | Same business logic + same structure |

## Iron Rule

> When objectively undeterminable, escalate. The cost of a false escalation is a 30-second review. The cost of silent duplication is permanent tech debt.
