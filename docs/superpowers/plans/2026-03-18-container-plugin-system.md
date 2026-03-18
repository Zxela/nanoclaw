# Container Plugin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable container agents to dynamically discover and activate skills from a catalog that includes both local skills and marketplace plugins, with per-group category filtering.

**Architecture:** Build-time pipeline syncs marketplace plugins into a skills catalog, generates an index, and bakes everything into the Docker image. At container launch, `container-runner.ts` pre-loads skills matching the group's category tags. Agents can activate additional skills at runtime via `cp` from the catalog.

**Tech Stack:** Node.js/TypeScript, Bash, Docker, SQLite (better-sqlite3)

**Spec:** `docs/superpowers/specs/2026-03-18-container-plugin-system-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `container/skill-categories.json` | Category tag assignments per skill name |
| `container/sync-plugins.sh` | Copies marketplace plugin skills into catalog at build time |
| `container/generate-catalog.ts` | Scans SKILL.md files, extracts frontmatter, writes catalog.json |
| `container/skills-catalog/local/` | Local skills (moved from `container/skills/`) |
| `container/skills-catalog/plugins/` | Marketplace plugin skills (populated by sync-plugins.sh) |
| `container/skills-catalog/catalog.json` | Generated index of all available skills |
| `container/build.sh` | Updated to call sync + generate before Docker build |
| `container/Dockerfile` | Updated to COPY skills-catalog into image |
| `src/types.ts` | Add `skills` field to `RegisteredGroup` |
| `src/db.ts` | Add `skills` column migration to `registered_groups` |
| `src/container-runner.ts` | Category-filtered skill copy logic |

---

### Task 1: Create skill-categories.json

**Files:**
- Create: `container/skill-categories.json`

- [ ] **Step 1: Create the categories file**

```json
{
  "defaults": ["general"],
  "overrides": {
    "agent-browser": ["coding", "general"],
    "openscad": ["coding", "engineering"]
  }
}
```

This starts with just the local skills. Marketplace plugin categories will be added in Task 4 after we can see the full list.

- [ ] **Step 2: Commit**

```bash
git add container/skill-categories.json
git commit -m "feat: add skill-categories.json for container plugin system"
```

---

### Task 2: Move container/skills/ to container/skills-catalog/local/

**Files:**
- Move: `container/skills/agent-browser/` → `container/skills-catalog/local/agent-browser/`
- Move: `container/skills/openscad/` → `container/skills-catalog/local/openscad/`
- Move: `container/skills/materials-simulation-skills/` → `container/skills-catalog/local/materials-simulation-skills/`

- [ ] **Step 1: Create the new directory structure and move files**

```bash
mkdir -p container/skills-catalog/local
# Move tracked skills
git mv container/skills/agent-browser container/skills-catalog/local/agent-browser
git mv container/skills/openscad container/skills-catalog/local/openscad
# Move untracked directory manually
mv container/skills/materials-simulation-skills container/skills-catalog/local/materials-simulation-skills
# Remove now-empty skills dir
rmdir container/skills 2>/dev/null || rm -rf container/skills
```

- [ ] **Step 2: Verify structure**

```bash
find container/skills-catalog/local -name "SKILL.md" | head -20
```

Expected: SKILL.md files for agent-browser, openscad, and materials-simulation-skills sub-skills.

- [ ] **Step 3: Commit**

```bash
git add container/skills-catalog/
git add container/skills/  # stages the deletion
git commit -m "refactor: move container/skills/ to container/skills-catalog/local/"
```

---

### Task 3: Write sync-plugins.sh

**Files:**
- Create: `container/sync-plugins.sh`

**Context:** The marketplace plugin cache lives at `~/.claude/plugins/`. The active version for each plugin is tracked in `~/.claude/plugins/installed_plugins.json` which maps `{plugin}@{marketplace}` to an `installPath`. Old versions have an `.orphaned_at` marker file. Skills live under `{version}/skills/{skill-name}/SKILL.md`.

- [ ] **Step 1: Write the sync script**

```bash
#!/bin/bash
# Sync marketplace plugin skills into container/skills-catalog/plugins/
# Reads installed_plugins.json to find active versions, copies their skills.
# Safe to run when no plugins are installed (produces empty plugins dir).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOG_DIR="$SCRIPT_DIR/skills-catalog/plugins"
PLUGINS_DIR="${CLAUDE_PLUGINS_DIR:-$HOME/.claude/plugins}"
INSTALLED_FILE="$PLUGINS_DIR/installed_plugins.json"

