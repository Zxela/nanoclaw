import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Fixed test dir — created before the vi.mock factory runs
const TEST_GROUPS_DIR = path.join(os.tmpdir(), 'vault-test-suite');

vi.mock('./config.js', () => ({
  GROUPS_DIR: path.join(os.tmpdir(), 'vault-test-suite'),
  DATA_DIR: path.join(os.tmpdir(), 'vault-test-suite', 'data'),
  TIMEZONE: 'UTC',
}));

const tmpDir = TEST_GROUPS_DIR;

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { pruneKnowledgeVault } from './knowledge-vault.js';

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Create a vault file with optional `updated:` frontmatter date
function writeVaultFile(
  group: string,
  subdir: string,
  filename: string,
  updatedDate: string | null,
  body = 'Some content here.',
) {
  const dir = path.join(tmpDir, group, 'knowledge', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = updatedDate
    ? `---\ntitle: Test\nupdated: ${updatedDate}\n---\n\n`
    : '';
  fs.writeFileSync(path.join(dir, filename), frontmatter + body);
}

// Remove all files in a group vault (cleanup between tests)
function cleanGroup(group: string) {
  const vaultPath = path.join(tmpDir, group, 'knowledge');
  if (fs.existsSync(vaultPath)) {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
}

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('pruneKnowledgeVault', () => {
  describe('TTL pruning', () => {
    const GROUP = 'g-ttl';
    afterEach(() => cleanGroup(GROUP));

    it('archives files whose updated date is older than ttlDays', () => {
      writeVaultFile(GROUP, 'people', 'old-person.md', daysAgo(100));
      writeVaultFile(GROUP, 'people', 'recent-person.md', daysAgo(1));

      const result = pruneKnowledgeVault(GROUP, { ttlDays: 30 });

      expect(result.archivedCount).toBe(1);
      expect(result.archivedFiles).toHaveLength(1);
      expect(result.archivedFiles[0]).toContain('old-person.md');

      const vaultPath = path.join(tmpDir, GROUP, 'knowledge');
      expect(
        fs.existsSync(
          path.join(vaultPath, '.archive', 'people', 'old-person.md'),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(vaultPath, 'people', 'recent-person.md')),
      ).toBe(true);
    });

    it('archives nothing when all files are within TTL', () => {
      writeVaultFile(GROUP, 'people', 'fresh.md', daysAgo(2));

      const result = pruneKnowledgeVault(GROUP, { ttlDays: 30 });

      expect(result.archivedCount).toBe(0);
      expect(result.archivedFiles).toHaveLength(0);
    });

    it('archives multiple stale files', () => {
      writeVaultFile(GROUP, 'people', 'a.md', daysAgo(60));
      writeVaultFile(GROUP, 'decisions', 'b.md', daysAgo(45));
      writeVaultFile(GROUP, 'reference', 'c.md', daysAgo(5));

      const result = pruneKnowledgeVault(GROUP, { ttlDays: 30 });

      expect(result.archivedCount).toBe(2);
      const names = result.archivedFiles.map((f) => path.basename(f));
      expect(names).toContain('a.md');
      expect(names).toContain('b.md');
      expect(names).not.toContain('c.md');
    });

    it('uses file mtime when no updated frontmatter is present', () => {
      const group = 'g-mtime';
      const vaultPath = path.join(tmpDir, group, 'knowledge', 'reference');
      fs.mkdirSync(vaultPath, { recursive: true });

      // Write file with no frontmatter, then backdate its mtime
      const filePath = path.join(vaultPath, 'no-frontmatter.md');
      fs.writeFileSync(filePath, 'No frontmatter here.');
      const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      fs.utimesSync(filePath, oldTime, oldTime);

      const result = pruneKnowledgeVault(group, { ttlDays: 30 });
      expect(result.archivedCount).toBe(1);

      cleanGroup(group);
    });
  });

  describe('token budget enforcement', () => {
    const GROUP = 'g-budget';
    afterEach(() => cleanGroup(GROUP));

    it('archives oldest files when vault exceeds maxTokens', () => {
      // Each file body ≈ 100 chars → ~25 tokens (plus frontmatter ~60 chars → ~15 tokens = ~40 tokens each)
      const body = 'x'.repeat(100);
      writeVaultFile(GROUP, 'reference', 'old-ref.md', daysAgo(60), body);
      writeVaultFile(GROUP, 'reference', 'new-ref.md', daysAgo(5), body);

      // Both files total ~80+ tokens; budget of 50 forces archiving the oldest
      const result = pruneKnowledgeVault(GROUP, { maxTokens: 50 });

      expect(result.archivedCount).toBe(1);
      expect(result.archivedFiles[0]).toContain('old-ref.md');
      expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
    });

    it('does not archive when within token budget', () => {
      writeVaultFile(GROUP, 'reference', 'small.md', daysAgo(5), 'short');

      const result = pruneKnowledgeVault(GROUP, { maxTokens: 10000 });

      expect(result.archivedCount).toBe(0);
    });
  });

  describe('combined TTL + token budget', () => {
    const GROUP = 'g-combined';
    afterEach(() => cleanGroup(GROUP));

    it('applies TTL first, then token budget on remaining files', () => {
      const body = 'x'.repeat(400); // ~100 tokens each
      writeVaultFile(GROUP, 'people', 'stale.md', daysAgo(90), body);
      writeVaultFile(GROUP, 'people', 'older.md', daysAgo(10), body);
      writeVaultFile(GROUP, 'people', 'newer.md', daysAgo(2), body);

      // TTL=30 removes stale.md; budget=120 (can hold ~1 file) removes next oldest
      const result = pruneKnowledgeVault(GROUP, {
        ttlDays: 30,
        maxTokens: 120,
      });

      expect(result.archivedCount).toBe(2);
      const names = result.archivedFiles.map((f) => path.basename(f));
      expect(names).toContain('stale.md');
      expect(names).toContain('older.md');
      expect(names).not.toContain('newer.md');
    });
  });

  describe('edge cases', () => {
    it('returns zeros for an empty vault', () => {
      const group = 'g-empty';
      fs.mkdirSync(path.join(tmpDir, group, 'knowledge'), { recursive: true });

      const result = pruneKnowledgeVault(group, { ttlDays: 30 });

      expect(result.archivedCount).toBe(0);
      expect(result.tokensBefore).toBe(0);
      expect(result.tokensAfter).toBe(0);

      cleanGroup(group);
    });

    it('returns zeros when vault directory does not exist', () => {
      const result = pruneKnowledgeVault('nonexistent-group', { ttlDays: 30 });

      expect(result.archivedCount).toBe(0);
      expect(result.tokensBefore).toBe(0);
    });

    it('skips non-markdown files', () => {
      const group = 'g-nonmd';
      const dir = path.join(tmpDir, group, 'knowledge', 'reference');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data.json'), '{"key":"value"}');

      const result = pruneKnowledgeVault(group, { ttlDays: 1 });
      expect(result.archivedCount).toBe(0);

      cleanGroup(group);
    });

    it('skips files in the .archive directory', () => {
      const group = 'g-archive-skip';
      const archiveDir = path.join(
        tmpDir,
        group,
        'knowledge',
        '.archive',
        'people',
      );
      fs.mkdirSync(archiveDir, { recursive: true });
      fs.writeFileSync(
        path.join(archiveDir, 'already-archived.md'),
        `---\nupdated: ${daysAgo(200)}\n---\n\nOld.`,
      );

      const result = pruneKnowledgeVault(group, { ttlDays: 30 });
      expect(result.archivedCount).toBe(0);

      cleanGroup(group);
    });
  });

  describe('result shape', () => {
    const GROUP = 'g-shape';
    afterEach(() => cleanGroup(GROUP));

    it('reports tokensBefore and tokensAfter accurately', () => {
      writeVaultFile(GROUP, 'people', 'stale.md', daysAgo(50), 'A'.repeat(400));
      writeVaultFile(GROUP, 'people', 'fresh.md', daysAgo(1), 'B'.repeat(200));

      const result = pruneKnowledgeVault(GROUP, { ttlDays: 30 });

      expect(result.tokensBefore).toBeGreaterThan(result.tokensAfter);
      expect(result.archivedCount).toBe(1);
    });

    it('returns relative file paths in archivedFiles', () => {
      writeVaultFile(GROUP, 'decisions', 'old-decision.md', daysAgo(100));

      const result = pruneKnowledgeVault(GROUP, { ttlDays: 30 });

      expect(result.archivedFiles[0]).not.toContain(tmpDir);
      expect(result.archivedFiles[0]).toContain('decisions');
    });
  });
});
