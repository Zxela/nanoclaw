import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/nanoclaw-test-gq',
  MAX_CONCURRENT_CONTAINERS: 5,
  MAX_CONTAINERS_PER_GROUP: 3,
}));

vi.mock('./container-runtime.js', () => ({
  stopContainerAsync: vi.fn((_name: string, cb: (err: Error | null) => void) =>
    cb(null),
  ),
}));

import { GroupQueue } from './group-queue.js';
import { stopContainerAsync } from './container-runtime.js';

describe('GroupQueue.stopContainer', () => {
  const groupJid = 'test-group@jid';
  const threadId = 'default';
  let queue: GroupQueue;

  beforeEach(() => {
    queue = new GroupQueue();
    fs.mkdirSync('/tmp/nanoclaw-test-gq/ipc/test-folder/default/input', {
      recursive: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    fs.rmSync('/tmp/nanoclaw-test-gq', { recursive: true, force: true });
  });

  it('returns { stopped: false } when no active container', () => {
    const result = queue.stopContainer(groupJid, threadId);
    expect(result.stopped).toBe(false);
  });

  it('writes _stop sentinel and returns { stopped: true } for active container', () => {
    const fakeProc = { killed: false, kill: vi.fn() } as any;
    queue.registerProcess(
      groupJid,
      fakeProc,
      'nanoclaw-test-123',
      'test-folder',
      threadId,
    );
    const key = `${groupJid}:${threadId}`;
    (queue as any).threads.get(key).active = true;
    (queue as any).threads.get(key).groupFolder = 'test-folder';
    (queue as any).getGroup(groupJid).activeThreadCount = 1;
    (queue as any).activeCount = 1;

    const result = queue.stopContainer(groupJid, threadId);
    expect(result.stopped).toBe(true);

    const sentinelPath =
      '/tmp/nanoclaw-test-gq/ipc/test-folder/default/input/_stop';
    expect(fs.existsSync(sentinelPath)).toBe(true);
  });

  it('calls stopContainerAsync after 5s grace period', async () => {
    vi.useFakeTimers();

    const fakeProc = { killed: false, kill: vi.fn() } as any;
    queue.registerProcess(
      groupJid,
      fakeProc,
      'nanoclaw-test-456',
      'test-folder',
      threadId,
    );
    const key = `${groupJid}:${threadId}`;
    (queue as any).threads.get(key).active = true;
    (queue as any).threads.get(key).groupFolder = 'test-folder';

    queue.stopContainer(groupJid, threadId);

    expect(stopContainerAsync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(stopContainerAsync).toHaveBeenCalledWith(
      'nanoclaw-test-456',
      expect.any(Function),
    );

    vi.useRealTimers();
  });

  it('skips hard kill if container already exited', async () => {
    vi.useFakeTimers();

    const fakeProc = { killed: false, kill: vi.fn() } as any;
    queue.registerProcess(
      groupJid,
      fakeProc,
      'nanoclaw-test-789',
      'test-folder',
      threadId,
    );
    const key = `${groupJid}:${threadId}`;
    (queue as any).threads.get(key).active = true;
    (queue as any).threads.get(key).groupFolder = 'test-folder';

    queue.stopContainer(groupJid, threadId);

    (queue as any).threads.get(key).active = false;
    (queue as any).threads.get(key).process = null;

    vi.advanceTimersByTime(5000);
    expect(stopContainerAsync).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
