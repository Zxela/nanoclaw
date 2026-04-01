/**
 * Tests for the list_tasks IPC handler.
 * Verifies that last_run, last_result, and run_count are included in the response.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _initTestDatabase,
  createTask,
  logTaskRun,
  setRegisteredGroup,
} from './db.js';
import { _processQueueFile, IpcDeps } from './ipc.js';
import { RegisteredGroup } from './types.js';

const MAIN_GROUP: RegisteredGroup = {
  name: 'Main',
  folder: 'discord_main',
  trigger: 'always',
  added_at: '2024-01-01T00:00:00.000Z',
  isMain: true,
};

const OTHER_GROUP: RegisteredGroup = {
  name: 'Other',
  folder: 'discord_other',
  trigger: '@Jarvis',
  added_at: '2024-01-01T00:00:00.000Z',
};

const MAIN_JID = 'main@g.us';
const OTHER_JID = 'other@g.us';

let tmpDir: string;
let deps: IpcDeps;
let groups: Record<string, RegisteredGroup>;

beforeEach(() => {
  _initTestDatabase();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-list-tasks-test-'));

  groups = {
    [MAIN_JID]: MAIN_GROUP,
    [OTHER_JID]: OTHER_GROUP,
  };

  setRegisteredGroup(MAIN_JID, MAIN_GROUP);
  setRegisteredGroup(OTHER_JID, OTHER_GROUP);

  deps = {
    sendMessage: vi.fn(),
    sendChannelMessage: vi.fn(),
    sendFile: vi.fn(),
    registeredGroups: () => groups,
    registerGroup: () => {},
    syncGroups: async () => {},
    getAvailableGroups: () => [],
    writeGroupsSnapshot: () => {},
    onTasksChanged: () => {},
  } as unknown as IpcDeps;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Reads the response file written by the list_tasks handler. */
function readResponse(requestId: string): unknown[] {
  const responseFile = path.join(
    tmpDir,
    'input',
    `list_tasks-${requestId}.json`,
  );
  const raw = fs.readFileSync(responseFile, 'utf8');
  return JSON.parse(raw) as unknown[];
}

/** Sends a list_tasks IPC request and returns the response. */
async function listTasks(
  requestId: string,
  opts: { sourceGroup?: string; isMain?: boolean } = {},
): Promise<unknown[]> {
  const { sourceGroup = OTHER_GROUP.folder, isMain = false } = opts;
  await _processQueueFile(
    { type: 'list_tasks', requestId },
    sourceGroup,
    undefined,
    isMain,
    tmpDir,
    tmpDir,
    deps,
    groups,
  );
  return readResponse(requestId);
}

