# Red Flag Anti-patterns

> Quick checklist for implementers during refactor steps. If any flag triggers, fix before moving on.

## Detection Criteria

| Flag | Symptom | Action |
|------|---------|--------|
| **Rule of Three** | Same/similar code in 3+ places | Extract shared abstraction |
| **SRP Violation** | File/function has multiple responsibilities | Split by responsibility |
| **DRY Violation** | Same content maintained in multiple files | Single source of truth |
| **Error Suppression** | Empty catch blocks, swallowed errors | Fail-fast or handle explicitly |
| **Excessive `as`** | 3+ type assertions in a function | Redesign with type guards or generics |
| **Commented-out Code** | Disabled code via comments | Delete it — git has history |
| **"Make it work" Code** | TODOs, hardcoded values, shortcuts | Fix now or create tracked task |
| **Patchwork** | Fix layered on fix without addressing structure | Refactor the underlying design |
| **Symptomatic Fix** | Fixes the symptom, not the root cause | Apply 5 Whys (see `five-whys.md`) |

## Rule of Three Decision

```
1st occurrence: Inline (pattern unclear)
2nd occurrence: Note it, continue (pattern emerging)
3rd occurrence: Extract and commonalize (pattern confirmed)
```

**False commonalization guards** — do NOT extract if:
- Code is coincidentally similar but evolves independently
- Abstraction would reduce readability
- Domains are unrelated (accidental match)
- It's simple test setup (OK to duplicate)

## Unused Code Rule

- Will it be used in this task? **Yes** → implement now
- Will it be used in this task? **No** → delete it (git has history)
- "Might need it later" → delete it (YAGNI)
