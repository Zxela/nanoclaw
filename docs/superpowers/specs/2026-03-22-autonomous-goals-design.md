# Autonomous Goals: Priority-Aware Container Lifecycle

**Date:** 2026-03-22
**Status:** Approved

## Problem

NanoClaw agents can already coordinate via Agent Teams inside containers, but all containers are treated equally — a quick question and a 4-hour research project get identical scheduling, timeouts, and priority. There's no way to run long autonomous goals without them timing out, and no way to preempt background work for interactive messages.

## Design Insight

The autonomous workforce feature doesn't require new orchestration infrastructure. Agent Teams inside a shared container already handles agent coordination, shared workspace, and lateral communication. What's missing is **priority-aware container lifecycle management** — scheduling, preemption, and timeout policies that distinguish between interactive work, long-running goals, and scheduled tasks.

## Container Types

| Type | Priority | Timeout | Preemptable | How it starts |
|------|----------|---------|-------------|---------------|
| Interactive | P0 | 30min idle | No | User sends a message |
| Goal | P1 | Configurable (default: 4h, max: 24h) | Yes (deferred — after current turn) | Agent self-escalates, or user uses `/goal` command prefix |
| Scheduled | P2 | 10s after result | Yes | Cron/interval fires |

### Goal Detection

Two paths:
- **Explicit:** User prefixes message with `/goal` command (unambiguous, avoids false positives from natural language like "goal: lose 10 pounds")
- **Implicit:** Agent decides the task is long-running and calls `escalate_to_goal` MCP tool, which flips priority from P0 to P1 and extends timeout

### Goal Timeout

Goal containers get a configurable timeout (default 4 hours, max 24 hours) instead of unlimited runtime. This prevents runaway containers. The timeout is passed via env var `GOAL_TIMEOUT_MS` and enforced by the existing `runContainerAgent` timeout mechanism. Users can specify duration: `/goal 2h research competitors`.

## Preemption Mechanics

When a P0 interactive message arrives and `activeCount >= MAX_CONCURRENT_CONTAINERS`:

1. Find the lowest-priority active container (P2 first, then P1)
2. Among same-priority containers, pick the most recently started (least progress lost)
3. Mark the container as `pendingPause` in GroupQueue
4. The container continues its current SDK call — **preemption is deferred, not immediate**
5. When the current turn completes and the container enters `waitForIpcMessage`, it reads the `_pause` sentinel and enters sleep mode
6. GroupQueue detects the container has paused (via IPC status message), decrements `activeCount`, frees the slot
7. P0 container gets the slot
8. When a slot opens later, host writes `_resume` sentinel — container wakes up and re-enters the query loop

### Why Deferred Preemption

SDK calls (especially with Agent Teams) can run for minutes to hours. There is no mechanism to interrupt a running `query()` call mid-turn. The SDK subprocess runs autonomously until the turn completes. Attempting to force-kill mid-turn would lose all in-flight work with no clean recovery.

**Implication:** A P0 message may wait until the current P1/P2 turn finishes. For most interactive messages this is seconds to minutes. For a worst case where a goal is mid-way through a long autonomous turn, the wait could be longer. This is acceptable because:
- Interactive messages in other groups/threads still get served if slots are available
- The preemption is automatic — no manual intervention needed
- Alternative (killing the container) would lose significant work

### Pause/Resume Protocol

- `_pause` sentinel: written to IPC input dir. Container checks for it during `waitForIpcMessage` between turns. On detection, container writes `{type: "paused"}` to IPC output queue, then enters a sleep loop polling for `_resume` every 5 seconds.
- `_resume` sentinel: container detects it, removes both sentinels, writes `{type: "resumed"}` to IPC output queue, re-enters the query loop. Session is intact — the agent continues where it left off.
- Container process stays alive (avoids cold-start cost). Note: Agent Teams subagent state from the previous turn is **not** preserved across pause — only the session (conversation history) persists. The agent re-plans on resume.

### Container States

```
active → pendingPause → paused → active (resumed)
```

### Edge Cases

- All slots are P0: no preemption of equals, P0 messages queue normally
- Multiple paused containers: tracked in a `pausedQueue` array on GroupQueue, resumed FIFO (longest-paused first)
- Container crashes while paused: normal crash recovery, session preserved on disk
- Host restarts while containers are paused: paused state is lost (runtime only), Docker containers exit via `--rm`. User can restart the goal from the thread (session preserved).

## Goal Lifecycle

### Start
Container starts as P0 interactive or P1 goal (if `/goal` prefix). Agent can self-escalate mid-conversation via `escalate_to_goal` MCP tool.

### Running
Agent Teams handles all coordination internally:
- Agent decomposes goal into subtasks (when appropriate — simple goals skip decomposition)
- Spawns subagents via SDK's native TeamCreate
- Works autonomously, writing artifacts to group workspace
- Sends progress updates via existing `send_message` MCP tool

### Progress Updates
Not a new system — prompting only. Goal containers include system prompt instruction:
> "If the user requested progress updates, use send_message to report at the requested interval. Otherwise, work silently."

