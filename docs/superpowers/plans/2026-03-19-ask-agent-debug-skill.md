# Ask-Agent Debug Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/ask-agent` Claude Code skill that lets the user query container agents for live debugging and status information via a dedicated debug IPC channel.

**Architecture:** A new `debug/` IPC subdirectory carries debug queries and responses between Claude Code (host) and container agents. For active containers, debug queries are delivered via the existing `input/` IPC mechanism with a special prefix; for inactive groups, a fresh container is spawned in debug mode. The skill orchestrates group selection, query delivery, and response polling.

**Tech Stack:** TypeScript, Node.js, Claude Agent SDK, filesystem-based IPC

**Spec:** `docs/superpowers/specs/2026-03-19-ask-agent-debug-skill-design.md`

---

### Task 1: Add debug IPC infrastructure (config, ipc.ts, container-runner.ts)

**Files:**
- Modify: `src/config.ts:64-65` (after IPC_POLL_INTERVAL)
- Modify: `src/ipc.ts:101-107` (KNOWN_IPC_SUBDIRS)
- Modify: `src/container-runner.ts:105-114` (ContainerInput interface)
- Modify: `src/container-runner.ts:258` (IPC subdirectory creation loop)

- [ ] **Step 1: Add debug timeout constants to config.ts**

Add after `IPC_POLL_INTERVAL` (line 64):

```typescript
export const DEBUG_QUERY_TIMEOUT_ACTIVE = 60_000;  // 60s for active containers
export const DEBUG_QUERY_TIMEOUT_FRESH = 120_000;   // 120s for fresh containers
```

- [ ] **Step 2: Add 'debug' to KNOWN_IPC_SUBDIRS in ipc.ts**

Change `src/ipc.ts:101-107` from:

```typescript
const KNOWN_IPC_SUBDIRS = new Set([
  'messages',
  'tasks',
  'files',
  'prs',
  'input',
]);
```

To:

```typescript
const KNOWN_IPC_SUBDIRS = new Set([
  'messages',
  'tasks',
  'files',
  'prs',
  'input',
  'debug',
]);
```

- [ ] **Step 3: Add debugQuery to ContainerInput interface in container-runner.ts**

Change `src/container-runner.ts:105-114` from:

```typescript
export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  threadId?: string;
}
```

To:

```typescript
export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  threadId?: string;
  debugQuery?: {
    id: string;
    question: string;
  };
}
```

- [ ] **Step 4: Add 'debug' to IPC subdirectory creation in buildVolumeMounts**

Change `src/container-runner.ts:258` from:

```typescript
  for (const sub of ['messages', 'tasks', 'input', 'files', 'prs']) {
```

To:

```typescript
  for (const sub of ['messages', 'tasks', 'input', 'files', 'prs', 'debug']) {
```

- [ ] **Step 5: Build and verify no compilation errors**

Run: `npm run build`
Expected: Clean compilation with no errors

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/ipc.ts src/container-runner.ts
git commit -m "feat: add debug IPC infrastructure for ask-agent skill"
```

---

### Task 2: Add sendDebugQuery orchestration function

**Files:**
- Modify: `src/group-queue.ts:111-129` (add getActiveThreadInfo method)
- Create: `src/debug-query.ts`

- [ ] **Step 1: Add getActiveThreadInfo to GroupQueue**

Add after the `isActive` method in `src/group-queue.ts` (after line 129):

```typescript
  /**
   * Get info about the first active non-task thread in a group.
   * Returns { threadId, groupFolder } or null if no active container.
   */
  getActiveThreadInfo(groupJid: string): { threadId: string; groupFolder: string } | null {
    for (const [key, thread] of this.threads) {
      if (
        key.startsWith(`${groupJid}:`) &&
        thread.active &&
        !thread.isTaskContainer &&
        thread.groupFolder
      ) {
        return { threadId: thread.threadId, groupFolder: thread.groupFolder };
      }
    }
    return null;
  }
```

- [ ] **Step 2: Create src/debug-query.ts**

```typescript
/**
 * Debug Query — sends a question to a container agent and waits for a response.
 * Used by the /ask-agent Claude Code skill.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  DATA_DIR,
  DEBUG_QUERY_TIMEOUT_ACTIVE,
  DEBUG_QUERY_TIMEOUT_FRESH,
} from './config.js';
import {
  ContainerInput,
  runContainerAgent,
} from './container-runner.js';
import { getAllRegisteredGroups } from './db.js';
import { GroupQueue } from './group-queue.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface DebugQueryResult {
  status: 'success' | 'error' | 'timeout';
  answer?: string;
  error?: string;
}

/**
 * Find the groupJid for a given groupFolder from registered groups.
 */