# Clean previous sync
rm -rf "$CATALOG_DIR"
mkdir -p "$CATALOG_DIR"

# If no plugins installed, exit cleanly
if [ ! -f "$INSTALLED_FILE" ]; then
  echo "No installed_plugins.json found at $INSTALLED_FILE — skipping plugin sync"
  exit 0
fi

# Parse installed_plugins.json to get active install paths
# Format: { "plugins": { "name@marketplace": [{ "installPath": "..." }] } }
INSTALL_PATHS=$(node -e "
  const data = require('$INSTALLED_FILE');
  const plugins = data.plugins || {};
  for (const [key, entries] of Object.entries(plugins)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    // Use the first entry (active install)
    const entry = entries[0];
    if (entry.installPath) {
      // Extract plugin name (before @)
      const name = key.split('@')[0];
      console.log(name + '\t' + entry.installPath);
    }
  }
")

if [ -z "$INSTALL_PATHS" ]; then
  echo "No plugins found in installed_plugins.json"
  exit 0
fi

echo "$INSTALL_PATHS" | while IFS=$'\t' read -r PLUGIN_NAME INSTALL_PATH; do
  SKILLS_DIR="$INSTALL_PATH/skills"
  if [ ! -d "$SKILLS_DIR" ]; then
    echo "  Plugin '$PLUGIN_NAME' has no skills/ directory — skipping"
    continue
  fi

  echo "  Syncing plugin: $PLUGIN_NAME from $INSTALL_PATH"
  DEST="$CATALOG_DIR/$PLUGIN_NAME"
  mkdir -p "$DEST"

  # Copy each skill directory (contains SKILL.md + optional support files)
  for SKILL_DIR in "$SKILLS_DIR"/*/; do
    [ -d "$SKILL_DIR" ] || continue
    SKILL_NAME=$(basename "$SKILL_DIR")
    cp -r "$SKILL_DIR" "$DEST/$SKILL_NAME"
    echo "    Copied skill: $SKILL_NAME"
  done
done

echo "Plugin sync complete."
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x container/sync-plugins.sh
```

- [ ] **Step 3: Test the script**

```bash
cd /root/nanoclaw && ./container/sync-plugins.sh
```

Expected: Should sync superpowers skills into `container/skills-catalog/plugins/superpowers/`.

- [ ] **Step 4: Verify output**

```bash
ls container/skills-catalog/plugins/superpowers/
```

Expected: Directories like `brainstorming/`, `test-driven-development/`, `systematic-debugging/`, etc.

- [ ] **Step 5: Add plugins/ to .gitignore**

The synced marketplace plugins should not be committed — they're generated at build time.

```bash
echo "container/skills-catalog/plugins/" >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add container/sync-plugins.sh .gitignore
git commit -m "feat: add sync-plugins.sh to copy marketplace plugins into catalog"
```

---

### Task 4: Update skill-categories.json with marketplace skills

**Files:**
- Modify: `container/skill-categories.json`

**Context:** After Task 3, we can see all synced marketplace skills. Update categories to cover them.

- [ ] **Step 1: List all synced skills**

```bash
ls container/skills-catalog/plugins/superpowers/ 2>/dev/null
find container/skills-catalog/local -maxdepth 2 -name "SKILL.md" -exec dirname {} \; | xargs -I{} basename {}
```

- [ ] **Step 2: Update skill-categories.json with all skills**

Read the SKILL.md descriptions to assign categories appropriately. Coding workflow skills (TDD, debugging, brainstorming, writing-plans, etc.) get `["coding"]`. General-purpose skills get `["general"]`. Skills not listed fall back to `defaults`.

Example updated file:

```json
{
  "defaults": ["general"],
  "overrides": {
    "agent-browser": ["coding", "general"],
    "openscad": ["coding", "engineering"],
    "brainstorming": ["coding", "creative"],
    "test-driven-development": ["coding"],
    "systematic-debugging": ["coding"],
    "writing-plans": ["coding"],
    "executing-plans": ["coding"],
    "subagent-driven-development": ["coding"],
    "verification-before-completion": ["coding"],
    "requesting-code-review": ["coding"],
    "receiving-code-review": ["coding"],
    "writing-skills": ["coding"],
    "using-superpowers": ["coding", "general"],
    "using-git-worktrees": ["coding"],
    "finishing-a-development-branch": ["coding"],
    "dispatching-parallel-agents": ["coding", "general"]
  }
}
```

Adjust based on actual skills found. The key principle: coding workflow skills are `["coding"]`, broadly useful skills include `["general"]`.

- [ ] **Step 3: Commit**

```bash
git add container/skill-categories.json
git commit -m "feat: add marketplace skill categories"
```

---

### Task 5: Write generate-catalog.ts

**Files:**
- Create: `container/generate-catalog.ts`

**Context:** This script runs at build time on the host. It scans `container/skills-catalog/` for all `SKILL.md` files, extracts YAML frontmatter (`name`, `description`), merges with category tags from `skill-categories.json`, and writes `catalog.json`. It must handle: (1) skills with no frontmatter (fall back to directory name), (2) nested multi-skill packages (materials-simulation-skills), (3) marketplace plugins under `plugins/{name}/{skill}/`.

- [ ] **Step 1: Write the failing test**

Create `container/generate-catalog.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateCatalog } from './generate-catalog.js';

function setupTestDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-'));
  return dir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('generateCatalog', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = setupTestDir();
  });

  afterEach(() => {
    cleanup(testDir);
  });

  test('generates catalog from local skill with frontmatter', () => {
    const skillDir = path.join(testDir, 'local', 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: A test skill\n---\n# My Skill\n',
    );

    const categories = { defaults: ['general'], overrides: {} };
    const catalog = generateCatalog(testDir, categories);

    expect(catalog.skills).toHaveLength(1);
    expect(catalog.skills[0]).toEqual({
      name: 'my-skill',
      source: 'local',
      description: 'A test skill',
      categories: ['general'],
      path: '/skills-catalog/local/my-skill',
    });
  });

  test('uses directory name when frontmatter missing', () => {
    const skillDir = path.join(testDir, 'local', 'fallback-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# No frontmatter\n');

    const categories = { defaults: ['general'], overrides: {} };
    const catalog = generateCatalog(testDir, categories);

    expect(catalog.skills[0].name).toBe('fallback-skill');
    expect(catalog.skills[0].description).toBe('');
  });

  test('applies category overrides', () => {
    const skillDir = path.join(testDir, 'local', 'openscad');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: openscad\ndescription: 3D modeling\n---\n',
    );

    const categories = {
      defaults: ['general'],
      overrides: { openscad: ['coding', 'engineering'] },
    };
    const catalog = generateCatalog(testDir, categories);

    expect(catalog.skills[0].categories).toEqual(['coding', 'engineering']);
  });

  test('handles nested multi-skill packages', () => {
    // Simulates materials-simulation-skills structure
    const base = path.join(testDir, 'local', 'materials-simulation-skills', 'skills');
    const skill1 = path.join(base, 'core-numerical', 'convergence-study');
    const skill2 = path.join(base, 'ontology', 'ontology-mapper');
    fs.mkdirSync(skill1, { recursive: true });
    fs.mkdirSync(skill2, { recursive: true });
    fs.writeFileSync(
      path.join(skill1, 'SKILL.md'),
      '---\nname: convergence-study\ndescription: Convergence analysis\n---\n',
    );
    fs.writeFileSync(
      path.join(skill2, 'SKILL.md'),
      '---\nname: ontology-mapper\ndescription: Map ontologies\n---\n',
    );

    const categories = { defaults: ['general'], overrides: {} };
    const catalog = generateCatalog(testDir, categories);

    expect(catalog.skills).toHaveLength(2);
    const names = catalog.skills.map((s: { name: string }) => s.name).sort();
    expect(names).toEqual(['convergence-study', 'ontology-mapper']);
  });

  test('handles marketplace plugins', () => {
    const skillDir = path.join(testDir, 'plugins', 'superpowers', 'brainstorming');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: brainstorming\ndescription: Explore ideas\n---\n',
    );

    const categories = {
      defaults: ['general'],
      overrides: { brainstorming: ['coding', 'creative'] },
    };
    const catalog = generateCatalog(testDir, categories);

    expect(catalog.skills[0].source).toBe('plugin:superpowers');
    expect(catalog.skills[0].categories).toEqual(['coding', 'creative']);
    expect(catalog.skills[0].path).toBe(
      '/skills-catalog/plugins/superpowers/brainstorming',
    );
  });

  test('produces empty catalog when no skills exist', () => {
    fs.mkdirSync(path.join(testDir, 'local'), { recursive: true });
    const categories = { defaults: ['general'], overrides: {} };
    const catalog = generateCatalog(testDir, categories);
    expect(catalog.skills).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/nanoclaw && npx vitest run container/generate-catalog.test.ts
```

Expected: FAIL — `generate-catalog.js` module not found.

- [ ] **Step 3: Write the implementation**

Create `container/generate-catalog.ts`:

```typescript
import fs from 'fs';
import path from 'path';

export interface CatalogEntry {
  name: string;
  source: string;
  description: string;
  categories: string[];
  path: string;
}

export interface Catalog {
  skills: CatalogEntry[];
}

export interface CategoryConfig {
  defaults: string[];
  overrides: Record<string, string[]>;
}

/**
 * Extract YAML frontmatter from a SKILL.md file.
 * Returns { name, description } or nulls if no frontmatter.
 */
function extractFrontmatter(
  content: string,
): { name: string | null; description: string | null } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: null, description: null };

  const yaml = match[1];
  let name: string | null = null;
  let description: string | null = null;

  for (const line of yaml.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim();
    const descMatch = line.match(/^description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim();
  }

  return { name, description };
}

