# V1 Query-Per-Turn Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MessageStream + mid-query IPC polling pattern with one-query-per-turn, eliminating ProcessTransport crashes.

**Architecture:** Each follow-up message gets its own `query()` call with session resume instead of being pushed into a live stream. The MessageStream class, IPC poll-during-query logic, and all related workarounds are removed.

**Tech Stack:** TypeScript, @anthropic-ai/claude-agent-sdk v0.2.81, @anthropic-ai/claude-code v2.1.81

**Spec:** `docs/superpowers/specs/2026-03-23-v1-query-per-turn-migration-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `container/agent-runner/package.json` | Modify | Bump SDK version |
| `container/Dockerfile` | Modify | Pin Claude Code CLI version |
| `container/agent-runner/src/index.ts` | Modify | Core rewrite: remove MessageStream, add singleMessageIterable, replace runQuery with runTurn, simplify main loop |

---

### Task 1: Update dependencies

**Files:**
- Modify: `container/agent-runner/package.json`
- Modify: `container/Dockerfile`

- [ ] **Step 1: Bump SDK version in package.json**

In `container/agent-runner/package.json`, change:
```
"@anthropic-ai/claude-agent-sdk": "^0.2.76"
```
to:
```
"@anthropic-ai/claude-agent-sdk": "^0.2.81"
```

- [ ] **Step 2: Pin Claude Code CLI version in Dockerfile**

In `container/Dockerfile`, line 49, change:
```dockerfile
RUN npm install -g agent-browser @anthropic-ai/claude-code
```
to:
```dockerfile
RUN npm install -g agent-browser @anthropic-ai/claude-code@2.1.81
```

- [ ] **Step 3: Update lockfile**

Run: `cd /root/nanoclaw/container/agent-runner && npm install`

- [ ] **Step 4: Commit**

```bash
git add container/agent-runner/package.json container/agent-runner/package-lock.json container/Dockerfile
git commit -m "chore: bump SDK to 0.2.81, pin Claude Code CLI to 2.1.81"
```

---

### Task 2: Replace MessageStream with singleMessageIterable

**Files:**
- Modify: `container/agent-runner/src/index.ts`

This task removes the `MessageStream` class and the custom `SDKUserMessage`/`ContentBlock` types, replacing them with a simple async generator. It also imports `SDKUserMessage` from the SDK.

- [ ] **Step 1: Update import to include SDKUserMessage**

At line 19, change:
```typescript
import { query, HookCallback, PreCompactHookInput } from '@anthropic-ai/claude-agent-sdk';
```
to:
```typescript
import { query, HookCallback, PreCompactHookInput, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
```

If `SDKUserMessage` is not exported from the SDK, keep the local interface definition and skip this step.

- [ ] **Step 2: Remove MessageStream class and custom SDKUserMessage**

Delete lines 61-142:
- `ContentBlock` type (lines 61-63)
- `SDKUserMessage` interface (lines 65-70) — only if imported from SDK in step 1
- `MessageStream` class (lines 94-142) including the comment above it

Keep `ContentBlock` as a local type if SDKUserMessage import doesn't work — it's needed by `singleMessageIterable`.

- [ ] **Step 3: Add singleMessageIterable helper**

In place of the removed code, add:

```typescript
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/**
 * Yields exactly one SDKUserMessage then returns.
 * Uses AsyncGenerator (not a plain string) so the SDK treats it as streaming
 * mode, which keeps isSingleUserTurn = false and allows agent teams.
 */
async function* singleMessageIterable(
  text: string,
  images?: ImageAttachment[],
): AsyncGenerator<SDKUserMessage> {
  let content: string | ContentBlock[];
  if (images && images.length > 0) {
    content = [
      { type: 'text', text },
      ...images.map((img) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
      })),
    ];
  } else {
    content = text;
  }
  yield {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    session_id: '',
  } as SDKUserMessage;
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: May have errors from remaining `MessageStream` references — those are fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add container/agent-runner/src/index.ts
git commit -m "refactor: replace MessageStream with singleMessageIterable"
```

---

### Task 3: Replace runQuery with runTurn and simplify main loop

This is the core task. It replaces the ~160 line `runQuery` function and restructures the main loop.

**Files:**
- Modify: `container/agent-runner/src/index.ts`

- [ ] **Step 1: Remove workaround constants**

Remove the `SDK_ERR_TRANSPORT_NOT_READY` constant (line 84). Keep `SDK_ERR_SESSION_NOT_FOUND` (still needed for stale session retry).

- [ ] **Step 2: Replace runQuery with runTurn**

Find the `runQuery` function (starts with `async function runQuery(` around line 600). Replace the ENTIRE function with:

```typescript
/**
 * Run a single turn: send one message, stream the response.
 * Each turn is a separate query() call. Follow-up messages start new turns.
 */
async function runTurn(
  prompt: string,
  sessionId: string | undefined,
  mcpServerPath: string,
  containerInput: ContainerInput,
  images: ImageAttachment[] | undefined,
  sdkEnv: Record<string, string | undefined>,
  resumeAt?: string,
): Promise<{ newSessionId?: string; lastAssistantUuid?: string }> {
  const messageIterable = singleMessageIterable(prompt, images);

  // Load global CLAUDE.md as additional system context (shared across all groups)
  const globalClaudeMdPath = '/workspace/global/CLAUDE.md';
  let globalClaudeMd: string | undefined;
  if (!containerInput.isMain && fs.existsSync(globalClaudeMdPath)) {
    globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
  }

  // Discover additional directories mounted at /workspace/extra/*
  const extraDirs: string[] = [];
  const extraBase = '/workspace/extra';
  if (fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        extraDirs.push(fullPath);
      }
    }
  }
  if (extraDirs.length > 0) {
    log(`Additional directories: ${extraDirs.join(', ')}`);
  }

  let newSessionId: string | undefined;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;

  for await (const message of query({
    prompt: messageIterable,
    options: {
      cwd: '/workspace/group',
      additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
      resume: sessionId,
      resumeSessionAt: resumeAt,
      systemPrompt: (() => {
        const isGoal = process.env.CONTAINER_PRIORITY === 'goal';
        const appendText = [globalClaudeMd, isGoal ? GOAL_SYSTEM_PROMPT : ''].filter(Boolean).join('\n\n') || undefined;
        return appendText
          ? { type: 'preset' as const, preset: 'claude_code' as const, append: appendText }
          : undefined;
      })(),
      allowedTools: [
        'Bash',
        'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebSearch', 'WebFetch',
        'Task', 'TaskOutput', 'TaskStop',
        'TeamCreate', 'TeamDelete', 'SendMessage',
        'TodoWrite', 'ToolSearch', 'Skill',
        'NotebookEdit',
        'mcp__nanoclaw__*'
      ],
      env: sdkEnv,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      mcpServers: {
        nanoclaw: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            NANOCLAW_CHAT_JID: containerInput.chatJid,
            NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
            NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
          },
        },
      },
      hooks: {
        PreCompact: [{ hooks: [createPreCompactHook(containerInput.assistantName)] }],
      },
    }
  })) {
    messageCount++;
    const msgType = message.type === 'system' ? `system/${(message as { subtype?: string }).subtype}` : message.type;
    log(`[msg #${messageCount}] type=${msgType}`);

    if (message.type === 'assistant') {
      const msg = message as any;
      const content = msg.content ?? msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            const inputStr = JSON.stringify(block.input).slice(0, 300);
            log(`[tool] ${block.name} ${inputStr}`);
          }
        }
      }
    }

    if (message.type === 'assistant' && 'uuid' in message) {
      lastAssistantUuid = (message as { uuid: string }).uuid;
    }

    if (message.type === 'system' && message.subtype === 'init') {
      newSessionId = message.session_id;
      log(`Session initialized: ${newSessionId}`);
    }

    if (message.type === 'system' && (message as { subtype?: string }).subtype === 'task_notification') {
      const tn = message as { task_id: string; status: string; summary: string };
      log(`Task notification: task=${tn.task_id} status=${tn.status} summary=${tn.summary}`);
    }

    if (message.type === 'result') {
      const textResult = 'result' in message ? (message as { result?: string }).result : null;
      log(`Result: subtype=${message.subtype}${textResult ? ` text=${textResult.slice(0, 200)}` : ''}`);
      writeOutput({
        status: 'success',
        result: textResult || null,
        newSessionId
      });
    }
  }

  log(`Turn done. Messages: ${messageCount}, lastAssistantUuid: ${lastAssistantUuid || 'none'}`);
  return { newSessionId, lastAssistantUuid };
}
```

- [ ] **Step 3: Simplify the main loop**

In `main()`, find the query loop (starts with `while (true)` around line 851). Replace everything from the `let resumeAt` declaration through the end of the `try { while (true) { ... } } catch` block with:

```typescript
  let resumeAt: string | undefined;
  let initialImages = containerInput.images;

  try {
    while (true) {
      log(`Starting turn (session: ${sessionId || 'new'}, resumeAt: ${resumeAt || 'latest'})...`);

      let turnResult: Awaited<ReturnType<typeof runTurn>>;
      try {
        turnResult = await runTurn(prompt, sessionId, mcpServerPath, containerInput, initialImages, sdkEnv, resumeAt);
      } catch (queryErr) {
        const msg = queryErr instanceof Error ? queryErr.message : String(queryErr);
        const isStaleSession = msg.includes(SDK_ERR_SESSION_NOT_FOUND);
        const isProcessCrash = msg.includes('exited with code') || msg.includes('EPIPE');
        if ((isStaleSession || isProcessCrash) && sessionId) {
          log(`Session error (${isStaleSession ? 'stale' : 'crash'}) — retrying with fresh session`);
          sessionId = undefined;
          resumeAt = undefined;
          initialImages = containerInput.images;
          turnResult = await runTurn(prompt, undefined, mcpServerPath, containerInput, initialImages, sdkEnv, undefined);
        } else {
          throw queryErr;
        }
      }

      initialImages = undefined; // Only send images on first turn

      if (turnResult.newSessionId) sessionId = turnResult.newSessionId;
      if (turnResult.lastAssistantUuid) resumeAt = turnResult.lastAssistantUuid;

      // Emit session update for host tracking
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      // Wait for next IPC message or _close sentinel
      log('Turn ended, waiting for next IPC message...');
      const nextMessage = await waitForIpcMessage();

      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new turn`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage
    });
    process.exit(1);
  }
```

- [ ] **Step 4: Remove ProcessTransport error handler**

In the `uncaughtException` handler in `main()`, remove the `ProcessTransport` block:

```typescript
// DELETE these lines:
    if (err.message?.includes(SDK_ERR_TRANSPORT_NOT_READY)) {
      log('Caught ProcessTransport error — SDK subprocess exited, continuing');
      return;
    }
```

Also update the comment above to just say "Prevent EPIPE from crashing the process".

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no remaining references to MessageStream, runQuery, lateMessages, etc.

- [ ] **Step 6: Verify no stale references**

```bash
grep -n "MessageStream\|runQuery\|lateMessages\|resultSeen\|closedDuringQuery\|pollIpcDuringQuery\|SDK_ERR_TRANSPORT_NOT_READY" container/agent-runner/src/index.ts
```
Expected: No matches

- [ ] **Step 7: Commit**

```bash
git add container/agent-runner/src/index.ts
git commit -m "feat: one-query-per-turn model — eliminates ProcessTransport crashes"
```

---

### Task 4: Build, test, deploy

**Files:**
- No code changes — operational

- [ ] **Step 1: Install updated dependencies**

```bash
cd /root/nanoclaw/container/agent-runner && npm install
```

- [ ] **Step 2: Build host**

Run: `npm run build`

- [ ] **Step 3: Build container**

Run: `./container/build.sh`

Note: This will be slower than usual because the Claude Code CLI version changed, busting the Docker cache for that layer.

- [ ] **Step 4: Verify container has updated versions**

```bash
docker run --rm --entrypoint="" nanoclaw-agent:latest claude --version
docker run --rm --entrypoint="" nanoclaw-agent:latest node -e "console.log(require('@anthropic-ai/claude-agent-sdk/package.json').version)"
```
Expected: `2.1.81` and `0.2.81`

- [ ] **Step 5: Push and restart**

```bash
git push origin main
systemctl restart nanoclaw
```

- [ ] **Step 6: Test basic message**

Send `@Jarvis hello` in Discord. Verify response arrives in a new thread.

- [ ] **Step 7: Test follow-up**

Reply in the thread. Verify the bot responds (follow-up starts a new turn with session resume).

- [ ] **Step 8: Test rapid follow-ups**

Send 3 messages rapidly in the thread. Verify all get responses (each queued as IPC, processed sequentially as turns).
