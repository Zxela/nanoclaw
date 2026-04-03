---
name: setup-quality-gates
description: "[haiku] Set up Claude Code hooks for automatic lint, typecheck, and auto-format enforcement"
model: haiku
color: orange
---

# Setup Quality Gates Skill

## Reference Materials

- Hook scripts: `scripts/homerun-pre-commit.sh`, `scripts/homerun-auto-lint.sh`
- Hooks configuration: `references/hooks-configuration.md`
- Auto-registered hooks: `hooks/hooks.json`

## Overview

You are a **setup agent**. Your job: verify that quality gate hooks are active and explain what they enforce automatically on every commit — without any agent needing to remember to run them.

**Hooks are auto-registered** via `hooks/hooks.json` when the homerun plugin is installed. There is no manual configuration in `.claude/settings.json` required.

This skill is **idempotent**. Safe to run multiple times. It detects what quality tools are available and verifies hooks are working.

**Model Selection:** Haiku — this is mechanical detection and verification, no reasoning needed.

**Announce at start:** "I'm verifying quality gate hooks for this project."

---

## Input Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "project_path": {
      "type": "string",
      "description": "Path to the target project root. Defaults to cwd."
    }
  }
}
```

---

## What Each Hook Does

The homerun plugin auto-registers these quality gate hooks via `hooks/hooks.json`:

| Hook Event | Trigger | What It Does |
|---|---|---|
| **PreToolUse (Bash)** | Before any `git commit` or `git push` command | Runs lint + typecheck; blocks the commit if either fails |
| **PostToolUse (Edit\|Write)** | After every file edit or write | Auto-lints/formats the modified file |

These hooks run via `hooks/run-hook.cmd` and delegate to the appropriate scripts in `scripts/`.

---

## Process

### Step 1: Detect Quality Tools

Identify what quality tools the project uses. Check in this order:

```bash
cd "$PROJECT_PATH"

echo "=== Detecting quality tools ==="

# Lint detection
LINT="none"
if [ -f package.json ] && jq -e '.scripts.lint' package.json >/dev/null 2>&1; then
  LINT="package-script"
  echo "Lint: package.json 'lint' script"
elif [ -f biome.json ] || [ -f biome.jsonc ]; then
  LINT="biome"
  echo "Lint: Biome"
elif [ -f eslint.config.js ] || [ -f eslint.config.mjs ] || [ -f .eslintrc.js ] || [ -f .eslintrc.json ]; then
  LINT="eslint"
  echo "Lint: ESLint"
elif [ -f pyproject.toml ] && grep -q 'ruff' pyproject.toml; then
  LINT="ruff"
  echo "Lint: Ruff"
fi

# Typecheck detection
TYPECHECK="none"
if [ -f package.json ] && jq -e '.scripts.typecheck // .scripts["type-check"] // .scripts["check-types"]' package.json >/dev/null 2>&1; then
  TYPECHECK="package-script"
  echo "Typecheck: package.json script"
elif [ -f tsconfig.json ]; then
  TYPECHECK="tsc"
  echo "Typecheck: TypeScript (tsc)"
elif command -v mypy &>/dev/null && [ -f pyproject.toml ]; then
  TYPECHECK="mypy"
  echo "Typecheck: mypy"
fi

# Formatter detection (for auto-lint hook)
FORMATTER="none"
if [ -f biome.json ] || [ -f biome.jsonc ]; then
  FORMATTER="biome"
elif [ -f .prettierrc ] || [ -f .prettierrc.js ] || [ -f .prettierrc.json ]; then
  FORMATTER="prettier"
fi
```

**If both LINT and TYPECHECK are "none":** Report that no quality tools were detected. Suggest the user install a linter/typechecker and re-run. Exit.

### Step 2: Detect Existing Git Hook Frameworks

Before verifying Claude Code hooks, check if the project already uses a git hook framework:

```bash
cd "$PROJECT_PATH"

echo "=== Detecting git hook frameworks ==="

HOOK_FRAMEWORK="none"

# Check for husky (JS/TS)
if [ -d .husky ] || ([ -f package.json ] && jq -e '.devDependencies.husky // .dependencies.husky' package.json >/dev/null 2>&1); then
  HOOK_FRAMEWORK="husky"
  echo "Hook framework: husky detected"

# Check for pre-commit (Python)
elif [ -f .pre-commit-config.yaml ]; then
  HOOK_FRAMEWORK="pre-commit"
  echo "Hook framework: pre-commit detected"