/**
 * Recursively find all SKILL.md files under a directory.
 */
function findSkillFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSkillFiles(full));
    } else if (entry.name === 'SKILL.md') {
      results.push(full);
    }
  }
  return results;
}

/**
 * Determine the source string for a skill based on its path relative to the catalog root.
 * - local/* → "local"
 * - plugins/{pluginName}/* → "plugin:{pluginName}"
 */
function determineSource(relativePath: string): string {
  const parts = relativePath.split(path.sep);
  if (parts[0] === 'plugins' && parts.length >= 2) {
    return `plugin:${parts[1]}`;
  }
  return 'local';
}

/**
 * Determine the skill directory path (what gets copied to ~/.claude/skills/).
 * This is the directory containing SKILL.md.
 */
function skillDirFromFile(skillMdPath: string): string {
  return path.dirname(skillMdPath);
}

/**
 * Generate a catalog from all SKILL.md files under catalogDir.
 */
export function generateCatalog(
  catalogDir: string,
  categories: CategoryConfig,
): Catalog {
  const skills: CatalogEntry[] = [];
  const skillFiles = findSkillFiles(catalogDir);

  for (const skillFile of skillFiles) {
    const content = fs.readFileSync(skillFile, 'utf-8');
    const frontmatter = extractFrontmatter(content);
    const skillDir = skillDirFromFile(skillFile);
    const relativePath = path.relative(catalogDir, skillDir);
    const dirName = path.basename(skillDir);

    const name = frontmatter.name || dirName;
    const description = frontmatter.description || '';
    const source = determineSource(relativePath);
    const skillCategories = categories.overrides[name] || categories.defaults;

    // Container path: /skills-catalog/ + relative path from catalog dir
    const containerPath = '/skills-catalog/' + relativePath.split(path.sep).join('/');

    skills.push({
      name,
      source,
      description,
      categories: skillCategories,
      path: containerPath,
    });
  }

  // Sort by name for deterministic output
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return { skills };
}

