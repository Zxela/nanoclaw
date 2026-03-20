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
