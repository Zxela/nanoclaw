---
name: diagnose
description: "Investigate a bug or unexpected behavior through the 3-phase evidence pipeline. Use when you need structured diagnosis, not quick fixes."
argument-hint: "\"<problem description>\" [--file <path>] [--error <message>]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, MultiEdit, Skill, Task
---

# /diagnose Command

Launch a structured diagnostic investigation for a bug or unexpected behavior. Uses the 3-phase evidence pipeline: investigate, verify, solve.

## Usage

```
/diagnose "problem description" [options]
```

## Arguments

- `problem`: Description of the bug or unexpected behavior (required)
- `--file <path>`: File where the issue manifests
- `--error <message>`: Error message or stack trace
- `--type <type>`: Problem type (test_failure, runtime_bug, build_failure, performance, integration_issue)

## Workflow

### 1. Gather Context

```bash
# Check if we're in a homerun worktree
if [ -f state.json ]; then
  WORKTREE_PATH=$(pwd)
  SPEC_PATHS=$(jq '.spec_paths' state.json)
fi

# Get recent changes for context
git log --oneline -10
git diff HEAD~3..HEAD --stat
```

### 2. Invoke Diagnostic Agent

```javascript
Task({
  description: "Diagnose bug",
  subagent_type: "diagnostician",
  prompt: `Investigate the following problem:

  ${JSON.stringify({
    problem: {
      description: problemDescription,
      type: problemType || "unknown",
      error_message: errorMessage,
      file: filePath,
      what_changed: recentChanges
    },
    worktree_path: worktreePath,
    spec_paths: specPaths
  })}
  `
});
```

### 3. Present Results

Display the diagnosis report:

```
## Diagnosis Report

**Root Cause:** Validation middleware strips password field before auth service
**Confidence:** High (3 pieces of evidence)

**Evidence:**
1. validation.ts:23 deletes req.body.password (src/middleware/validation.ts:23)
2. git diff shows validation change in task 003 (git log)
3. Test with password field present passes (manual test)

**Recommended Fix:** Remove password from stripped fields list
  Type: Direct fix
  Files: src/middleware/validation.ts
  Risk: Low

Apply recommended fix? [Y/n]
```

### 4. Optional: Apply Fix

If user approves, create a fix task or apply directly:
- For homerun worktrees: Add as a bug_fix task to tasks.json
- For standalone use: Apply fix and run tests

## Examples

```
/diagnose "User registration returns 500 error"
/diagnose "Tests fail after adding validation" --file src/middleware/validation.ts
/diagnose "Build fails with type error" --type build_failure --error "TS2345: Argument of type 'string' is not assignable"
```