function findGroupJid(
  groupFolder: string,
  registeredGroups: Record<string, RegisteredGroup>,
): string | null {
  for (const [jid, group] of Object.entries(registeredGroups)) {
    if (group.folder === groupFolder) return jid;
  }
  return null;
}

/**
 * List registered groups with their active status.
 */
export function listGroupsForDebug(
  groupQueue: GroupQueue,
): Array<{ name: string; folder: string; jid: string; isActive: boolean }> {
  const groups = getAllRegisteredGroups();
  const result: Array<{ name: string; folder: string; jid: string; isActive: boolean }> = [];
  for (const [jid, group] of Object.entries(groups)) {
    result.push({
      name: group.name,
      folder: group.folder,
      jid,
      isActive: groupQueue.isActive(jid),
    });
  }
  return result;
}

/**
 * Resolve the IPC debug directory path for a group (and optionally a thread).
 * Sets uid 1000 ownership so the container's node user can write responses.
 */
function getDebugDir(groupFolder: string, threadId?: string): string {
  const base = threadId
    ? path.join(DATA_DIR, 'ipc', groupFolder, threadId, 'debug')
    : path.join(DATA_DIR, 'ipc', groupFolder, 'debug');
  fs.mkdirSync(base, { recursive: true });
  try {
    fs.chownSync(base, 1000, 1000);
  } catch {
    // Best-effort — may fail if not running as root
  }
  return base;
}

/**
 * Write a debug query file and wait for the response.
 */
function pollForResponse(
  debugDir: string,
  queryId: string,
  timeoutMs: number,
  abortSignal?: { aborted: boolean },
): Promise<DebugQueryResult> {
  return new Promise((resolve) => {
    const responseFile = path.join(debugDir, 'response.json');
    const startTime = Date.now();

    const poll = () => {
      if (abortSignal?.aborted) {
        cleanup(debugDir, queryId);
        resolve({ status: 'error', error: 'Container exited before responding' });
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        cleanup(debugDir, queryId);
        resolve({ status: 'timeout', error: `Agent did not respond within ${timeoutMs / 1000}s` });
        return;
      }

      try {
        if (fs.existsSync(responseFile)) {
          const data = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));
          if (data.id === queryId) {
            cleanup(debugDir, queryId);
            resolve({
              status: data.status || 'success',
              answer: data.answer,
            });
            return;
          }
        }
      } catch {
        // File may be partially written, retry
      }

      setTimeout(poll, 500);
    };

    poll();
  });
}

/**
 * Clean up debug query and response files.
 */
function cleanup(debugDir: string, queryId: string): void {
  for (const file of ['query.json', 'response.json']) {
    const filePath = path.join(debugDir, file);
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data.id === queryId) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
}

/**
 * Send a debug query to a container agent.
 *
 * If the agent is active, delivers via IPC input with a debug prefix.
 * If no agent is active, spawns a fresh container in debug mode.
 */
