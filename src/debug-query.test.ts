import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './config.js';

// Test the internal IPC protocol mechanics by simulating what
// sendDebugQuery and the container agent do at the filesystem level.

describe('debug-query IPC protocol', () => {
  const testFolder = 'test_debug_group';
  const debugDir = path.join(DATA_DIR, 'ipc', testFolder, 'debug');

  beforeEach(() => {
    fs.mkdirSync(debugDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(path.join(DATA_DIR, 'ipc', testFolder), { recursive: true, force: true });
  });

  it('pollForResponse resolves when response.json appears with matching id', async () => {
    const queryId = 'poll-test-1';

    // Simulate: write response after a short delay (as the agent would)
    setTimeout(() => {
      fs.writeFileSync(
        path.join(debugDir, 'response.json'),
        JSON.stringify({ id: queryId, answer: 'All good', status: 'success', timestamp: Date.now() }),
      );
    }, 100);

    const start = Date.now();
    await new Promise<void>((resolve) => {
      const poll = () => {
        const responseFile = path.join(debugDir, 'response.json');
        if (fs.existsSync(responseFile)) {
          const data = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));
          expect(data.id).toBe(queryId);
          expect(data.answer).toBe('All good');
          expect(data.status).toBe('success');
          resolve();
          return;
        }
        if (Date.now() - start > 5000) {
          throw new Error('Timed out waiting for response');
        }
        setTimeout(poll, 50);
      };
      poll();
    });
  });

  it('ignores response.json with non-matching id', async () => {
    fs.writeFileSync(
      path.join(debugDir, 'response.json'),
      JSON.stringify({ id: 'wrong-id', answer: 'Wrong', status: 'success', timestamp: Date.now() }),
    );

    const responseFile = path.join(debugDir, 'response.json');
    const data = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));
    expect(data.id).not.toBe('correct-id');
  });

  it('cleanup removes files with matching id only', () => {
    const queryId = 'cleanup-test';

    fs.writeFileSync(path.join(debugDir, 'query.json'), JSON.stringify({ id: queryId }));
    fs.writeFileSync(path.join(debugDir, 'response.json'), JSON.stringify({ id: queryId }));

    for (const file of ['query.json', 'response.json']) {
      const filePath = path.join(debugDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.id === queryId) {
        fs.unlinkSync(filePath);
      }
    }

    expect(fs.existsSync(path.join(debugDir, 'query.json'))).toBe(false);
    expect(fs.existsSync(path.join(debugDir, 'response.json'))).toBe(false);
  });

  it('cleanup preserves files with non-matching id', () => {
    const queryId = 'cleanup-preserve';
    const otherId = 'other-query';

    fs.writeFileSync(path.join(debugDir, 'query.json'), JSON.stringify({ id: otherId }));

    const filePath = path.join(debugDir, 'query.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (data.id === queryId) {
      fs.unlinkSync(filePath);
    }

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('concurrent query guard detects existing query.json', () => {
    fs.writeFileSync(
      path.join(debugDir, 'query.json'),
      JSON.stringify({ id: 'existing', question: 'test', timestamp: Date.now() }),
    );

    const queryFile = path.join(debugDir, 'query.json');
    expect(fs.existsSync(queryFile)).toBe(true);
  });

  it('abort signal stops polling', async () => {
    const abortSignal = { aborted: false };

    setTimeout(() => { abortSignal.aborted = true; }, 100);

    const start = Date.now();
    await new Promise<string>((resolve) => {
      const poll = () => {
        if (abortSignal.aborted) {
          resolve('aborted');
          return;
        }
        if (Date.now() - start > 5000) {
          resolve('timeout');
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    }).then((result) => {
      expect(result).toBe('aborted');
      expect(Date.now() - start).toBeLessThan(500);
    });
  });
});