describe('list_tasks — basic response', () => {
  it('returns empty array when no tasks exist', async () => {
    const result = await listTasks('req-empty');
    expect(result).toEqual([]);
  });

  it('includes core task fields in the response', async () => {
    createTask({
      id: 'task-1',
      group_folder: OTHER_GROUP.folder,
      chat_jid: OTHER_JID,
      prompt: 'say hello',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      context_mode: 'isolated',
      next_run: '2024-06-01T09:00:00.000Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const result = (await listTasks('req-core')) as Record<string, unknown>[];
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('task-1');
    expect(result[0].prompt).toBe('say hello');
    expect(result[0].status).toBe('active');
    expect(result[0].schedule_type).toBe('cron');
    expect(result[0].next_run).toBe('2024-06-01T09:00:00.000Z');
  });

  it('ignores missing requestId (no crash)', async () => {
    await _processQueueFile(
      { type: 'list_tasks' }, // no requestId
      OTHER_GROUP.folder,
      undefined,
      false,
      tmpDir,
      tmpDir,
      deps,
      groups,
    );
    // No response file written — no crash
    expect(fs.existsSync(path.join(tmpDir, 'input', 'list_tasks-.json'))).toBe(
      false,
    );
  });
});

describe('list_tasks — run history fields', () => {
  it('includes run_count = 0 for a task with no run logs', async () => {
    createTask({
      id: 'task-no-runs',
      group_folder: OTHER_GROUP.folder,
      chat_jid: OTHER_JID,
      prompt: 'never ran',
      schedule_type: 'once',
      schedule_value: '2024-12-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const result = (await listTasks('req-no-runs')) as Record<
      string,
      unknown
    >[];
    expect(result[0].run_count).toBe(0);
    expect(result[0].last_run).toBeNull();
    expect(result[0].last_result).toBeNull();
  });

  it('includes correct run_count after runs are logged', async () => {
    createTask({
      id: 'task-ran-3',
      group_folder: OTHER_GROUP.folder,
      chat_jid: OTHER_JID,
      prompt: 'ran 3 times',
      schedule_type: 'interval',
      schedule_value: '3600000',
      context_mode: 'isolated',
      next_run: '2024-06-02T00:00:00.000Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    logTaskRun({
      task_id: 'task-ran-3',
      run_at: '2024-06-01T10:00:00.000Z',
      duration_ms: 500,
      status: 'success',
      result: 'ok',
      error: null,
    });
    logTaskRun({
      task_id: 'task-ran-3',
      run_at: '2024-06-01T11:00:00.000Z',
      duration_ms: 600,
      status: 'error',
      result: null,
      error: 'timeout',
    });
    logTaskRun({
      task_id: 'task-ran-3',
      run_at: '2024-06-01T12:00:00.000Z',
      duration_ms: 400,
      status: 'success',
      result: 'done',
      error: null,
    });

    const result = (await listTasks('req-count')) as Record<string, unknown>[];
    expect(result[0].run_count).toBe(3);
  });

  it('includes last_run and last_result from the scheduled_tasks table', async () => {
    createTask({
      id: 'task-last-run',
      group_folder: OTHER_GROUP.folder,
      chat_jid: OTHER_JID,
      prompt: 'track last run',
      schedule_type: 'cron',
      schedule_value: '0 * * * *',
      context_mode: 'group',
      next_run: '2024-06-02T00:00:00.000Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    // Simulate what updateTaskAfterRun does
    const { updateTaskAfterRun } = await import('./db.js');
    updateTaskAfterRun(
      'task-last-run',
      '2024-06-02T01:00:00.000Z',
      'completed successfully',
    );

    const result = (await listTasks('req-last-run')) as Record<
      string,
      unknown
    >[];
    expect(result[0].last_run).not.toBeNull();
    expect(result[0].last_result).toBe('completed successfully');
  });
});

describe('list_tasks — group scoping', () => {
  beforeEach(() => {
    createTask({
      id: 'task-main',
      group_folder: MAIN_GROUP.folder,
      chat_jid: MAIN_JID,
      prompt: 'main task',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });
    createTask({
      id: 'task-other',
      group_folder: OTHER_GROUP.folder,
      chat_jid: OTHER_JID,
      prompt: 'other task',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });
  });

  it('main group sees tasks from all groups', async () => {
    const result = await listTasks('req-main-all', {
      sourceGroup: MAIN_GROUP.folder,
      isMain: true,
    });
    expect(result).toHaveLength(2);
  });

  it('non-main group only sees its own tasks', async () => {
    const result = (await listTasks('req-other-scoped', {
      sourceGroup: OTHER_GROUP.folder,
      isMain: false,
    })) as Record<string, unknown>[];
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('task-other');
  });

  it('run_count is scoped correctly per task', async () => {
    logTaskRun({
      task_id: 'task-main',
      run_at: '2024-06-01T10:00:00.000Z',
      duration_ms: 100,
      status: 'success',
      result: 'ok',
      error: null,
    });

    const result = (await listTasks('req-other-counts', {
      sourceGroup: OTHER_GROUP.folder,
      isMain: false,
    })) as Record<string, unknown>[];
    // other task has 0 runs even though main task has 1
    expect(result[0].run_count).toBe(0);
  });
});
