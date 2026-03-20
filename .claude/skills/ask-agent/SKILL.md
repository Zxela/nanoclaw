---
name: ask-agent
description: Query a running or idle container agent for debugging and status information
---

# /ask-agent

Send a debug query to a container agent and display the response.

## Usage

The user tells you what they want to ask the agent, and you execute the query.

## How It Works

Debug queries are routed through the live NanoClaw process via IPC. This ensures proper container management — no rogue containers, no competing with scheduled tasks.

1. Determine the target group:
   - If the user specified a group name/folder, use that
   - If only one group exists, use it automatically
   - If multiple groups exist, list them and ask the user which one
2. Write a `debug_query` IPC task file to `data/ipc/{groupFolder}/tasks/`
3. The live NanoClaw process picks it up, routes through GroupQueue, and spawns or pipes to a container
4. Poll `data/ipc/{groupFolder}/debug/response.json` for the agent's answer
5. Display the response to the user

## Execution

Run from the project root:

```bash
npx tsx scripts/debug-query.mts GROUP_FOLDER "Your question here"
```

Replace `GROUP_FOLDER` with the target group folder name. If omitted, defaults to the first registered group.

Example:
```bash
npx tsx scripts/debug-query.mts discord_general "What errors have you seen recently?"
```

## Important

- This skill runs on the HOST, not inside a container
- Requires the NanoClaw process to be running (it routes through the live IPC watcher)
- Timeout: 5 minutes (accounts for container boot + rate limiting)
- Only one debug query per group at a time
- The response file is at `data/ipc/{groupFolder}/debug/response.json`

## To list registered groups

```bash
npx tsx -e "
import { initDatabase, getAllRegisteredGroups } from './src/db.ts';
initDatabase();
console.log(JSON.stringify(getAllRegisteredGroups(), null, 2));
"
```
