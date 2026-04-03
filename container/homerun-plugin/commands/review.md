---
name: review
description: "Run spec review and quality checks on a feature branch. Use to validate specs before planning or code quality after implementation."
argument-hint: "<worktree-path> [--specs] [--quality] [--all]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, MultiEdit, Skill, Task
---

# /review Command

Run review checks on a homerun feature branch. Can review specification documents, code quality, or both.

## Usage

```
/review <worktree-path> --specs
/review <worktree-path> --quality
/review <worktree-path> --all
/review --find
```

## Arguments

- `worktree-path`: Path to a homerun worktree
- `--specs`: Run spec review only (cross-document consistency, completeness, testability)
- `--quality`: Run quality checks only (lint, types, structure, tests)
- `--all`: Run both spec review and quality checks
- `--find`: Search for existing homerun worktrees

If no mode flag is provided, default to `--all`.

## Workflow

### Spec Review (--specs or --all)

Spawns the `spec-reviewer` agent:

```javascript
Task({
  description: "Review specification documents",
  subagent_type: "spec-reviewer",
  prompt: `Review specs for consistency, completeness, and testability.

  Worktree: ${worktreePath}
  Spec paths: ${JSON.stringify(state.spec_paths)}`
});
```

### Quality Check (--quality or --all)

Detects changed files and spawns the `quality-checker` agent:

```bash
# Get files changed on this branch vs base
BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
FILES=$(git diff --name-only "$BASE"..HEAD)
```

```javascript
Task({
  description: "Run quality checks",
  subagent_type: "quality-checker",
  prompt: `Run 5-phase quality pipeline on changed files.

  Worktree: ${worktreePath}
  Files changed: ${JSON.stringify(changedFiles)}
  Fix mode: report_only`
});
```

### Report

Display combined results:

```
Spec Review: APPROVED (0 high, 1 medium, 2 low)
Quality Check: PASS (0 issues)

Ready for: planning / implementation / completion
```

## Examples

```
/review ../myapp-create-user-auth-a1b2c3d4 --specs
/review ../myapp-create-user-auth-a1b2c3d4 --quality
/review ../myapp-create-user-auth-a1b2c3d4 --all
/review --find
```
