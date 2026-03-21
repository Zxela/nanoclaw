import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GROUPS_DIR } from './config.js';
import { logger } from './logger.js';

const VAULT_DIRS = [
  'people',
  'projects',
  'preferences',
  'decisions',
  'reference',
];

const VAULT_GITIGNORE = `.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.trash/
.memory.db
`;

export const OBSIDIAN_APP_CONFIG = {
  livePreview: true,
  showFrontmatter: true,
  defaultViewMode: 'source',
};

const OBSIDIAN_CONFIG: Record<string, string> = {
  'app.json': JSON.stringify(OBSIDIAN_APP_CONFIG, null, 2),
  'graph.json': JSON.stringify(
    {
      colorGroups: [
        { query: 'path:people', color: { a: 1, rgb: 3447003 } },
        { query: 'path:projects', color: { a: 1, rgb: 15105570 } },
        { query: 'path:preferences', color: { a: 1, rgb: 3066993 } },
        { query: 'path:decisions', color: { a: 1, rgb: 15158332 } },
        { query: 'path:reference', color: { a: 1, rgb: 9807270 } },
      ],
    },
    null,
    2,
  ),
  'core-plugins.json': JSON.stringify(['templates'], null, 2),
  'templates.json': JSON.stringify(
    { folder: '.obsidian/templates' },
    null,
    2,
  ),
};

const DASHBOARD_MD = `# Knowledge Dashboard

## Categories
- [[people/_index|People]] — People you know about
- [[projects/_index|Projects]] — Ongoing work and goals
- [[preferences/_index|Preferences]] — User preferences and style
- [[decisions/_index|Decisions]] — Key decisions and rationale
- [[reference/_index|Reference]] — Facts, links, resources

## Recent Updates
_Updated automatically by the agent_
`;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  people: 'Notes about people the agent has learned about.',
  projects: 'Notes about ongoing work and goals.',
  preferences: 'Notes about user preferences and style.',
  decisions: 'Notes about key decisions and their rationale.',
  reference: 'Notes about facts, links, and resources.',
};

const NOTE_TEMPLATES: Record<string, string> = {
  'person.md': `---
name:
role:
organization:
tags: []
related: []
created: "{{date}}"
updated: "{{date}}"
---
# {{title}}
`,
  'project.md': `---
name:
status: active
owner:
tags: []
related: []
created: "{{date}}"
updated: "{{date}}"
---
# {{title}}
`,
  'decision.md': `---
title:
date: "{{date}}"
status: proposed
participants: []
tags: []
related: []
---
# {{title}}
`,
  'preference.md': `---
category:
tags: []
related: []
created: "{{date}}"
updated: "{{date}}"
---
# {{title}}
`,
  'reference.md': `---
title:
source:
tags: []
related: []
created: "{{date}}"
updated: "{{date}}"
---
# {{title}}
`,
};

export function initKnowledgeVault(groupFolder: string): string {
  const vaultPath = path.join(GROUPS_DIR, groupFolder, 'knowledge');

  if (fs.existsSync(path.join(vaultPath, '.obsidian'))) {
    return vaultPath; // Already initialized
  }

  fs.mkdirSync(vaultPath, { recursive: true });
  for (const dir of VAULT_DIRS) {
    fs.mkdirSync(path.join(vaultPath, dir), { recursive: true });
  }

  const obsidianDir = path.join(vaultPath, '.obsidian');
  fs.mkdirSync(obsidianDir, { recursive: true });
  for (const [file, content] of Object.entries(OBSIDIAN_CONFIG)) {
    fs.writeFileSync(path.join(obsidianDir, file), content);
  }

  // Dashboard MOC
  fs.writeFileSync(path.join(vaultPath, '_dashboard.md'), DASHBOARD_MD);

  // Category index files
  for (const dir of VAULT_DIRS) {
    const desc = CATEGORY_DESCRIPTIONS[dir] || '';
    const index = `---\ntype: index\ncategory: ${dir}\n---\n# ${dir.charAt(0).toUpperCase() + dir.slice(1)}\n${desc}\n`;
    fs.writeFileSync(path.join(vaultPath, dir, '_index.md'), index);
  }

  // Note templates
  const templatesDir = path.join(obsidianDir, 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });
  for (const [file, content] of Object.entries(NOTE_TEMPLATES)) {
    fs.writeFileSync(path.join(templatesDir, file), content);
  }

  fs.writeFileSync(path.join(vaultPath, '.gitignore'), VAULT_GITIGNORE);

  try {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'NanoClaw',
      GIT_AUTHOR_EMAIL:
        process.env.GIT_AUTHOR_EMAIL || 'noreply@nanoclaw.local',
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'NanoClaw',
      GIT_COMMITTER_EMAIL:
        process.env.GIT_COMMITTER_EMAIL || 'noreply@nanoclaw.local',
    };
    execSync('git init', { cwd: vaultPath, stdio: 'pipe', env: gitEnv });
    execSync('git add -A', { cwd: vaultPath, stdio: 'pipe', env: gitEnv });
    execSync('git commit -m "Initial knowledge vault"', {
      cwd: vaultPath,
      stdio: 'pipe',
      env: gitEnv,
    });
    logger.info({ groupFolder, vaultPath }, 'Knowledge vault initialized');
  } catch (err) {
    logger.warn(
      { groupFolder, err },
      'Failed to initialize knowledge vault git repo',
    );
  }

  return vaultPath;
}