/**
 * CLI entry point: generate catalog.json from skills-catalog/ directory.
 */
function main(): void {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const catalogDir = path.join(scriptDir, 'skills-catalog');
  const categoriesFile = path.join(scriptDir, 'skill-categories.json');

  if (!fs.existsSync(catalogDir)) {
    console.error(`Catalog directory not found: ${catalogDir}`);
    process.exit(1);
  }

  const categories: CategoryConfig = fs.existsSync(categoriesFile)
    ? JSON.parse(fs.readFileSync(categoriesFile, 'utf-8'))
    : { defaults: ['general'], overrides: {} };

  const catalog = generateCatalog(catalogDir, categories);
  const outputPath = path.join(catalogDir, 'catalog.json');
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2) + '\n');

  console.log(`Generated catalog with ${catalog.skills.length} skills → ${outputPath}`);
}

// Run as CLI if invoked directly
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('generate-catalog.ts') ||
    process.argv[1].endsWith('generate-catalog.js'));

if (isMain) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/nanoclaw && npx vitest run container/generate-catalog.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Test the CLI**

```bash
cd /root/nanoclaw && npx tsx container/generate-catalog.ts
```

Expected: Outputs "Generated catalog with N skills" and creates `container/skills-catalog/catalog.json`.

- [ ] **Step 6: Verify catalog.json content**