# Check for custom hooks
elif [ -x .git/hooks/pre-commit ]; then
  HOOK_FRAMEWORK="custom"
  echo "Hook framework: custom .git/hooks/pre-commit detected"
fi

echo "Result: $HOOK_FRAMEWORK"
```

**If no framework found:** Offer to install one (with user confirmation — never install silently):

| Project Type | Recommended Framework | Install Command |
|---|---|---|
| JS/TS (package.json) | `husky` + `lint-staged` | `npx husky init && npm i -D lint-staged` |
| Python (pyproject.toml) | `pre-commit` with ruff/mypy | `pip install pre-commit && pre-commit install` |
| Other | Direct `.git/hooks/pre-commit` script | Write script manually |

**If framework found:** Report it. The Claude Code hooks complement git hooks — they enforce quality at the LLM tool level, while git hooks enforce at the git level.

### Step 3: Verify Hooks Are Active

The quality gate hooks are auto-registered by the homerun plugin. Verify the hook scripts are reachable:

```bash
echo "=== Verifying homerun hooks ==="

# Check the hook runner exists
if [ -x "$CLAUDE_PLUGIN_ROOT/hooks/run-hook.cmd" ]; then
  echo "Hook runner: OK ($CLAUDE_PLUGIN_ROOT/hooks/run-hook.cmd)"
else
  echo "ERROR: Hook runner not found at $CLAUDE_PLUGIN_ROOT/hooks/run-hook.cmd"
fi

# Check individual hook scripts
if [ -x "$CLAUDE_PLUGIN_ROOT/scripts/homerun-pre-commit.sh" ]; then
  echo "Pre-commit script: OK"
else
  echo "WARNING: homerun-pre-commit.sh not found"
fi

if [ -x "$CLAUDE_PLUGIN_ROOT/scripts/homerun-auto-lint.sh" ]; then
  echo "Auto-lint script: OK"
else
  echo "WARNING: homerun-auto-lint.sh not found"
fi

# Dry-run the pre-commit script (should exit 0 when not intercepting a commit)
echo '{"tool_input":{"command":"git status"},"cwd":"'$PROJECT_PATH'"}' | \
  "$CLAUDE_PLUGIN_ROOT/scripts/homerun-pre-commit.sh"
echo "Pre-commit hook dry-run: OK (exit $?)"
```

**If CLAUDE_PLUGIN_ROOT is not set:** Inform the user that the homerun plugin may not be loaded. The hooks auto-register when the plugin is active — no manual settings.json edits are needed.

### Step 4: Report

```
Quality gates are active (auto-registered by homerun plugin):

✓ Pre-commit gate: lint + typecheck before every git commit/push
  - Lint: <detected tool>
  - Typecheck: <detected tool>
✓ Auto-lint: format files on every Edit/Write
  - Formatter: <detected tool or "none detected">

Hook scripts verified at: $CLAUDE_PLUGIN_ROOT/hooks/run-hook.cmd

No manual configuration in .claude/settings.json is required.
```

---

## Output Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "status"],
  "properties": {
    "signal": { "const": "QUALITY_GATES_CONFIGURED" },
    "status": { "enum": ["verified", "hooks_missing", "no_tools_found"] },
    "tools_detected": {
      "type": "object",
      "properties": {
        "lint": { "type": "string" },
        "typecheck": { "type": "string" },
        "formatter": { "type": "string" }
      }
    },
    "hooks_verified": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

### Example Output

```json
{
  "signal": "QUALITY_GATES_CONFIGURED",
  "status": "verified",
  "tools_detected": {
    "lint": "biome",
    "typecheck": "tsc",
    "formatter": "biome"
  },
  "hooks_verified": ["pre-commit", "auto-lint"]
}
```

---

## Exit Criteria

- [ ] Quality tools detected (or reported as missing)
- [ ] Hook runner script confirmed reachable at `$CLAUDE_PLUGIN_ROOT/hooks/run-hook.cmd`
- [ ] Dry-run verification passed
- [ ] Signal emitted

---

## Integration

**Called by:**
- **using-git-worktrees** — After worktree setup, verify hooks are active
- **team-lead** — At start of orchestration, ensure gates are in place
- Manual invocation at any time

**Pairs with:**
- **quality-check** — Quality-check runs the full 5-phase pipeline; this skill ensures the deterministic phases (1 & 2) run automatically via hooks
- **finishing-a-development-branch** — Tests verified before merge; hooks ensure lint/types were checked at every commit along the way
