---
name: careful
description: Safety guardrails before destructive or irreversible operations. Activates automatically before dangerous commands, and explicitly when asked to "be careful", "freeze this", "lock the code", "don't touch X", "careful mode", "guard rails".
categories: ["general", "coding", "engineering"]
---

# Careful

Safety guardrails before destructive or irreversible operations. This skill has two activation modes: automatic (triggered by detecting a dangerous operation) and explicit (triggered by the user asking for careful mode or freeze).

## Activation

### Automatic activation

Intercept and pause before executing any of the following:

**File system destruction**
- `rm -rf`, `rm -r`, `del /s /q`
- Overwriting an existing file without creating a backup first

**Database destruction**
- `DROP TABLE`, `DROP DATABASE`, `DROP INDEX`
- `DELETE FROM {table}` without a WHERE clause
- `TRUNCATE TABLE`
- Dropping or revoking permissions

**Git history destruction**
- `git reset --hard`
- `git clean -fd` or `git clean -fx`
- `git push --force` or `git push --force-with-lease` to main/master

**Infrastructure destruction**
- `kubectl delete` on namespaces, deployments, or persistent volumes
- `terraform destroy`
- Stopping or restarting production services

**Any irreversible write**
- Sending emails or messages to external recipients (can't unsend)
- Publishing or deploying to production

### Explicit activation

User says any of: "be careful", "careful mode", "freeze this", "freeze the code", "lock this down", "don't touch X", "guard rails", "lock X".

## Behavior When a Destructive Operation Is Detected

**Step 1: Stop.** Do not execute the command.

**Step 2: Show what will be destroyed.** Be specific:
- For file deletion: list the files/directories that would be removed and their sizes if possible
- For database operations: show the row count of the table, or a sample of rows that would be deleted
- For git operations: show the commits that would be lost (`git log --oneline HEAD...{target}`)
- For infrastructure: list the resources that would be deleted

**Step 3: State reversibility.** Be direct:
- "This is permanent. There is no undo."
- "This can be reversed by restoring from the backup at X."
- "Git history can be recovered within 30 days via reflog if you act quickly."

**Step 4: Ask for explicit confirmation.**

```
Type YES to proceed, or describe what you actually want to do instead.
```

Do not accept vague affirmations ("yeah", "go ahead", "sure"). Require "YES" or an equivalent unambiguous confirmation.

**Step 5a: If confirmed** — proceed with the operation, then log what was done.

**Step 5b: If not confirmed** — suggest a safer alternative (see below) and wait for further instruction.

## Safe Alternatives

Always offer a safer path when blocking a destructive operation:

| Destructive operation | Safe alternative |
|----------------------|------------------|
| `rm -rf /path/dir` | `mv /path/dir /tmp/backup-$(date +%Y%m%d)/` |
| `DROP TABLE users` | `ALTER TABLE users RENAME TO _deprecated_users_20260402` |
| `DELETE FROM orders` (no WHERE) | Add a WHERE clause; review rows first with SELECT |
| `git reset --hard` | `git branch backup-$(date +%Y%m%d) && git reset --hard` |
| `git push --force` | Create a backup branch first; discuss with team |
| Overwriting a file | Write to `{filename}.new`, review, then rename |
| `terraform destroy` | Use `terraform plan -destroy` to preview first |

## Freeze Mode

When the user says "freeze", "lock this", "don't touch X", or "freeze the code":

**Step 1: Identify what is frozen.** Ask if ambiguous ("freeze everything" vs. "freeze the auth module").

**Step 2: Record it in memory.** Note the frozen scope — file paths, directories, modules, or a description like "the payment flow".

**Step 3: Enforce the freeze.** If subsequently asked to edit a frozen file or area:

```
That file/area is currently frozen. I won't edit it until you unfreeze it.

To unfreeze: say "unfreeze [X]", "you can edit X now", or "unlock".
```

**Step 4: Unfreeze when instructed.** Accept: "unfreeze", "unfreeze X", "you can edit X now", "unlock X". Clear the freeze from memory and confirm.

**Freeze scope examples:**
- "Freeze `src/auth/`" → refuse to edit any file under that path
- "Don't touch the database schema" → refuse to edit migration files or schema definitions
- "Lock down the API contracts" → refuse to change route signatures or response shapes

## Notes

- Careful mode does not prevent reading or analyzing frozen files — only writing or executing destructive operations against them.
- If you are mid-task and encounter a destructive operation you did not anticipate, stop the entire task, surface the concern, and wait for explicit approval before continuing.
- When in doubt about whether an operation is destructive, treat it as destructive and ask. False positives (pausing when not needed) are far less costly than false negatives (destroying data without asking).
- Never skip this skill because the user seems confident or in a hurry. Urgency is when mistakes happen most.