```bash
cat container/skills-catalog/catalog.json | head -30
```

Expected: JSON with skills array containing local + marketplace plugin entries.

- [ ] **Step 7: Add catalog.json to .gitignore**

```bash
echo "container/skills-catalog/catalog.json" >> .gitignore
```

- [ ] **Step 8: Commit**

```bash
git add container/generate-catalog.ts container/generate-catalog.test.ts .gitignore
git commit -m "feat: add generate-catalog.ts to build skill catalog index"
```

---

### Task 6: Update build.sh

**Files:**
- Modify: `container/build.sh`

- [ ] **Step 1: Update build.sh to run sync and generate before Docker build**

The updated script should:
1. Run `sync-plugins.sh` to populate `skills-catalog/plugins/`
2. Run `generate-catalog.ts` to create `catalog.json`
3. Run `docker build` as before

```bash
#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"

echo "=== Syncing marketplace plugins ==="
./sync-plugins.sh

echo ""
echo "=== Generating skills catalog ==="
npx tsx generate-catalog.ts

echo ""
echo "=== Building container image ==="
echo "Image: ${IMAGE_NAME}:${TAG}"

${CONTAINER_RUNTIME} build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | ${CONTAINER_RUNTIME} run -i ${IMAGE_NAME}:${TAG}"
```

- [ ] **Step 2: Commit**

```bash
git add container/build.sh
git commit -m "feat: build.sh runs plugin sync and catalog generation before Docker build"
```

---

### Task 7: Update Dockerfile

**Files:**
- Modify: `container/Dockerfile`

- [ ] **Step 1: Add COPY for skills-catalog**

Add after the `COPY scad-render.sh` line and before ownership changes:

```dockerfile
# Copy skills catalog (local + marketplace plugins + index)
COPY skills-catalog/ /skills-catalog/
```

The existing Dockerfile does not currently COPY `container/skills/` (skills are synced at runtime by container-runner.ts), so this is purely additive. The catalog is read-only inside the container since it's baked into the image layer.

- [ ] **Step 2: Verify no existing skills COPY exists**

Read the Dockerfile to confirm there's no existing `COPY skills/` line that needs removal.

- [ ] **Step 3: Commit**

```bash
git add container/Dockerfile
git commit -m "feat: Dockerfile copies skills-catalog into image"
```

---

### Task 8: Add skills field to RegisteredGroup

