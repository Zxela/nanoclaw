# Milestone 1: Skill Self-Authoring

The agent can identify skill gaps, author new skills, and open PRs to the NanoClaw repo. The existing review (user merges PR) and delivery (auto-deploy) pipelines handle approval and deployment. This is the first closed loop of self-modification.

## Context

NanoClaw's skills catalog has 56 local skills and 80 plugin skills. Skills are markdown files (`SKILL.md`) with optional supporting code, loaded into containers at launch via `copySkillsForGroup()`. Today, skills are authored by humans and committed manually. The agent has all the pieces to do this itself — it just needs the awareness, structure, and instructions.

### What exists

- **Skills catalog**: `container/skills-catalog/catalog.json` indexes all skills. Local skills live in `container/skills-catalog/local/{name}/`.
- **Skill format**: Each skill is a directory with `SKILL.md` (frontmatter: name, description) and optional supporting files (Python scripts, configs).
- **Agent tooling**: Main group container has `/workspace/project/` (read-only project root), `gh` CLI, git, and full coding capability.
- **PR workflow**: Agent can create branches and open PRs to Zxela/nanoclaw. User reviews and merges.
- **Auto-deploy**: Systemd timer polls origin/main every 2 min. On new commits: pull, build, rebuild container, restart. Skills become live in the next container launch.

### What's missing

1. **Instructions** telling the agent when and how to author skills
2. **Validation** ensuring authored skills have correct structure
3. **Catalog update** — new skills need a `catalog.json` entry
4. **Branch hygiene** — skills PRs should use consistent branch naming

## Design

### Scope: main group only

Only the main group agent (`discord_main`, `isMain: true`) can author skills. It has the project root mounted and gh CLI access. Non-main groups cannot see the codebase. This is a v1 constraint, not a permanent one.

### Trigger: user-prompted

In v1, the agent creates skills when the user asks — either directly ("create a skill for X") or implicitly ("I keep having to explain how to do X, can you make that automatic?"). Autonomous self-reflection (agent notices a gap on its own) is deferred to Milestone 2.

### Skill authoring flow

```
User requests skill → Agent writes skill files → Agent validates structure
→ Agent updates catalog.json → Agent opens PR → User reviews & merges
→ Auto-deploy pulls, rebuilds, restarts → Skill live in next container
```

#### Step 1: Author the skill

Agent creates a new directory under `container/skills-catalog/local/{skill-name}/` containing:

- **`SKILL.md`** (required): Frontmatter with `name` and `description`, followed by markdown content. The description must be specific enough that the skill system can match it to user requests.
- **Supporting files** (optional): Python scripts, configs, templates — anything the skill references.

The agent should follow the patterns of existing local skills (e.g., `market-data`, `fundamental-analysis`, `notion`) for structure and style.

#### Step 2: Validate structure

Before committing, the agent checks:

1. `SKILL.md` exists and has valid frontmatter (`name`, `description` fields)
2. Skill name uses kebab-case, no spaces
3. No name collision with existing skills in `catalog.json`
4. Supporting files referenced in `SKILL.md` actually exist in the directory
5. If the skill includes a Python script, it parses without syntax errors (`python3 -c "import ast; ast.parse(open('file.py').read())"`)

#### Step 3: Update catalog

Agent adds an entry to `catalog.json`:

```json
{
  "name": "skill-name",
  "source": "local",
  "description": "Same description as SKILL.md frontmatter",
  "categories": ["general"],
  "path": "/skills-catalog/local/skill-name"
}
```

Categories should match the skill's audience: `general` (all groups), `coding` (dev-focused groups), `creative`, `engineering`. Multiple categories are supported.

#### Step 4: Open PR

Agent creates a branch `feat/skill-{name}` and opens a PR to Zxela/nanoclaw with:

- **Title**: `feat: add {name} skill — {one-line description}`
- **Body**: What the skill does, why it's useful, example usage, which group categories it targets
- **Files changed**: The new skill directory + `catalog.json` update

#### Step 5: User reviews

