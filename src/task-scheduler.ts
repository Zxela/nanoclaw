import { ChildProcess } from 'child_process';
import { CronExpressionParser } from 'cron-parser';
import fs from 'fs';

import path from 'path';
import {
  ASSISTANT_NAME,
  DATA_DIR,
  SCHEDULER_POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import { ContainerOutput, runContainerAgent } from './container-runner.js';
import {
  deleteSession,
  getConsecutiveFailures,
  getDueTasks,
  getTaskById,
  logTaskRun,
  updateTask,
  updateTaskAfterRun,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup, ScheduledTask } from './types.js';

/** Maximum consecutive failures before a task is auto-paused. */
export const MAX_TASK_RETRIES = 3;

/** Backoff delays (ms) indexed by failure count (1-based). */
const RETRY_BACKOFFS_MS = [60_000, 5 * 60_000, 15 * 60_000];

/**
 * Compute a retry next_run time based on how many consecutive failures
 * have occurred. Uses exponential-ish backoff: 1 min → 5 min → 15 min.
 */
export function computeRetryNextRun(consecutiveFailures: number): string {
  const idx = Math.min(consecutiveFailures - 1, RETRY_BACKOFFS_MS.length - 1);
  const backoffMs = RETRY_BACKOFFS_MS[idx];
  return new Date(Date.now() + backoffMs).toISOString();
}

/**
 * Compute the next run time for a recurring task, anchored to the
 * task's scheduled time rather than Date.now() to prevent cumulative
 * drift on interval-based tasks.
 *
 * Co-authored-by: @community-pr-601
 */
export function computeNextRun(task: ScheduledTask): string | null {
  if (task.schedule_type === 'once') return null;

  const now = Date.now();

  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    return interval.next().toISOString();
  }

  if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    if (!ms || ms <= 0) {
      // Guard against malformed interval that would cause an infinite loop
      logger.warn(
        { taskId: task.id, value: task.schedule_value },
        'Invalid interval value',
      );
      return new Date(now + 60_000).toISOString();
    }
    // Anchor to the scheduled time, not now, to prevent drift.
    // Skip past any missed intervals in O(1) so we always land in the future.
    let next = new Date(task.next_run!).getTime() + ms;
    if (next <= now) {
      const elapsed = now - next;
      next += Math.ceil(elapsed / ms) * ms;
    }
    return new Date(next).toISOString();
  }

  return null;
}

export interface SchedulerDependencies {
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  queue: GroupQueue;
  onProcess: (
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder: string,
    threadId?: string,
  ) => void;
  sendMessage: (
    jid: string,
    text: string,
    taskId?: string,
    sessionId?: string,
  ) => Promise<void>;
}

