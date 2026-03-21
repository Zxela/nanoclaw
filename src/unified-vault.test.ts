import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config and logger before importing the module under test
vi.mock('./config.js', () => ({
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
}));

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { syncUnifiedVault } from './unified-vault.js';

const GROUPS_DIR = '/tmp/nanoclaw-test-groups';
const VAULT_DIR = path.join(GROUPS_DIR, '_vault');

describe('syncUnifiedVault', () => {
  beforeEach(() => {
    fs.rmSync(GROUPS_DIR, { recursive: true, force: true });
    fs.mkdirSync(GROUPS_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(GROUPS_DIR, { recursive: true, force: true });
  });

  it('does nothing when no groups have knowledge dirs', () => {
    fs.mkdirSync(path.join(GROUPS_DIR, 'mygroup'), { recursive: true });
    syncUnifiedVault();
    expect(fs.existsSync(VAULT_DIR)).toBe(false);
  });

  it('creates symlinks for groups with knowledge directories', () => {
    // Create two groups with knowledge dirs
    fs.mkdirSync(path.join(GROUPS_DIR, 'alpha', 'knowledge'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(GROUPS_DIR, 'beta', 'knowledge'), {
      recursive: true,
    });
    // Create a group WITHOUT knowledge — should be skipped
    fs.mkdirSync(path.join(GROUPS_DIR, 'gamma'), { recursive: true });

    syncUnifiedVault();

    // Verify symlinks exist and point correctly
    const alphaLink = path.join(VAULT_DIR, 'alpha');
    const betaLink = path.join(VAULT_DIR, 'beta');
    expect(fs.lstatSync(alphaLink).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(betaLink).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(VAULT_DIR, 'gamma'))).toBe(false);

    // Verify symlink targets resolve correctly
    expect(fs.realpathSync(alphaLink)).toBe(
      path.join(GROUPS_DIR, 'alpha', 'knowledge'),
    );
  });

  it('generates dashboard with links to each group', () => {
    fs.mkdirSync(path.join(GROUPS_DIR, 'alpha', 'knowledge'), {
      recursive: true,
    });
    syncUnifiedVault();

    const dashboard = fs.readFileSync(
      path.join(VAULT_DIR, '_dashboard.md'),
      'utf-8',
    );
    expect(dashboard).toContain('[[alpha/]]');
    expect(dashboard).toContain('NanoClaw Knowledge Vault');
  });

  it('creates .obsidian config directory', () => {
    fs.mkdirSync(path.join(GROUPS_DIR, 'alpha', 'knowledge'), {
      recursive: true,
    });
    syncUnifiedVault();

    const obsidianDir = path.join(VAULT_DIR, '.obsidian');
    expect(fs.existsSync(path.join(obsidianDir, 'app.json'))).toBe(true);
    expect(fs.existsSync(path.join(obsidianDir, 'graph.json'))).toBe(true);

    const graphConfig = JSON.parse(
      fs.readFileSync(path.join(obsidianDir, 'graph.json'), 'utf-8'),
    );
    expect(graphConfig.colorGroups).toHaveLength(1);
    expect(graphConfig.colorGroups[0].query).toBe('path:alpha/');
  });

  it('removes stale symlinks for deleted groups', () => {
    // First sync with two groups
    fs.mkdirSync(path.join(GROUPS_DIR, 'alpha', 'knowledge'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(GROUPS_DIR, 'beta', 'knowledge'), {
      recursive: true,
    });
    syncUnifiedVault();
    expect(fs.existsSync(path.join(VAULT_DIR, 'beta'))).toBe(true);

    // Remove beta's knowledge dir and re-sync
    fs.rmSync(path.join(GROUPS_DIR, 'beta', 'knowledge'), { recursive: true });
    syncUnifiedVault();

    expect(fs.existsSync(path.join(VAULT_DIR, 'beta'))).toBe(false);
    expect(fs.lstatSync(path.join(VAULT_DIR, 'alpha')).isSymbolicLink()).toBe(
      true,
    );
  });

  it('skips _vault and hidden directories', () => {
    fs.mkdirSync(path.join(GROUPS_DIR, '.hidden', 'knowledge'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(GROUPS_DIR, 'alpha', 'knowledge'), {
      recursive: true,
    });
    syncUnifiedVault();

    expect(fs.existsSync(path.join(VAULT_DIR, '.hidden'))).toBe(false);
    expect(fs.lstatSync(path.join(VAULT_DIR, 'alpha')).isSymbolicLink()).toBe(
      true,
    );
  });

  it('is idempotent — re-running does not error', () => {
    fs.mkdirSync(path.join(GROUPS_DIR, 'alpha', 'knowledge'), {
      recursive: true,
    });
    syncUnifiedVault();
    // Run again — should not throw
    expect(() => syncUnifiedVault()).not.toThrow();
  });
});
