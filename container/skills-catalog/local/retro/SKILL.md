---
name: retro
description: Run a weekly engineering retrospective. Analyzes git commit history to produce a structured report covering what shipped, hotspots, quality signals, and next-week priorities. Use when asked to "weekly retro", "what did we ship", "engineering retrospective", "sprint review", "team retrospective", "what shipped this week".
categories: ["general", "coding", "engineering"]
---

# Retro

Analyzes git commit history and work patterns to produce a structured weekly retrospective report.

## When to Use

- User asks for a "weekly retro", "sprint review", or "team retrospective"
- User asks "what did we ship this week?" or "what shipped this week?"
- User wants an "engineering retrospective" or summary of recent work

## Steps

### 1. Confirm the time range

Default: last 7 days. Ask the user if they want a different window (e.g., last 14 days, since a specific date, a sprint range).

### 2. Locate the git repo

Run from the current working directory. If no git repo is found, ask the user to specify the repo path.

```bash
git -C /path/to/repo log --since="7 days ago" --oneline --stat
```

Also pull author info for team breakdowns:

```bash
git -C /path/to/repo log --since="7 days ago" --pretty=format:"%h %an %s" --stat
```

### 3. Parse the output

Extract from the log:
- Commit messages and hashes
- Authors
- Files changed per commit
- Lines added / removed per commit

### 4. Categorize commits by theme

Group commits into buckets based on message keywords:
- **Features** — "feat", "add", "new", "implement"
- **Fixes** — "fix", "bug", "patch", "hotfix"
- **Refactors** — "refactor", "clean", "rename", "move"
- **Tests** — "test", "spec", "coverage"
- **Docs** — "doc", "readme", "changelog", "comment"
- **Infra / chore** — "chore", "ci", "deploy", "deps", "bump", "upgrade"

### 5. Identify patterns

- **Hotspots**: which files were touched most frequently across commits?
- **Instability signals**: any file changed 3+ times in the window?
- **PR size risk**: commits with large line counts (>500 lines changed) are flagged
- **Quality signals**: count commits containing "fix", "hotfix", "revert" — high counts indicate instability
- **Test coverage signal**: if no test files were committed, flag it

### 6. Per-person breakdown (if multiple authors)

If more than one author appears in the log, include a section breaking down commits, files changed, and themes per person.

### 7. Generate the report

Produce a Markdown report with these sections:

```markdown
# Engineering Retro — Week of {start_date} to {end_date}

## Shipped This Week
- Bullet list of meaningful commits (skip chores/bumps unless significant)

## By the Numbers
- Total commits: N
- Authors: N
- Files changed: N
- Lines added: +N / removed: -N
- Avg lines per commit: N

## Hotspots (Files Changed Most)
| File | Times Changed |
|------|--------------|
| path/to/file.ts | 5 |

## Quality Signals
- Fixes / hotfixes / reverts: N
- Large commits (>500 lines): N
- Test files committed: yes/no

## Per-Person Summary
(only if multiple authors)
| Author | Commits | Theme |
|--------|---------|-------|

## What Went Well
- Positive observations from the patterns (e.g., consistent test coverage, small focused commits)

## Watch Out For
- Concerns (e.g., same file touched 4x, no tests committed, 3 hotfixes in one day)

## Next Week Focus
- Suggested priorities based on what's in flight, hotspots, and open patterns
```

### 8. Save the report

Write the report to:

```
/workspace/group/retro-{YYYY-MM-DD}.md
```

Where the date is today's date (end of the retro window).

Confirm the path with the user after saving.

## Notes

- If the git log is empty for the time window, report that and ask if the window should be widened.
- Avoid listing every individual commit in "Shipped This Week" — summarize by theme where there are many.
- Be direct about quality signals. Don't soften "3 hotfixes and a revert in one week" into vague positivity.
