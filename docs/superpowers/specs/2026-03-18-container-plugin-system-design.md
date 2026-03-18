# Container Plugin System Design

**Date:** 2026-03-18
**Status:** Draft

## Problem

Container agents currently get a fixed set of manually curated skills baked into the image. Adding new skills (like superpowers) requires manually copying SKILL.md files into `container/skills/`. There's no way for the agent to load skills on-demand based on task context, and no integration with the Claude Code plugin marketplace.

## Goals

1. Container agents can access marketplace plugins (superpowers, etc.) without manual curation
2. Groups get a relevant subset of skills pre-loaded based on category tags
3. Agents can discover and activate additional skills mid-session from a catalog
4. Container image remains self-contained (no host mounts for skills at runtime)
5. Lean by default — agents only load what they need

## Design

### Skill Catalog Structure

All skills (local + marketplace) are organized into a catalog baked into the image:

```
/skills-catalog/
  catalog.json
  local/
    agent-browser/SKILL.md
    openscad/SKILL.md
    materials-simulation-skills/...
  plugins/
    superpowers/
      brainstorming/SKILL.md
      test-driven-development/SKILL.md
      systematic-debugging/SKILL.md
      ...
    other-plugin/
      ...
```

### Catalog Index

`catalog.json` is auto-generated at build time from SKILL.md frontmatter merged with category overrides:

```json
{
  "skills": [
    {
      "name": "brainstorming",
      "source": "plugin:superpowers",
      "description": "Explore ideas before implementation",
      "categories": ["coding", "creative"],
      "path": "/skills-catalog/plugins/superpowers/brainstorming"
    },
    {
      "name": "agent-browser",
      "source": "local",
      "description": "Browser automation with Playwright",
      "categories": ["coding", "general"],
      "path": "/skills-catalog/local/agent-browser"
    }
  ]
}
```

### Category System

Skills are tagged with categories via `container/skill-categories.json`:

```json
{
  "defaults": ["general"],
  "overrides": {
    "brainstorming": ["coding", "creative"],
    "test-driven-development": ["coding"],
    "systematic-debugging": ["coding"],
    "agent-browser": ["coding", "general"],
    "openscad": ["coding", "engineering"]
  }
}
```

Skills not listed in overrides receive the `defaults` categories.

### Build Step

`container/build.sh` gains a pre-build phase:

1. **`container/sync-plugins.sh`** — scans `~/.claude/plugins/cache/` for installed marketplace plugins. The cache uses a versioned structure (`{org}/{plugin}/{version}/skills/`). The script selects the highest semver version for each plugin, then finds all directories containing a `SKILL.md` and copies them into `container/skills-catalog/plugins/{plugin-name}/`, flattening the org/version nesting. If `~/.claude/plugins/cache/` does not exist or is empty, the script succeeds with no plugins synced (local-only catalog).

2. **`container/generate-catalog.ts`** — recursively finds all `SKILL.md` files under `container/skills-catalog/`. For each, extracts YAML frontmatter (`name`, `description`; falls back to directory name if frontmatter is missing). Merges with category tags from `container/skill-categories.json`. Writes `container/skills-catalog/catalog.json`. For multi-skill packages (like `materials-simulation-skills`), each `SKILL.md` gets its own catalog entry with its full path.

3. **Dockerfile** — `COPY skills-catalog/ /skills-catalog/` replaces the current skills copy.

The existing `container/skills/` directory becomes `container/skills-catalog/local/` (local skills that aren't from marketplace plugins).

### Launch-Time Activation

`container-runner.ts` replaces its current skill sync logic (lines 166-176) with category-aware selection:

1. Read `container/skills-catalog/catalog.json` (the host-side build artifact)
2. Read the group's `skills` tags from the DB (defaults to `["general"]`)
3. Filter catalog entries to those matching any of the group's categories
4. Copy matched skill directories into `data/sessions/{group}/.claude/skills/`

This is the same copy mechanism as today, just with smarter selection.

### Group Configuration

The `registered_groups` table gets a `skills` TEXT column storing a JSON array of category tags:

```sql
ALTER TABLE registered_groups ADD COLUMN skills TEXT DEFAULT '["general"]'
```

```json
["coding"]
```

Default: `["general"]`. Set via group registration or manual DB update. The main group could default to `["coding", "general"]`. The `RegisteredGroup` type in `types.ts` gains an optional `skills?: string[]` field.

### Agent On-Demand Activation

The container CLAUDE.md includes:

```markdown
## Skills Catalog

You have a catalog of available skills at `/skills-catalog/catalog.json`.
Skills matching this group's categories are pre-loaded in `~/.claude/skills/`.

If you need a skill that isn't pre-loaded, activate it:

    cp -r /skills-catalog/<path> ~/.claude/skills/<skill-name>

Check the catalog first to see what's available. Only activate skills
you actually need for the current task.
```

No new MCP tools required. The agent uses existing Bash access to copy from the catalog. Claude Code auto-discovers skills in `~/.claude/skills/`.

## Changes Summary

| Component | Change |
|-----------|--------|
| `container/skill-categories.json` | New — category tags per skill |
| `container/sync-plugins.sh` | New — copies marketplace plugins into catalog |
| `container/generate-catalog.ts` | New — generates catalog.json from SKILL.md frontmatter + categories |
| `container/build.sh` | Calls sync + generate before Docker build |
| `container/Dockerfile` | `COPY skills-catalog/ /skills-catalog/` replaces current skills copy |
| `src/container-runner.ts` | Category-filtered skill copy replaces current blanket copy |
| `src/db.ts` | `skills` column on groups table (JSON text array) |
| Container CLAUDE.md | Skills catalog instructions for agent |
| `container/skills/` | Moves to `container/skills-catalog/local/` |

## What Doesn't Change

- MCP tools and IPC protocol
- Channel system
- Agent-runner SDK invocation
- Security model (container isolation, path validation)
- Per-group session/settings directories

## Security Considerations

- Skills catalog is read-only inside the container (baked into image)
- Agent can only copy from catalog to its own `~/.claude/skills/` — no write access to catalog
- No new network access or host mounts introduced
- Category filtering is advisory (agent can still activate any skill from catalog via Bash) — this is acceptable since the agent already has full Bash access inside the container

## Design Decisions

- **Categories in v1 vs defer:** Categories are included because they keep agent context lean — fewer pre-loaded SKILL.md files means less system prompt content for Claude to process. This matters even at current scale (~16 skills), since each SKILL.md can be substantial. The on-demand activation mechanism works independently of categories, so the two concerns are cleanly separated.
- **Host-side catalog.json:** `container-runner.ts` reads the catalog from `container/skills-catalog/catalog.json` on the host (the build artifact). No need to extract from the Docker image.
- **TypeScript for generate-catalog:** Consistent with the rest of the project's toolchain.
- **Graceful degradation:** If no marketplace plugins are installed, the build produces a catalog with only local skills. If a group has no `skills` column value, it defaults to `["general"]`.
