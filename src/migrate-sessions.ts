import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { getThreadContextByThreadId } from './db.js';
import { logger } from './logger.js';

const MARKER_FILE = path.join(DATA_DIR, '.session-migration-v1-done');

/**
 * One-time migration: rename session and IPC directories from pending-{id}
 * and Discord-thread-ID formats to the stable ctx-{id} naming scheme.
 *
 * Runs once on startup if the marker file doesn't exist.
 */
export function migrateSessionDirs(): void {
  if (fs.existsSync(MARKER_FILE)) return;

  const roots = [path.join(DATA_DIR, 'sessions'), path.join(DATA_DIR, 'ipc')];

  let migrated = 0;
  let deleted = 0;
  let skipped = 0;

  for (const rootDir of roots) {
    if (!fs.existsSync(rootDir)) continue;

    for (const groupFolder of fs.readdirSync(rootDir)) {
      const groupDir = path.join(rootDir, groupFolder);
      if (!fs.statSync(groupDir).isDirectory()) continue;

      for (const entry of fs.readdirSync(groupDir)) {
        const entryPath = path.join(groupDir, entry);
        if (!fs.statSync(entryPath).isDirectory()) continue;

        // Skip known non-thread directories
        if (
          entry === '.claude' ||
          entry === 'agent-runner-src' ||
          entry.startsWith('task_') ||
          entry.startsWith('ctx-')
        ) {
          continue;
        }

        // Case 1: pending-{id} directories — extract numeric ID directly
        const pendingMatch = entry.match(/^pending-(\d+)$/);
        if (pendingMatch) {
          const ctxId = pendingMatch[1];
          const target = path.join(groupDir, `ctx-${ctxId}`);
          if (fs.existsSync(target)) {
            fs.rmSync(entryPath, { recursive: true });
            deleted++;
          } else {
            fs.renameSync(entryPath, target);
            migrated++;
          }
          continue;
        }

        // Case 2: Numeric directories (Discord thread IDs) — look up in DB
        if (/^\d+$/.test(entry)) {
          const ctx = getThreadContextByThreadId(entry);
          if (ctx) {
            const target = path.join(groupDir, `ctx-${ctx.id}`);
            if (fs.existsSync(target)) {
              // Conflict: keep whichever has the newer .jsonl
              const existingTime = newestJsonlMtime(target);
              const candidateTime = newestJsonlMtime(entryPath);
              if (candidateTime > existingTime) {
                fs.rmSync(target, { recursive: true });
                fs.renameSync(entryPath, target);
              } else {
                fs.rmSync(entryPath, { recursive: true });
              }
              deleted++;
            } else {
              fs.renameSync(entryPath, target);
              migrated++;
            }
          } else {
            // No matching DB record — orphaned
            fs.rmSync(entryPath, { recursive: true });
            deleted++;
          }
          continue;
        }

        // Unknown directory format — skip
        skipped++;
      }
    }
  }

  logger.info(
    { migrated, deleted, skipped },
    'Session directory migration complete',
  );
  fs.writeFileSync(MARKER_FILE, new Date().toISOString());
}

function newestJsonlMtime(dir: string): number {
  let newest = 0;
  try {
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d)) {
        const p = path.join(d, entry);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) walk(p);
        else if (entry.endsWith('.jsonl') && stat.mtimeMs > newest) {
          newest = stat.mtimeMs;
        }
      }
    };
    walk(dir);
  } catch {
    // ignore
  }
  return newest;
}
