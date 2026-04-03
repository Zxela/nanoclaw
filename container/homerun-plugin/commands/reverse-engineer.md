---
name: reverse-engineer
description: "Generate specification documents (PRD, ADR, TECHNICAL_DESIGN) from an existing codebase. Use when inheriting a project or documenting undocumented code."
argument-hint: "[<project-path>] [--scope full|module|feature] [--target <name>]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, MultiEdit, Skill, Task
---

# /reverse-engineer Command

Analyze an existing codebase and generate specification documents that describe what already exists.

## Usage

```
/reverse-engineer [project-path] [options]
```

## Arguments

- `project-path`: Path to the project root (defaults to current directory)
- `--scope`: Analysis scope — `full` (default), `module`, or `feature`
- `--target`: For module/feature scope, the specific directory or feature name

## Workflow

### 1. Validate Project

```bash
PROJECT_PATH="${1:-.}"
cd "$PROJECT_PATH"

# Verify it's a code project
ls package.json pyproject.toml Cargo.toml go.mod 2>/dev/null || echo "Warning: No recognized project file"

# Check git status
git status 2>/dev/null || echo "Warning: Not a git repository"
```

### 2. Invoke Reverse Engineering Agent

```javascript
Task({
  description: "Reverse-engineer codebase specs",
  subagent_type: "reverse-engineer",
  prompt: `Generate specs from this codebase.

  Project root: ${projectPath}
  Scope: ${scope || "full"}
  Target: ${target || "entire project"}`
});
```

### 3. Present Results

```
## Reverse Engineering Complete

Generated documents:
  PRD.md          → /home/user/.claude/homerun/a1b2c3d4/myapp-reverse-engineered/PRD.md
  ADR.md          → /home/user/.claude/homerun/a1b2c3d4/myapp-reverse-engineered/ADR.md
  TECHNICAL_DESIGN.md → /home/user/.claude/homerun/a1b2c3d4/myapp-reverse-engineered/TECHNICAL_DESIGN.md

Coverage:
  Files analyzed: 45
  Components identified: 8
  Data models extracted: 5
  API endpoints found: 12

Confidence:
  Architecture: high
  Data models: high
  API contracts: medium
  Business logic: medium

Would you like to:
1. Review the generated documents
2. Use these specs to plan new work (/plan)
3. Done
```

### 4. Optional: Bridge to /create

If the user wants to modify the project based on reverse-engineered specs:
- Copy specs to a new homerun session
- Initialize state.json
- Transition to planning phase

## Examples

```
/reverse-engineer
/reverse-engineer ~/projects/legacy-api
/reverse-engineer --scope module --target src/auth/
/reverse-engineer --scope feature --target authentication
```