**Files:**
- Modify: `src/types.ts:35-43`
- Modify: `src/db.ts:80-88` (schema), `src/db.ts:580-617` (getRegisteredGroup), `src/db.ts:620-637` (setRegisteredGroup), `src/db.ts:639-673` (getAllRegisteredGroups)

- [ ] **Step 1: Write the failing test**

Add to `src/db.test.ts`:

```typescript
describe('registered group skills', () => {
  test('defaults to ["general"] when skills not set', () => {
    setRegisteredGroup('test@g.us', {
      name: 'Test',
      folder: 'test',
      trigger: '@bot',
      added_at: new Date().toISOString(),
    });
    const group = getRegisteredGroup('test@g.us');
    expect(group?.skills).toEqual(['general']);
  });

  test('stores and retrieves custom skills', () => {
    setRegisteredGroup('coding@g.us', {
      name: 'Coding',
      folder: 'coding',
      trigger: '@bot',
      added_at: new Date().toISOString(),
      skills: ['coding', 'general'],
    });
    const group = getRegisteredGroup('coding@g.us');
    expect(group?.skills).toEqual(['coding', 'general']);
  });

  test('getAllRegisteredGroups returns skills', () => {
    setRegisteredGroup('a@g.us', {
      name: 'A',
      folder: 'group-a',
      trigger: '@bot',
      added_at: new Date().toISOString(),
      skills: ['coding'],
    });
    const all = getAllRegisteredGroups();
    expect(all['a@g.us'].skills).toEqual(['coding']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/nanoclaw && npm test -- --grep "skills"
```

Expected: FAIL — `skills` property does not exist on `RegisteredGroup`.

- [ ] **Step 3: Add skills to RegisteredGroup type**

In `src/types.ts`, add `skills` to the `RegisteredGroup` interface:

```typescript
export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  containerConfig?: ContainerConfig;
  requiresTrigger?: boolean;
  isMain?: boolean;
  skills?: string[];  // Category tags for skill pre-loading. Default: ["general"]
}
```

- [ ] **Step 4: Add DB migration**

In `src/db.ts`, add after the existing `is_main` migration:

```typescript
// Add skills column if it doesn't exist (migration for existing DBs)
try {
  database.exec(
    `ALTER TABLE registered_groups ADD COLUMN skills TEXT DEFAULT '["general"]'`,
  );
} catch {
  /* column already exists */
}
```

- [ ] **Step 5: Update getRegisteredGroup to parse skills**

In `src/db.ts` `getRegisteredGroup()`, add `skills` to the row type and parse it:

Add to the row type: `skills: string | null;`

Add to the return object:
```typescript
skills: row.skills ? JSON.parse(row.skills) : ['general'],
```

- [ ] **Step 6: Update setRegisteredGroup to store skills**

In `src/db.ts` `setRegisteredGroup()`, update the INSERT to include the `skills` column. The full updated statement:

```typescript
db.prepare(
  `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main, skills)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
  jid,
  group.name,
  group.folder,
  group.trigger,
  group.added_at,
  group.containerConfig ? JSON.stringify(group.containerConfig) : null,
  group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
  group.isMain ? 1 : 0,
  group.skills ? JSON.stringify(group.skills) : '["general"]',
);
```

- [ ] **Step 7: Update getAllRegisteredGroups to parse skills**

Same pattern as `getRegisteredGroup` — add `skills: string | null` to row type and parse.

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /root/nanoclaw && npm test
```

Expected: All tests PASS, including the new skills tests.

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/db.ts src/db.test.ts
git commit -m "feat: add skills column to registered_groups for category-based skill loading"
```

---

### Task 9: Update container-runner.ts for category-filtered skill copy

**Files:**
- Modify: `src/container-runner.ts:166-176`

- [ ] **Step 1: Write the failing test**

Add to `src/container-runner.test.ts` (or create if doesn't exist). The test should verify that the skill copy logic filters by categories. Since `buildVolumeMounts` is not exported, we may need to test via integration or extract the skill copy logic into a testable function.

Create a helper function and test:

```typescript
// In container-runner.test.ts
import { copySkillsForGroup } from './container-runner.js';

