# Ask-Agent Debug Skill Design

## Overview

A Claude Code skill (`/ask-agent`) that lets the user ask Claude Code to query a running (or freshly spawned) container agent for live debugging and status information. Claude Code initiates all communication — the container agent never escalates back.

## Goals

- Let Claude Code send a question to a container agent and get a response
- Support querying active (running) containers for live state
- Fall back to spawning a fresh container if no agent is active
- Keep debug traffic completely separate from user-facing chat messages

## Non-Goals

- Bidirectional escalation (agent calling back to Claude Code)
- Multi-turn conversational debug sessions (single query/response per invocation)
- Streaming responses from the agent

---

## IPC Debug Protocol

A new `debug/` subdirectory under each group's IPC namespace. For thread-aware containers, the debug directory is placed inside the thread's IPC path so the container can always find it at `/workspace/ipc/debug/`.

```
# Non-threaded:
data/ipc/{groupFolder}/debug/
  query.json    — written by Claude Code (host)
  response.json — written by container agent

# Threaded:
data/ipc/{groupFolder}/{threadId}/debug/
  query.json
  response.json
```

### Query format

```json
{
  "id": "uuid",
  "question": "What's your current state? Any errors?",
  "timestamp": 1710806400000
}
```

### Response format

```json
{
  "id": "uuid",
  "answer": "I'm currently processing a scheduled task...",
  "status": "success",
  "timestamp": 1710806401000
}
```

The `status` field is `"success"` or `"error"` (e.g., agent has no relevant state to report).

Claude Code writes `query.json`, polls for `response.json` (matching ID), reads it, and cleans up both files. Cleanup only removes files whose `id` matches the current query to avoid race conditions.

---

## Container-Side Changes

### Debug query delivery via existing IPC input mechanism

Rather than adding a separate polling loop, debug queries are delivered through the existing `input/` IPC directory (which the agent-runner already polls via `drainIpcInput()`). The debug query is written as a specially-typed input message.

When the agent-runner reads an input message prefixed with `[NANOCLAW_DEBUG_QUERY:uuid]`, it injects the following into the active Claude SDK session:

```
[DEBUG QUERY FROM SUPERVISOR]
A supervising agent is asking you the following question for debugging purposes.
Respond concisely and factually about your current state, what you're working on, any errors, etc.

Question: {question}

Write your response to /workspace/ipc/debug/response.json as JSON: {"id": "uuid", "answer": "...", "status": "success", "timestamp": <ms>}
```

The agent uses its existing Bash/Write tools to write the response file — no new MCP tools needed.

### Fresh container mode

When no container is active, a fresh container is spawned with the debug question as the initial prompt. A `debugQuery` field is added to the `ContainerInput` interface:

```typescript
interface ContainerInput {
  // ... existing fields
  debugQuery?: {
    id: string;
    question: string;
  };
}
```

When `debugQuery` is set, the agent-runner uses the debug question as the prompt and instructs the agent to write its response to `/workspace/ipc/debug/response.json`.

---

## Host-Side Changes

### Claude Code skill (`/ask-agent`)

A host-side Claude Code skill at `.claude/skills/ask-agent/SKILL.md`. This is NOT a container skill — it runs on the host via Claude Code.

1. Reads the question from the user or skill argument
2. Lists registered groups from the DB (`data/nanoclaw.db`)
3. Smart default: if one group exists, use it; if one has an active container, prefer it; otherwise list options for the user
4. Calls `sendDebugQuery(groupFolder, question)`
5. Polls for `response.json` (timeout: `DEBUG_QUERY_TIMEOUT_ACTIVE` for active container, `DEBUG_QUERY_TIMEOUT_FRESH` for fresh)
6. Displays the agent's answer
7. Cleans up both files

### Orchestration (`src/container-runner.ts`, `src/group-queue.ts`)

New exported function `sendDebugQuery(groupFolder, question)`:

1. Resolve the active container for the group. Use `GroupQueue`'s existing `isActive(groupJid)` method. Since the skill works with `groupFolder` (filesystem identity), add a helper that maps `groupFolder` → `groupJid` via the `registered_groups` DB table.
2. If active container exists:
   - Determine the correct IPC path (flat or thread-specific based on active thread)
   - Ensure `debug/` subdirectory exists with uid 1000 ownership
   - Write `query.json` to the debug directory
   - Write the debug input message to the `input/` directory (prefixed with `[NANOCLAW_DEBUG_QUERY:uuid]`)
   - Poll for `response.json`
3. If no active container:
   - Ensure `debug/` subdirectory exists in the flat IPC path
   - Write `query.json`
   - Spawn a fresh container with `debugQuery` set in `ContainerInput`
   - Poll for `response.json`

### IPC and directory setup

- Add `"debug"` to `KNOWN_IPC_SUBDIRS` in `src/ipc.ts` so the IPC watcher does not misidentify it as a thread directory
- Add `"debug"` to the subdirectory creation list in `buildVolumeMounts()` in `src/container-runner.ts` (alongside `messages`, `tasks`, `input`, `files`, `prs`)

### Configuration constants (`src/config.ts`)

```typescript
export const DEBUG_QUERY_TIMEOUT_ACTIVE = 60_000;  // 60s for active containers
export const DEBUG_QUERY_TIMEOUT_FRESH = 120_000;   // 120s for fresh containers
```

---

## Edge Cases & Error Handling

### Concurrent debug queries

Only one debug query per group at a time. If `query.json` already exists with a different ID, the skill reports "A debug query is already in progress for this group."

### Container crash during debug

If the container exits before writing `response.json`, the skill detects the process exit and reports the failure rather than waiting for timeout.

### Active container is busy

The agent may be mid-task when the debug query arrives. The input is delivered via the existing `drainIpcInput()` mechanism which runs between tool calls when the SDK yields control. The skill communicates "Waiting for agent to pick up the query..." if it takes more than a few seconds.

### Cleanup

Both `query.json` and `response.json` are deleted after the response is read, or on timeout. Only files whose `id` matches the current query are cleaned up to prevent race conditions between concurrent invocations targeting different groups.

### Permissions

Debug queries only work from the host (Claude Code). Containers cannot initiate debug queries to other containers.

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `container/agent-runner/src/index.ts` | Handle `[NANOCLAW_DEBUG_QUERY:uuid]` prefix in input messages; handle `debugQuery` field in `ContainerInput` |
| `src/container-runner.ts` | Add `sendDebugQuery()` function; add `debug` to IPC subdirectory creation in `buildVolumeMounts()`; add `debugQuery` to `ContainerInput` interface |
| `src/group-queue.ts` | Add `groupFolder → groupJid` lookup helper; expose active thread info for a group |
| `src/ipc.ts` | Add `"debug"` to `KNOWN_IPC_SUBDIRS` |
| `src/config.ts` | Add `DEBUG_QUERY_TIMEOUT_ACTIVE` and `DEBUG_QUERY_TIMEOUT_FRESH` constants |
| `.claude/skills/ask-agent/SKILL.md` (new) | Host-side Claude Code skill definition for `/ask-agent` |