Standard PR review. User can request changes (agent addresses them on the branch), approve, or close. No new approval mechanism needed.

#### Step 6: Auto-deploy

On merge to main, the systemd timer (2-min poll) picks up the change, pulls, rebuilds the container image, and restarts. Any container launched after restart will include the new skill (if the group's categories match).

### Instructions to the agent

The main group's `CLAUDE.md` (or the global CLAUDE.md loaded by all main containers) needs a section teaching the agent how to author skills. This is the key deliverable — the agent needs to know:

1. **When** to create a skill: user asks, or user repeatedly explains the same workflow
2. **Where** skill files go: `container/skills-catalog/local/{name}/`
3. **What** a valid skill looks like: frontmatter format, supporting files pattern
4. **How** to validate: the 5 checks above
5. **How** to publish: catalog.json update, branch naming, PR format
6. **What good descriptions look like**: specific trigger phrases, not vague summaries

This should be written as a skill itself — a meta-skill for skill authoring, loaded into the main group's container. The agent can reference it when creating new skills.

### The meta-skill

A new skill `skill-authoring` added to `container/skills-catalog/local/skill-authoring/SKILL.md` with category `coding` (so it's available to the main group). Content:

- Step-by-step guide for creating skills
- Validation checklist
- Catalog update instructions
- PR template
- Examples of good vs bad skill descriptions
- Reference to 2–3 existing skills as templates

### Validation script (optional, recommended)

A lightweight shell script at `container/skills-catalog/validate-skill.sh` that the agent (or CI) can run:

```bash
./container/skills-catalog/validate-skill.sh local/my-new-skill
```

Checks: SKILL.md exists, frontmatter parses, name is kebab-case, no catalog collision, Python files parse. Exit 0 on success, non-zero with errors on failure.

This isn't strictly necessary (the agent can do these checks inline), but it makes the flow more reliable and testable.

## What's NOT in scope

- **Skill editing/deletion**: v1 is creation only. Editing existing skills is a future enhancement.
- **Autonomous self-reflection**: Agent doesn't independently identify skill gaps. That's Milestone 2.
- **Non-main group authoring**: Only `discord_main` can author skills. Cross-group skill requests are future work.
- **Automated testing of skills**: No throwaway container to smoke-test the skill before PR. Structure validation only.
- **Skill versioning/rollback**: Skills are just files in git. Rollback is `git revert`.

## Files changed

| File | Change |
|------|--------|
| `container/skills-catalog/local/skill-authoring/SKILL.md` | New meta-skill with authoring guide |
| `container/skills-catalog/validate-skill.sh` | New validation script |
| `container/skills-catalog/catalog.json` | Add `skill-authoring` entry |
| `groups/discord_main/CLAUDE.md` | Add pointer to skill-authoring skill |

## Success criteria

1. User says "create a skill for X" in discord_main
2. Agent writes valid skill files, updates catalog, opens PR
3. PR has correct branch naming, clear description, passes validation
4. After merge + auto-deploy, new skill is available in matching containers
5. Agent can reference the meta-skill to maintain quality across multiple skill-authoring sessions

## Risks

- **Skill quality**: Agent might write vague descriptions that don't trigger well. Mitigation: meta-skill includes examples of good vs bad descriptions; user reviews PR.
- **Catalog conflicts**: Agent might duplicate an existing skill name. Mitigation: validation checks for collisions.
- **Stale project mount**: `/workspace/project/` is read-only and reflects the state at container launch. If the catalog changed since launch, the agent might not see the latest skills. Mitigation: the PR review catches this; auto-deploy rebuilds frequently.

## Future milestones (out of scope, for context)

- **Milestone 2 — Self-Reflection Loop**: Agent reviews its own performance and proposes skills/improvements autonomously.
- **Milestone 3 — Session Registry + Heartbeat**: Centralized session management, container health checks.
- **Milestone 4 — Safe Mutation Pipeline**: Agent proposes source code changes through validated propose/test/review/PR flow.
- **Milestone 5 — Computer Use + Capability System**: Graded permissions, browser/GUI integration, approval gates.
