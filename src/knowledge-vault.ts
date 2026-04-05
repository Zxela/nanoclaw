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
`;

const OBSIDIAN_CONFIG = {
  'app.json': JSON.stringify(
    {
      livePreview: true,
      showFrontmatter: true,
      defaultViewMode: 'source',
    },
    null,
    2,
  ),
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

  // Ensure the container's node user (uid 1000) can write to the vault
  try {
    chownRecursive(vaultPath, 1000, 1000);
  } catch {
    // Best-effort
  }

  return vaultPath;
}

function chownRecursive(dir: string, uid: number, gid: number): void {
  fs.chownSync(dir, uid, gid);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    fs.chownSync(full, uid, gid);
    if (entry.isDirectory()) {
      chownRecursive(full, uid, gid);
    }
  }
}

/** Extract the `updated:` date from YAML frontmatter, if present. */
function parseFrontmatterDate(content: string): Date | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const dateMatch = match[1].match(/^updated:\s*(.+)$/m);
  if (!dateMatch) return null;
  const d = new Date(dateMatch[1].trim());
  return isNaN(d.getTime()) ? null : d;
}

/** Collect all .md files under a directory, skipping hidden dirs (.archive, .obsidian, .trash). */
function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/** Rough token estimate: 1 token ≈ 4 chars. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface PruneOptions {
  /** Archive entries whose `updated:` frontmatter date is older than this many days. */
  ttlDays?: number;
  /** If total estimated tokens exceed this budget, archive oldest entries (by updated date or mtime) until under budget. */
  maxTokens?: number;
}

export interface PruneResult {
  archivedCount: number;
  archivedFiles: string[];
  tokensBefore: number;
  tokensAfter: number;
}

/**
 * Prune stale knowledge vault entries for a group.
 * - Files with `updated:` older than `ttlDays` are moved to `.archive/`.
 * - If total tokens exceed `maxTokens`, the oldest files are archived until under budget.
 * Returns a summary of what was archived.
 */
export function pruneKnowledgeVault(
  groupFolder: string,
  opts: PruneOptions = {},
): PruneResult {
  const vaultPath = path.join(GROUPS_DIR, groupFolder, 'knowledge');
  const archiveDir = path.join(vaultPath, '.archive');

  const files = collectMarkdownFiles(vaultPath);

  type FileEntry = {
    filePath: string;
    content: string;
    tokens: number;
    updatedAt: Date;
  };

  const entries: FileEntry[] = files.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const updatedAt =
      parseFrontmatterDate(content) ?? fs.statSync(filePath).mtime;
    return { filePath, content, tokens: estimateTokens(content), updatedAt };
  });

  const tokensBefore = entries.reduce((sum, e) => sum + e.tokens, 0);
  const archived: string[] = [];
  const now = Date.now();

  // TTL pass: archive files older than ttlDays
  if (opts.ttlDays !== undefined && opts.ttlDays > 0) {
    const cutoff = now - opts.ttlDays * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      if (entry.updatedAt.getTime() < cutoff) {
        archiveFile(entry.filePath, vaultPath, archiveDir);
        archived.push(entry.filePath);
      }
    }
  }

  // Token budget pass: archive oldest entries until under budget
  if (opts.maxTokens !== undefined && opts.maxTokens > 0) {
    const remaining = entries.filter((e) => !archived.includes(e.filePath));
    let totalTokens = remaining.reduce((sum, e) => sum + e.tokens, 0);
    if (totalTokens > opts.maxTokens) {
      // Sort oldest first
      remaining.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      for (const entry of remaining) {
        if (totalTokens <= opts.maxTokens) break;
        archiveFile(entry.filePath, vaultPath, archiveDir);
        archived.push(entry.filePath);
        totalTokens -= entry.tokens;
      }
    }
  }

  const remaining = entries.filter((e) => !archived.includes(e.filePath));
  const tokensAfter = remaining.reduce((sum, e) => sum + e.tokens, 0);

  logger.info(
    { groupFolder, archivedCount: archived.length, tokensBefore, tokensAfter },
    'Knowledge vault pruned',
  );

  return {
    archivedCount: archived.length,
    archivedFiles: archived.map((f) => path.relative(vaultPath, f)),
    tokensBefore,
    tokensAfter,
  };
}

function archiveFile(
  filePath: string,
  vaultBase: string,
  archiveDir: string,
): void {
  const rel = path.relative(vaultBase, filePath);
  const dest = path.join(archiveDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(filePath, dest);
}