describe('copySkillsForGroup', () => {
  test('copies only skills matching group categories', () => {
    // Setup: create a temp catalog dir with catalog.json
    // and a temp destination dir
    const catalogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));

    // Create catalog with two skills in different categories
    const skill1Dir = path.join(catalogDir, 'local', 'agent-browser');
    const skill2Dir = path.join(catalogDir, 'plugins', 'superpowers', 'tdd');
    fs.mkdirSync(skill1Dir, { recursive: true });
    fs.mkdirSync(skill2Dir, { recursive: true });
    fs.writeFileSync(path.join(skill1Dir, 'SKILL.md'), '# Browser');
    fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), '# TDD');

    fs.writeFileSync(
      path.join(catalogDir, 'catalog.json'),
      JSON.stringify({
        skills: [
          { name: 'agent-browser', categories: ['coding', 'general'], path: '/skills-catalog/local/agent-browser' },
          { name: 'tdd', categories: ['coding'], path: '/skills-catalog/plugins/superpowers/tdd' },
        ],
      }),
    );

    // Copy with ["general"] — should only get agent-browser
    copySkillsForGroup(catalogDir, destDir, ['general']);
    expect(fs.existsSync(path.join(destDir, 'agent-browser', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(destDir, 'tdd', 'SKILL.md'))).toBe(false);

    // Cleanup
    fs.rmSync(catalogDir, { recursive: true });
    fs.rmSync(destDir, { recursive: true });
  });

  test('copies all matching skills when group has multiple categories', () => {
    const catalogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));

    const skill1Dir = path.join(catalogDir, 'local', 'agent-browser');
    const skill2Dir = path.join(catalogDir, 'plugins', 'superpowers', 'tdd');
    fs.mkdirSync(skill1Dir, { recursive: true });
    fs.mkdirSync(skill2Dir, { recursive: true });
    fs.writeFileSync(path.join(skill1Dir, 'SKILL.md'), '# Browser');
    fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), '# TDD');

    fs.writeFileSync(
      path.join(catalogDir, 'catalog.json'),
      JSON.stringify({
        skills: [
          { name: 'agent-browser', categories: ['coding', 'general'], path: '/skills-catalog/local/agent-browser' },
          { name: 'tdd', categories: ['coding'], path: '/skills-catalog/plugins/superpowers/tdd' },
        ],
      }),
    );

    // Copy with ["coding"] — should get both
    copySkillsForGroup(catalogDir, destDir, ['coding']);
    expect(fs.existsSync(path.join(destDir, 'agent-browser', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(destDir, 'tdd', 'SKILL.md'))).toBe(true);

    fs.rmSync(catalogDir, { recursive: true });
    fs.rmSync(destDir, { recursive: true });
  });

  test('falls back to copying all local skills when no catalog.json exists', () => {
    const catalogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));

    // No catalog.json — just a local/ directory with skills
    const skillDir = path.join(catalogDir, 'local', 'agent-browser');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Browser');

    copySkillsForGroup(catalogDir, destDir, ['general']);
    expect(fs.existsSync(path.join(destDir, 'agent-browser', 'SKILL.md'))).toBe(true);

    fs.rmSync(catalogDir, { recursive: true });
    fs.rmSync(destDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/nanoclaw && npm test -- --grep "copySkillsForGroup"
```

Expected: FAIL — function not exported.

- [ ] **Step 3: Extract and implement copySkillsForGroup**

In `src/container-runner.ts`, replace the existing skill sync block (lines 166-176) with:

```typescript
/**
 * Copy skills from the catalog into a group's .claude/skills/ directory,
 * filtered by the group's category tags.
 */
export function copySkillsForGroup(
  catalogDir: string,
  skillsDst: string,
  groupSkills: string[],
): void {
  const catalogFile = path.join(catalogDir, 'catalog.json');
  if (!fs.existsSync(catalogFile)) {
    // Fallback: no catalog, copy all local skills (backwards compat)
    const localDir = path.join(catalogDir, 'local');
    if (fs.existsSync(localDir)) {
      for (const skillDir of fs.readdirSync(localDir)) {
        const srcDir = path.join(localDir, skillDir);
        if (!fs.statSync(srcDir).isDirectory()) continue;
        fs.cpSync(srcDir, path.join(skillsDst, skillDir), { recursive: true });
      }
    }
    return;
  }

  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf-8'));
  const skills: Array<{ name: string; categories: string[]; path: string }> =
    catalog.skills || [];

  for (const skill of skills) {
    // Check if any of the group's categories match any of the skill's categories
    const matches = skill.categories.some((cat: string) =>
      groupSkills.includes(cat),
    );
    if (!matches) continue;

    // Resolve the catalog path: /skills-catalog/... → catalogDir/...
    const relativePath = skill.path.replace(/^\/skills-catalog\//, '');
    const srcDir = path.join(catalogDir, relativePath);
    if (!fs.existsSync(srcDir)) continue;

    const dstDir = path.join(skillsDst, skill.name);
    fs.cpSync(srcDir, dstDir, { recursive: true });
  }
}
```

Then update `buildVolumeMounts` to use it:

```typescript
// Replace lines 166-176 with:
const catalogDir = path.join(process.cwd(), 'container', 'skills-catalog');
const skillsDst = path.join(groupSessionsDir, 'skills');
const groupSkills = group.skills || ['general'];
copySkillsForGroup(catalogDir, skillsDst, groupSkills);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/nanoclaw && npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/container-runner.ts src/container-runner.test.ts
git commit -m "feat: category-filtered skill copy from catalog in container-runner"
```

---

### Task 10: Add catalog instructions to global CLAUDE.md

**Files:**
- Modify: `groups/global/CLAUDE.md`

**Context:** `groups/global/CLAUDE.md` is the shared instructions file that ALL container agents receive. It's loaded by `container/agent-runner/src/index.ts` and appended to the system prompt. This is the right place for catalog instructions since all groups should know about the skills catalog.

- [ ] **Step 1: Add catalog instructions to groups/global/CLAUDE.md**

Append to the end of the file:

````markdown
## Skills Catalog

You have a catalog of available skills at `/skills-catalog/catalog.json`.
Skills matching this group's categories are pre-loaded in `~/.claude/skills/`.

If you need a skill that isn't pre-loaded, check the catalog and activate it:

```bash
# View available skills
cat /skills-catalog/catalog.json | jq '.skills[] | {name, description, categories}'

# Activate a skill
cp -r /skills-catalog/<path-from-catalog> ~/.claude/skills/<skill-name>
```

Only activate skills you actually need for the current task.
````

- [ ] **Step 2: Commit**

```bash
git add groups/global/CLAUDE.md
git commit -m "docs: add skills catalog instructions for container agents"
```

---

### Task 11: Build and verify end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run the full build**

```bash
cd /root/nanoclaw && ./container/build.sh
```

Expected:
1. `sync-plugins.sh` syncs marketplace skills
2. `generate-catalog.ts` creates catalog.json
3. Docker build succeeds with skills-catalog baked in

- [ ] **Step 2: Verify catalog is inside the image**

```bash
docker run --rm nanoclaw-agent:latest cat /skills-catalog/catalog.json | head -20
```

Expected: JSON catalog with skills from both local and marketplace sources.

- [ ] **Step 3: Verify agent can read and copy from catalog**

```bash
docker run --rm -it nanoclaw-agent:latest bash -c "ls /skills-catalog/local/ && ls /skills-catalog/plugins/ && cat /skills-catalog/catalog.json | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d[\"skills\"]),\"skills\")'"
```

Expected: Lists directories and shows skill count.

- [ ] **Step 4: Run all project tests**

```bash
cd /root/nanoclaw && npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Test with a real group (manual)**

Send a message to a registered group and verify:
1. Pre-loaded skills appear in `~/.claude/skills/` inside container
2. Agent can read `/skills-catalog/catalog.json`
3. Agent can activate an additional skill with `cp -r`
