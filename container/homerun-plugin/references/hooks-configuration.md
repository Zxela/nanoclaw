# Hooks Configuration Reference

Homerun's hooks auto-register via `hooks/hooks.json` when the plugin is installed. No manual configuration in `.claude/settings.json` is needed.

## Registered Hooks

### PreToolUse — Quality gate on git commit/push

**Matcher:** `Bash`
**Script:** `scripts/homerun-pre-commit.sh`

Intercepts `git commit` and `git push` commands. Runs the project's lint and typecheck tools first. Blocks with exit 2 if either fails, providing error output on stderr for Claude to fix.

Auto-detects quality tools in this order:
1. `package.json` scripts (`lint`, `typecheck`, `type-check`, `check-types`)
2. Config files (biome.json, eslint.config.js, tsconfig.json, pyproject.toml)
3. CLI tools (ruff, mypy)

### PostToolUse — Auto-lint after file edits

**Matcher:** `Edit|Write`
**Script:** `scripts/homerun-auto-lint.sh`

Runs linter with auto-fix after every Edit/Write operation. Non-blocking (always exit 0). Skips non-source files (markdown, JSON, YAML, lock files).

### WorktreeCreate — Worktree initialization

**Script:** `scripts/homerun-worktree-setup.sh`

Initializes new worktrees created for implementer agents. Only runs for branches starting with `create/`.

### SubagentStop — Post-implementation progress tracking

**Matcher:** `implementer`
**Script:** `scripts/homerun-post-implement.sh`

Logs progress after an implementer finishes. Runs feedback aggregation to extract rejection patterns for session-wide learning.

### TaskCompleted — Implementation validation gate

**Script:** `scripts/homerun-task-completed.sh`

Validates implementation before marking a native task as complete. Blocks completion (exit 2) if validation fails.

**Note:** The TaskCompleted hook event only fires when Claude Code's Agent Teams feature is active (native `Task()` dispatching). The hook is always registered but has no effect in environments without Agent Teams — it simply never triggers.

## Standalone Quality Scripts

These scripts are not registered as hooks but can be called directly or by other hooks:

- `scripts/homerun-quality-lint.sh` — Run lint with auto-fix (auto-detects: package.json scripts, biome, eslint, prettier, ruff)
- `scripts/homerun-quality-typecheck.sh` — Run type checking (auto-detects: package.json scripts, tsc --noEmit, mypy)
- `scripts/homerun-validate-dag.sh` — Pure algorithmic DAG validation

## Overriding Hooks

To disable or override an auto-registered hook, add your own entry for the same event in `.claude/settings.json`. Project-level settings take precedence over plugin hooks.

## Hook Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success — proceed normally |
| 1 | Error — log but don't block |
| 2 | Block — prevent the action (PreToolUse and TaskCompleted). stderr is fed back to Claude as feedback. |

## Environment Variables

Hooks receive these environment variables from Claude Code:

| Variable | Description |
|----------|-------------|
| `CLAUDE_PROJECT_DIR` | The project root directory |
| `CLAUDE_PLUGIN_ROOT` | The plugin's root directory (for plugin-bundled scripts) |
| `CLAUDE_WORKTREE_PATH` | Path to the worktree being operated on |
| `CLAUDE_AGENT_NAME` | Name of the agent that triggered the hook |
| `CLAUDE_TASK_ID` | ID of the native task (TaskCompleted only) |