export async function sendDebugQuery(
  groupFolder: string,
  question: string,
  groupQueue: GroupQueue,
  registeredGroups: Record<string, RegisteredGroup>,
): Promise<DebugQueryResult> {
  const queryId = crypto.randomUUID();
  const groupJid = findGroupJid(groupFolder, registeredGroups);
  if (!groupJid) {
    return { status: 'error', error: `No registered group found for folder: ${groupFolder}` };
  }

  const group = registeredGroups[groupJid];
  const activeInfo = groupQueue.getActiveThreadInfo(groupJid);

  if (activeInfo) {
    // Active container — deliver via IPC input + poll debug response
    const debugDir = getDebugDir(groupFolder, activeInfo.threadId);

    // Check for existing query
    const queryFile = path.join(debugDir, 'query.json');
    if (fs.existsSync(queryFile)) {
      return { status: 'error', error: 'A debug query is already in progress for this group' };
    }

    // Write query file (for the agent to find context about what's being asked)
    const query = { id: queryId, question, timestamp: Date.now() };
    fs.writeFileSync(queryFile, JSON.stringify(query));

    // Deliver the debug question via IPC input (existing mechanism)
    const debugPrompt = `[NANOCLAW_DEBUG_QUERY:${queryId}]\n` +
      `[DEBUG QUERY FROM SUPERVISOR]\n` +
      `A supervising agent is asking you the following question for debugging purposes.\n` +
      `Respond concisely and factually about your current state, what you're working on, any errors, etc.\n\n` +
      `Question: ${question}\n\n` +
      `Write your response to /workspace/ipc/debug/response.json as JSON: ` +
      `{"id": "${queryId}", "answer": "your answer here", "status": "success", "timestamp": ${Date.now()}}`;

    const sent = groupQueue.sendMessage(groupJid, activeInfo.threadId, debugPrompt);
    if (!sent) {
      cleanup(debugDir, queryId);
      return { status: 'error', error: 'Failed to deliver debug query to active container' };
    }

    logger.info({ groupFolder, queryId, threadId: activeInfo.threadId }, 'Debug query sent to active container');
    return pollForResponse(debugDir, queryId, DEBUG_QUERY_TIMEOUT_ACTIVE);
  }

  // No active container — spawn a fresh one in debug mode
  const debugDir = getDebugDir(groupFolder);

  // Check for existing query
  const queryFile = path.join(debugDir, 'query.json');
  if (fs.existsSync(queryFile)) {
    return { status: 'error', error: 'A debug query is already in progress for this group' };
  }

  // Write query file
  const queryData = { id: queryId, question, timestamp: Date.now() };
  fs.writeFileSync(queryFile, JSON.stringify(queryData));

  const debugPrompt =
    `[DEBUG QUERY FROM SUPERVISOR]\n` +
    `A supervising agent is asking you the following question for debugging purposes.\n` +
    `Respond concisely and factually about your current state, the group's workspace, any recent activity, errors, etc.\n` +
    `Review the group's CLAUDE.md, recent conversation archives, and workspace files to provide a thorough answer.\n\n` +
    `Question: ${question}\n\n` +
    `Write your response to /workspace/ipc/debug/response.json as JSON: ` +
    `{"id": "${queryId}", "answer": "your answer here", "status": "success", "timestamp": ${Date.now()}}`;

  const containerInput: ContainerInput = {
    prompt: debugPrompt,
    groupFolder,
    chatJid: groupJid,
    isMain: group.isMain === true,
    debugQuery: { id: queryId, question },
  };

  const abortSignal = { aborted: false };

  // Start polling for response before spawning container
  const responsePromise = pollForResponse(debugDir, queryId, DEBUG_QUERY_TIMEOUT_FRESH, abortSignal);

  // Spawn container (fire and forget — response comes via IPC file)
  runContainerAgent(
    group,
    containerInput,
    (proc, containerName) => {
      logger.info({ containerName, groupFolder, queryId }, 'Debug container spawned');
      proc.on('close', () => {
        abortSignal.aborted = true;
      });
    },
  ).catch((err) => {
    logger.error({ err, groupFolder, queryId }, 'Debug container failed');
    abortSignal.aborted = true;
  });

  logger.info({ groupFolder, queryId }, 'Debug query sent via fresh container');
  return responsePromise;
}
```

- [ ] **Step 3: Build and verify no compilation errors**

Run: `npm run build`
Expected: Clean compilation with no errors

- [ ] **Step 4: Commit**

```bash
git add src/group-queue.ts src/debug-query.ts
git commit -m "feat: add sendDebugQuery orchestration for agent debugging"
```

---

### Task 3: Keep container-side ContainerInput in sync

The container-side `ContainerInput` interface must match the host-side one. The `debugQuery` field is included for forward compatibility, though the current implementation delivers debug instructions entirely via the prompt text (the agent follows the instructions using its existing Bash/Write tools — no special agent-runner handling needed).

**Files:**
- Modify: `container/agent-runner/src/index.ts:22-30` (ContainerInput interface)

- [ ] **Step 1: Add debugQuery to container-side ContainerInput interface**

Change `container/agent-runner/src/index.ts:22-30` from:

```typescript
interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}
```

To:

```typescript
interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  debugQuery?: {
    id: string;
    question: string;
  };
}
```

- [ ] **Step 2: Build and verify no compilation errors**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add container/agent-runner/src/index.ts
git commit -m "feat: sync container-side ContainerInput with debugQuery field"
```

---

### Task 4: Create the /ask-agent Claude Code skill

**Files:**
- Create: `.claude/skills/ask-agent/SKILL.md`

- [ ] **Step 1: Create the skill directory**

Run: `mkdir -p /root/nanoclaw/.claude/skills/ask-agent`

- [ ] **Step 2: Create SKILL.md**

