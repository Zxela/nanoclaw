---
name: linear
description: Manage Linear issues and projects — create, update, list, and search issues; view team and project status; sync project notes to Linear. Use when asked to manage tasks in Linear, create issues, check project progress, or offload project management to Linear.
---

# Linear Project Management

Linear is used as the source of truth for project management. Use this skill whenever the user wants to track, create, or manage work in Linear.

## Quick Start

1. Check for `LINEAR_API_KEY` env var (set in container environment).
2. Run `python3 "$LINEAR_API" <command> [options]`.

```bash
export LINEAR_API="$HOME/.claude/skills/linear/scripts/linear_api.py"
```

If `LINEAR_API_KEY` is missing, ask the user to:
1. Go to https://linear.app/settings/api → Personal API keys → Create key
2. Set `LINEAR_API_KEY` in their environment or `.env` file.

## Core Commands

### List teams
```bash
python3 "$LINEAR_API" teams
```

### List projects (optionally filter by team key)
```bash
python3 "$LINEAR_API" projects
python3 "$LINEAR_API" projects --team ENG
```

### List issues
```bash
# All my assigned issues
python3 "$LINEAR_API" issues --assignee me

# Issues in a specific project
python3 "$LINEAR_API" issues --project "Project Name"

# Issues by team and state
python3 "$LINEAR_API" issues --team ENG --state "In Progress"

# Recent issues (last N days)
python3 "$LINEAR_API" issues --days 7 --limit 20
```

### Get issue detail
```bash
python3 "$LINEAR_API" issue ENG-42
```

### Create an issue
```bash
python3 "$LINEAR_API" create \
  --team ENG \
  --title "Fix the login bug" \
  --description "Users can't log in after password reset" \
  --priority 2 \
  --state "Todo"
```

Priority levels: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low

### Update an issue
```bash
# Change state
python3 "$LINEAR_API" update ENG-42 --state "In Progress"

# Change priority
python3 "$LINEAR_API" update ENG-42 --priority 1

# Add comment
python3 "$LINEAR_API" comment ENG-42 --body "Started working on this"
```

### Search issues
```bash
python3 "$LINEAR_API" search "login bug"
```

### Project status summary
```bash
python3 "$LINEAR_API" project-status "My Project Name"
```

## Workflow: Offloading from Knowledge Base to Linear

When the user wants to migrate project notes to Linear:

1. Read the relevant knowledge base file (e.g., `knowledge/projects/foo.md`)
2. Extract backlog items / user stories / next steps
3. Use `create` to add each as a Linear issue in the right team
4. Update the knowledge base file to note that project management is now in Linear
5. Provide a summary of created issues with their IDs

Example:
```bash
python3 "$LINEAR_API" create --team ENG --title "Add CSV export" --description "As a user, I can export data to CSV from the dashboard" --priority 3 --state "Backlog"
```

## Output Formatting

- Always show issue ID, title, state, and priority in lists
- Use bullet points for issue lists (Discord-friendly, no tables)
- Show project progress as "X done / Y total (Z%)"
- When creating issues, confirm each one with its ID and URL
