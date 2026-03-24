# V1 Query-Per-Turn Migration

**Date:** 2026-03-23
**Status:** Proposed

## Problem

The container agent-runner uses a `MessageStream` async generator to feed messages into the SDK's `query()` function. Follow-up messages from IPC are pushed into this stream mid-query. This causes `ProcessTransport is not ready for writing` crashes when messages arrive after the SDK subprocess exits but before the stream is ended. Multiple workarounds exist (`lateMessages` collection, `resultCount` tracking, uncaught exception swallowing) but the root cause is architectural: pushing messages into a live SDK transport is inherently racy.

## Context

- V2 SDK (`createSession`/`send`/`stream`) would be the clean solution but it's missing critical features: no `cwd`, `mcpServers`, `systemPrompt`, `allowDangerouslySkipPermissions`, or `additionalDirectories` support
- V1 `query()` accepts `string | AsyncIterable<SDKUserMessage>` as the prompt
- Current container SDK is v0.2.76, Claude Code CLI is v2.1.78
- Latest: SDK v0.2.81, Claude Code CLI v2.1.81

## Design

### One-query-per-turn model

Replace the `MessageStream` + mid-query IPC polling pattern with a simple loop where each turn is a separate `query()` call with session resume.

**Current flow:**
```
query(messageStream) → poll IPC → push follow-ups into stream → crash/race
```

**New flow:**
```
while (true) {
  query(singleMessage) → stream results
  waitForIpcMessage() → next turn
}
```

Each turn uses `singleMessageIterable()` — an async generator that yields exactly one `SDKUserMessage` then returns. Session continuity is maintained via `resume` + `resumeSessionAt` options on each `query()` call.

### Changes

#### 1. Update dependencies

- `container/agent-runner/package.json`: SDK `^0.2.76` → `^0.2.81`
- `container/Dockerfile` line 49: pin Claude Code CLI version `@anthropic-ai/claude-code@2.1.81`

#### 2. Replace MessageStream with singleMessageIterable

Remove the `MessageStream` class (~50 lines). Replace with a simple async generator:

```typescript
async function* singleMessageIterable(
  text: string,
  images?: ImageAttachment[],
): AsyncGenerator<SDKUserMessage> {
  // Build content with optional images
  yield { type: 'user', message: { role: 'user', content }, ... };
  // Generator returns after one message — SDK handles the rest
}
```

#### 3. Replace runQuery with runTurn

Remove `runQuery()` (~160 lines including all IPC polling, `lateMessages`, `resultCount`, `closedDuringQuery` logic). Replace with `runTurn()` (~60 lines):

- Calls `query()` with `singleMessageIterable(prompt, images)`
- Same options as current (cwd, mcpServers, systemPrompt, hooks, etc.)
- Iterates SDK messages, logs them, writes output on result
- Returns `{ newSessionId, lastAssistantUuid }`
- No IPC polling — messages accumulate on disk until the turn finishes

#### 4. Simplify main loop

The main loop becomes:

```typescript
while (true) {
  turnResult = await runTurn(prompt, sessionId, ...);
  // Update session tracking
  sessionId = turnResult.newSessionId ?? sessionId;
  resumeAt = turnResult.lastAssistantUuid ?? resumeAt;
  // Emit session update for host
  writeOutput({ status: 'success', result: null, newSessionId: sessionId });
  // Wait for next IPC message or _close
  const next = await waitForIpcMessage();
  if (!next) break; // _close received
  prompt = next;
}
```

Stale session retry stays: catch `SDK_ERR_SESSION_NOT_FOUND`, clear session, retry once.

#### 5. Remove workarounds

- `lateMessages` array and collection logic
- `resultCount`-based stream guard in poll callback
- `ProcessTransport` error swallowing in uncaught exception handler
- `SDK_ERR_TRANSPORT_NOT_READY` constant
- `stream.end()` calls scattered through the code

#### 6. _close during query

With the old model, `_close` was detected by the IPC poll callback during the query. With the new model, there's no polling during the query — `_close` waits on disk.

Behavior: the agent finishes its current turn, then the main loop calls `waitForIpcMessage()`, which checks for `_close` and exits. The agent completes its work before stopping — this is generally desirable.

### What stays unchanged

- `ContainerInput`, `ContainerOutput`, `ImageAttachment` interfaces
- All IPC constants and sentinel handling (`shouldClose`, `drainIpcInput`, `checkAndHandlePause`, `waitForIpcMessage`)
- `writeOutput`, `log`, `writeIpcStatus`, `readStdin`
- `createPreCompactHook` and all knowledge extraction/transcript functions
- `ipc-mcp-stdio.ts` (MCP tools — completely unchanged)
- EPIPE handler (still needed for edge cases)
- stdin JSON input and initial prompt building

### Files changed

| File | Change |
|------|--------|
| `container/agent-runner/src/index.ts` | Remove MessageStream, replace runQuery with runTurn, simplify main loop, remove workarounds |
| `container/agent-runner/package.json` | SDK version bump |
| `container/Dockerfile` | Pin Claude Code CLI version |

### Risk

- **Follow-ups don't inject mid-conversation**: Messages arrive between turns, not during. The agent finishes its current thought before seeing the follow-up. This is actually better UX — no interrupted responses.
- **~100ms overhead per turn**: Each turn resumes the session from disk. Negligible compared to LLM latency.
- **V2 not used**: We stay on V1 `query()`. When V2 reaches feature parity, migration will be trivial since the turn-based structure is identical.
- **SDK unstable**: v0.2.81 is a minor bump from v0.2.76. The V1 `query()` API is stable.