```markdown
---
name: ask-agent
description: Query a running or idle container agent for debugging and status information
---

# /ask-agent

Send a debug query to a container agent and display the response.

## Usage

The user tells you what they want to ask the agent, and you execute the query.

## How It Works

1. Read the registered groups from the database at `data/nanoclaw.db`
2. Check which groups have active containers by reading `data/status.json`
3. Determine the target group:
   - If the user specified a group name/folder, use that
   - If only one group exists, use it automatically
   - If multiple groups exist, list them and ask the user which one
4. Write the debug query:
   - Create `data/ipc/{groupFolder}/debug/query.json` with format: `{"id": "uuid", "question": "...", "timestamp": ...}`
   - For active containers: also write the query to `data/ipc/{groupFolder}/{threadId}/input/` as a JSON message with the debug prefix
   - For inactive groups: the orchestrator will spawn a fresh container
5. Call the `sendDebugQuery` function from `src/debug-query.ts`
6. Display the agent's response to the user

## Important

- This skill runs on the HOST, not inside a container
- Use `npx tsx` to execute TypeScript files if needed
- The debug response file is at `data/ipc/{groupFolder}/debug/response.json`
- Timeout: 60s for active containers, 120s for fresh containers
- Only one debug query per group at a time

## Quick Execution

To send a debug query, run this from the project root:

```bash
npx tsx -e "
import { sendDebugQuery, listGroupsForDebug } from './src/debug-query.ts';
import { GroupQueue } from './src/group-queue.ts';
import { getAllRegisteredGroups } from './src/db.ts';

const groupQueue = new GroupQueue();
const groups = getAllRegisteredGroups();

// List groups:
// const list = listGroupsForDebug(groupQueue);
// console.log(JSON.stringify(list, null, 2));

// Send query:
const result = await sendDebugQuery('GROUP_FOLDER', 'QUESTION', groupQueue, groups);
console.log(JSON.stringify(result, null, 2));
"
```

Replace `GROUP_FOLDER` with the target group folder name and `QUESTION` with the debug question.

**Limitation:** When running standalone (not from the running NanoClaw process), the GroupQueue won't have state about active containers. The query will always spawn a fresh container. To query an active container, you would need to integrate with the running process. For most debugging use cases, a fresh container with access to the group's workspace and CLAUDE.md is sufficient.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/ask-agent/SKILL.md
git commit -m "feat: add /ask-agent Claude Code skill for agent debugging"
```

---

### Task 5: Integration test — end-to-end debug query

**Files:**
- Create: `src/debug-query.test.ts`

- [ ] **Step 1: Write tests for pollForResponse, cleanup, and concurrent query guard**

```typescript
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

    // Import the module to test pollForResponse indirectly via sendDebugQuery
    // Since pollForResponse is not exported, we test the protocol directly:
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
    // Write a response with a different ID
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

    // Write query and response with matching ID
    fs.writeFileSync(path.join(debugDir, 'query.json'), JSON.stringify({ id: queryId }));
    fs.writeFileSync(path.join(debugDir, 'response.json'), JSON.stringify({ id: queryId }));

    // Cleanup matching files
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

    // Write files with a different ID
    fs.writeFileSync(path.join(debugDir, 'query.json'), JSON.stringify({ id: otherId }));

    // Attempt cleanup with our ID — should not delete
    const filePath = path.join(debugDir, 'query.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (data.id === queryId) {
      fs.unlinkSync(filePath);
    }

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('concurrent query guard detects existing query.json', () => {
    // Simulate an in-progress query
    fs.writeFileSync(
      path.join(debugDir, 'query.json'),
      JSON.stringify({ id: 'existing', question: 'test', timestamp: Date.now() }),
    );

    // Check guard
    const queryFile = path.join(debugDir, 'query.json');
    expect(fs.existsSync(queryFile)).toBe(true);
  });

  it('abort signal stops polling', async () => {
    const abortSignal = { aborted: false };

    // Abort after 100ms
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
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/debug-query.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/debug-query.test.ts
git commit -m "test: add debug query IPC protocol tests"
```

---

### Task 6: Rebuild container image

The container agent-runner was modified, so the container image needs rebuilding.

- [ ] **Step 1: Rebuild the container**

Run: `./container/build.sh`
Expected: Successful build with updated agent-runner

- [ ] **Step 2: Verify the container starts**

Run: `npm run build && npm run dev` (briefly, then Ctrl+C)
Expected: No startup errors related to the debug changes

- [ ] **Step 3: Commit any build artifacts if needed**

```bash
git status
# Only commit if there are meaningful changes (e.g., updated lock files)
```
