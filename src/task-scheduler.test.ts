import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _initTestDatabase,
  createTask,
  getTaskById,
  logTaskRun,
} from './db.js';
import {
  MAX_TASK_RETRIES,
  _resetSchedulerLoopForTests,
  computeNextRun,
  computeRetryNextRun,
  startSchedulerLoop,
} from './task-scheduler.js';

describe('task scheduler', () => {
  beforeEach(() => {
    _initTestDatabase();
    _resetSchedulerLoopForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses due tasks with invalid group folders to prevent retry churn', async () => {
    createTask({
      id: 'task-invalid-folder',
      group_folder: '../../outside',
      chat_jid: 'bad@g.us',
      prompt: 'run',
      schedule_type: 'once',
      schedule_value: '2026-02-22T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-02-22T00:00:00.000Z',
    });

    const enqueueTask = vi.fn(
      (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );

    startSchedulerLoop({
      registeredGroups: () => ({}),
      getSessions: () => ({}),
      queue: { enqueueTask } as any,
      onProcess: () => {},
      sendMessage: async () => {},
    });

    await vi.advanceTimersByTimeAsync(10);

    const task = getTaskById('task-invalid-folder');
    expect(task?.status).toBe('paused');
  });

  it('computeNextRun anchors interval tasks to scheduled time to prevent drift', () => {
    const scheduledTime = new Date(Date.now() - 2000).toISOString(); // 2s ago
    const task = {
      id: 'drift-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: '60000', // 1 minute
      context_mode: 'isolated' as const,
      next_run: scheduledTime,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();

    // Should be anchored to scheduledTime + 60s, NOT Date.now() + 60s
    const expected = new Date(scheduledTime).getTime() + 60000;
    expect(new Date(nextRun!).getTime()).toBe(expected);
  });

  it('computeNextRun returns null for once-tasks', () => {
    const task = {
      id: 'once-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'once' as const,
      schedule_value: '2026-01-01T00:00:00.000Z',
      context_mode: 'isolated' as const,
      next_run: new Date(Date.now() - 1000).toISOString(),
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    expect(computeNextRun(task)).toBeNull();
  });

  it('computeNextRun skips missed intervals without infinite loop', () => {
    // Task was due 10 intervals ago (missed)
    const ms = 60000;
    const missedBy = ms * 10;
    const scheduledTime = new Date(Date.now() - missedBy).toISOString();

    const task = {
      id: 'skip-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: String(ms),
      context_mode: 'isolated' as const,
      next_run: scheduledTime,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();
    // Must be in the future
    expect(new Date(nextRun!).getTime()).toBeGreaterThanOrEqual(Date.now());
    // Must be aligned to the original schedule grid
    const offset =
      (new Date(nextRun!).getTime() - new Date(scheduledTime).getTime()) % ms;
    expect(offset).toBe(0);
  });
});

describe('task retry logic', () => {
  const baseTask = {
    id: 'retry-task',
    group_folder: 'test-group',
    chat_jid: 'test@g.us',
    prompt: 'do something',
    schedule_type: 'interval' as const,
    schedule_value: '3600000', // 1 hour
    context_mode: 'isolated' as const,
    next_run: new Date(Date.now() - 1000).toISOString(),
    status: 'active' as const,
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    _initTestDatabase();
    _resetSchedulerLoopForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computeRetryNextRun returns 1 min backoff on first failure', () => {
    const before = Date.now();
    const nextRun = computeRetryNextRun(1);
    const delay = new Date(nextRun).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(60_000 - 50);
    expect(delay).toBeLessThanOrEqual(60_000 + 50);
  });

  it('computeRetryNextRun returns 5 min backoff on second failure', () => {
    const before = Date.now();
    const nextRun = computeRetryNextRun(2);
    const delay = new Date(nextRun).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(5 * 60_000 - 50);
    expect(delay).toBeLessThanOrEqual(5 * 60_000 + 50);
  });

  it('computeRetryNextRun caps at 15 min for high failure counts', () => {
    const before = Date.now();
    const nextRun = computeRetryNextRun(99);
    const delay = new Date(nextRun).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(15 * 60_000 - 50);
    expect(delay).toBeLessThanOrEqual(15 * 60_000 + 50);
  });

  it('schedules a retry with backoff after first failure', async () => {
    createTask(baseTask);

    const enqueueTask = vi.fn(
      (_jid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );
    const sendMessage = vi.fn(async () => {});
    const mockGroup = {
      name: 'test',
      folder: 'test-group',
      trigger: '@test',
      added_at: new Date().toISOString(),
    };

    vi.mock('./container-runner.js', () => ({
      runContainerAgent: vi.fn(async () => ({
        status: 'error',
        error: 'container crashed',
        result: null,
      })),
    }));

    startSchedulerLoop({
      registeredGroups: () => ({ 'test@g.us': mockGroup }),
      getSessions: () => ({}),
      queue: { enqueueTask, closeStdin: vi.fn(), notifyIdle: vi.fn() } as any,
      onProcess: vi.fn(),
      sendMessage,
    });

    await vi.advanceTimersByTimeAsync(100);

    const task = getTaskById('retry-task');
    // Task should still be active (not paused) after just one failure
    expect(task?.status).toBe('active');
    // next_run should be ~1 min in the future (retry backoff)
    const nextRunMs = new Date(task!.next_run!).getTime();
    const nowMs = Date.now();
    expect(nextRunMs).toBeGreaterThan(nowMs + 30_000);
    expect(nextRunMs).toBeLessThan(nowMs + 2 * 60_000);
  });

  it('auto-pauses task and notifies after max consecutive failures', async () => {
    createTask(baseTask);

    // Pre-fill run logs with MAX_TASK_RETRIES - 1 existing failures
    for (let i = 0; i < MAX_TASK_RETRIES - 1; i++) {
      logTaskRun({
        task_id: 'retry-task',
        run_at: new Date(
          Date.now() - (MAX_TASK_RETRIES - i) * 1000,
        ).toISOString(),
        duration_ms: 100,
        status: 'error',
        result: null,
        error: 'prior failure',
      });
    }

    const enqueueTask = vi.fn(
      (_jid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );
    const sendMessage = vi.fn(async () => {});
    const mockGroup = {
      name: 'test',
      folder: 'test-group',
      trigger: '@test',
      added_at: new Date().toISOString(),
    };

    vi.mock('./container-runner.js', () => ({
      runContainerAgent: vi.fn(async () => ({
        status: 'error',
        error: 'persistent crash',
        result: null,
      })),
    }));

    startSchedulerLoop({
      registeredGroups: () => ({ 'test@g.us': mockGroup }),
      getSessions: () => ({}),
      queue: { enqueueTask, closeStdin: vi.fn(), notifyIdle: vi.fn() } as any,
      onProcess: vi.fn(),
      sendMessage,
    });

    await vi.advanceTimersByTimeAsync(100);

    const task = getTaskById('retry-task');
    expect(task?.status).toBe('paused');
    expect(sendMessage).toHaveBeenCalledWith(
      'test@g.us',
      expect.stringContaining('paused after'),
    );
  });
});