async function runTask(
  task: ScheduledTask,
  deps: SchedulerDependencies,
): Promise<void> {
  const startTime = Date.now();
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(task.group_folder);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Stop retry churn for malformed legacy rows.
    updateTask(task.id, { status: 'paused' });
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder, error },
      'Task has invalid group folder',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error,
    });
    return;
  }
  fs.mkdirSync(groupDir, { recursive: true });

  logger.info(
    { taskId: task.id, group: task.group_folder },
    'Running scheduled task',
  );

  const groups = deps.registeredGroups();
  const group = Object.values(groups).find(
    (g) => g.folder === task.group_folder,
  );

  if (!group) {
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder },
      'Group not found for task',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error: `Group not found: ${task.group_folder}`,
    });
    return;
  }

  let result: string | null = null;
  let error: string | null = null;
  let capturedSessionId: string | undefined;

  // For group context mode, use the group's current session
  const sessions = deps.getSessions();
  let sessionId =
    task.context_mode === 'group' ? sessions[task.group_folder] : undefined;

  // Verify session file exists on disk before trying to resume
  if (sessionId) {
    const taskSessionDir = path.join(
      DATA_DIR,
      'sessions',
      task.group_folder,
      `task_${task.id}`,
      '.claude',
      'projects',
      '-workspace-group',
    );
    const sessionFile = path.join(taskSessionDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(sessionFile)) {
      logger.debug(
        { taskId: task.id, sessionId },
        'Task session file missing on disk, starting fresh',
      );
      sessionId = undefined;
    }
  }

  // After the task produces a result, close the container promptly.
  // Tasks are single-turn — no need to wait IDLE_TIMEOUT (30 min) for the
  // query loop to time out. A short delay handles any final MCP calls.
  const TASK_CLOSE_DELAY_MS = 10000;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const taskThreadId = `task_${task.id}`;
  const scheduleClose = () => {
    if (closeTimer) return; // already scheduled
    closeTimer = setTimeout(() => {
      logger.debug({ taskId: task.id }, 'Closing task container after result');
      deps.queue.closeStdin(task.chat_jid, taskThreadId);
    }, TASK_CLOSE_DELAY_MS);
  };

  const executeTask = async (sid: string | undefined) => {
    result = null;
    error = null;
    capturedSessionId = undefined;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    const output = await runContainerAgent(
      group,
      {
        prompt: task.prompt,
        sessionId: sid,
        groupFolder: task.group_folder,
        chatJid: task.chat_jid,
        isMain: group.isMain === true,
        isScheduledTask: true,
        assistantName: ASSISTANT_NAME,
        threadId: taskThreadId,
      },
      (proc, containerName) =>
        deps.onProcess(
          task.chat_jid,
          proc,
          containerName,
          task.group_folder,
          taskThreadId,
        ),
      async (streamedOutput: ContainerOutput) => {
        if (streamedOutput.newSessionId) {
          capturedSessionId = streamedOutput.newSessionId;
        }
        if (streamedOutput.result) {
          result = streamedOutput.result;
          // Forward result to user (sendMessage handles formatting)
          await deps.sendMessage(
            task.chat_jid,
            streamedOutput.result,
            task.id,
            capturedSessionId,
          );
          scheduleClose();
        }
        if (streamedOutput.status === 'success') {
          deps.queue.notifyIdle(task.chat_jid, taskThreadId);
          scheduleClose(); // Close promptly even when result is null (e.g. IPC-only tasks)
        }
        if (streamedOutput.status === 'error') {
          error = streamedOutput.error || 'Unknown error';
        }
      },
    );

    if (closeTimer) clearTimeout(closeTimer);

    if (output.status === 'error') {
      error = output.error || 'Unknown error';
    } else if (output.result) {
      // Result was already forwarded to the user via the streaming callback above
      result = output.result;
    }

    return output;
  };

  try {
    const output = await executeTask(sessionId);

    // If session expired/invalid, clear it and retry with a fresh session
    if (
      sessionId &&
      output.error?.includes('No conversation found with session ID')
    ) {
      logger.warn(
        { taskId: task.id },
        'Task session expired, retrying with fresh session',
      );
      const currentSessions = deps.getSessions();
      delete currentSessions[task.group_folder];
      deleteSession(task.group_folder);

      // Retry once with no session (fresh conversation)
      await executeTask(undefined);
    }

    logger.info(
      { taskId: task.id, durationMs: Date.now() - startTime },
      'Task completed',
    );
  } catch (err) {
    if (closeTimer) clearTimeout(closeTimer);
    error = err instanceof Error ? err.message : String(err);
    logger.error({ taskId: task.id, error }, 'Task failed');
  }

  const durationMs = Date.now() - startTime;

  logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    status: error ? 'error' : 'success',
    result,
    error,
  });

  if (error) {
    // Count failures including this one (log was already written above)
    const failures = getConsecutiveFailures(task.id);

    if (failures >= MAX_TASK_RETRIES) {
      // Auto-pause after too many consecutive failures
      updateTask(task.id, { status: 'paused' });
      const msg = `⚠️ Scheduled task paused after ${failures} consecutive failures.\n\nTask: ${task.prompt.slice(0, 100)}\nLast error: ${error}`;
      await deps.sendMessage(task.chat_jid, msg).catch(() => {});
      logger.warn(
        { taskId: task.id, failures },
        'Task auto-paused after max consecutive failures',
      );
      return;
    }

    // Schedule a retry with backoff instead of the normal next_run
    const retryNextRun = computeRetryNextRun(failures);
    logger.info(
      { taskId: task.id, failures, retryNextRun },
      'Task failed — scheduled retry with backoff',
    );
    updateTaskAfterRun(
      task.id,
      retryNextRun,
      `Error (attempt ${failures}): ${error}`,
    );
    return;
  }

  const nextRun = computeNextRun(task);
  const resultSummary = result ? (result as string).slice(0, 200) : 'Completed';
  updateTaskAfterRun(task.id, nextRun, resultSummary);
}

let schedulerRunning = false;

export function startSchedulerLoop(deps: SchedulerDependencies): void {
  if (schedulerRunning) {
    logger.debug('Scheduler loop already running, skipping duplicate start');
    return;
  }
  schedulerRunning = true;
  logger.info('Scheduler loop started');

  const loop = async () => {
    try {
      const dueTasks = getDueTasks();

      for (const task of dueTasks) {
        // Re-check task status in case it was paused/cancelled
        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== 'active') {
          continue;
        }

        deps.queue.enqueueTask(
          currentTask.chat_jid,
          currentTask.id,
          () => runTask(currentTask, deps),
          'scheduled',
        );
      }
    } catch (err) {
      logger.error({ err }, 'Error in scheduler loop');
    }

    setTimeout(loop, SCHEDULER_POLL_INTERVAL);
  };

  loop();
}

/** @internal - for tests only. */
export function _resetSchedulerLoopForTests(): void {
  schedulerRunning = false;
}