### Completion
Agent finishes, sends final results via `send_message`, container goes idle, cleaned up normally.

### Cancellation
User sends "cancel"/"stop" in thread → host writes `_close` sentinel → container exits. Session preserved — user can continue the conversation in the same thread to resume or adjust.

### Failure
Container crash or SDK error → existing retry logic → user gets error in thread → can continue conversation to retry.

### No New Database Tables
Goal status is ephemeral runtime state in GroupQueue. Persistence uses existing thread_contexts and sessions tables.

## Autonomy Modes (Default: Fire-and-Forget)

- **Default (A):** Agent works to completion autonomously. User receives results when done.
- **Checkpoints (opt-in):** User requests checkpoints → agent sends intermediate results via `send_message` and waits for response before continuing.
- **Progress updates (opt-in):** User specifies interval ("update me every hour") → agent calls `send_message` periodically.

## Self-Healing

When an Agent Teams subagent fails inside a goal container:
- Coordinator agent detects failure (SDK handles this natively)
- Retries, reassigns, or adapts the plan
- Only surfaces total goal failure to the user
- No host-side intervention needed — Agent Teams handles this within the container

## Code Changes

### `src/group-queue.ts`

**ThreadState additions:**
```typescript
interface ThreadState {
  // ... existing fields ...
  priority: 'interactive' | 'goal' | 'scheduled';
  paused: boolean;
  pendingPause: boolean;
  pausedAt: number | null;  // timestamp for FIFO resume ordering
}
```

**GroupQueue additions:**
```typescript
class GroupQueue {
  // ... existing fields ...
  private pausedQueue: Array<{ groupJid: string; threadId: string }> = [];

  // New methods:
  pauseContainer(groupJid: string, threadId: string): void;
  resumeNextPaused(): void;
  handlePausedNotification(groupJid: string, threadId: string): void;
  findPreemptionTarget(): { groupJid: string; threadId: string } | null;
}
```

**Modified `enqueueThreadMessageCheck` signature:**
```typescript
enqueueThreadMessageCheck(groupJid: string, threadId: string, priority?: 'interactive' | 'goal' | 'scheduled'): void
```

When at capacity and priority is P0, calls `findPreemptionTarget()` to locate a P2/P1 container and writes `_pause` sentinel. Default priority is `'interactive'`.

**Modified `drainGroup`:** After freeing a slot, checks `pausedQueue` before `waitingGroups`. Paused goal containers get priority over new work from waiting groups.

### `container/agent-runner/src/index.ts`
- In `waitForIpcMessage` (the polling loop between turns): check for `_pause` sentinel file
- On `_pause`: write `{type: "paused"}` to IPC output queue, enter sleep loop polling every 5s for `_resume` sentinel
- On `_resume`: delete sentinels, write `{type: "resumed"}` to IPC output queue, return to normal query loop
- No other changes to Agent Teams, session resume, or query loop

### `container/agent-runner/src/ipc-mcp-stdio.ts`
- Add `escalate_to_goal` MCP tool — writes `{type: "escalate_to_goal"}` to IPC output queue
- Returns confirmation text to agent (fire-and-forget, host processes asynchronously)

### `src/ipc.ts`
- Register handler for `escalate_to_goal` message type — calls `queue.escalateToGoal(groupJid, threadId)` which updates priority and timeout
- Register handler for `paused` message type — calls `queue.handlePausedNotification(groupJid, threadId)` which decrements activeCount and frees the slot

### `src/index.ts`
- Detect `/goal` prefix in message processing, strip it, pass `priority: 'goal'` to container runner
- Parse optional duration from `/goal 2h ...` syntax

### `src/container-runner.ts`
- Accept optional `priority` parameter in `ContainerInput`
- Pass `CONTAINER_PRIORITY` and `GOAL_TIMEOUT_MS` as env vars
- When `priority === 'goal'`: use goal timeout instead of default `CONTAINER_TIMEOUT`
- Append goal system prompt to the agent's instructions

### `src/task-scheduler.ts`
- Pass `priority: 'scheduled'` when calling `queue.enqueueTask()`
- `enqueueTask` already uses a separate code path from message checks — integrate it into the priority system by having `enqueueTask` call `enqueueThreadMessageCheck` with P2 priority internally, unifying the scheduling logic

## System Prompt Addition (Goal Containers Only)

```
You are working on an autonomous goal. Work independently to completion.

- Break the goal into subtasks and use agent teams to parallelize when beneficial
- For simple goals, just do the work directly without decomposition overhead
- If you encounter a blocker you cannot resolve, report it via send_message and continue with other subtasks
- If the user requested progress updates, use send_message at the requested interval
- When complete, send final results via send_message
- Do not ask clarifying questions unless truly stuck — make reasonable decisions and proceed
```

## Observability

Add structured log fields for new states:
- `containerPriority` on all container lifecycle log events
- Dedicated log events for: `goal.started`, `goal.escalated`, `container.paused`, `container.resumed`, `container.preempted`
- Include `preemptionWaitMs` (time between marking pendingPause and actual pause) for monitoring worst-case preemption latency
