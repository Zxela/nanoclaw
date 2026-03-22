# NanoClaw

Personal Claude assistant. See [docs/SPEC.md](docs/SPEC.md) for full architecture.

## Quick Context

Single Node.js process with channel-based messaging (Discord). Messages route to Claude Agent SDK running in Docker containers. Each group has isolated filesystem and memory. IPC via unified `queue/` directory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: message loop, container dispatch |
| `src/channels/registry.ts` | Channel self-registration |
| `src/features/index.ts` | Optional feature self-registration (PR watcher) |
| `src/ipc.ts` | IPC watcher, queue dispatcher, handler registry |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/pr-watcher.ts` | GitHub PR comment polling (optional, self-registers) |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |

## Development

Run commands directly — don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
systemctl restart nanoclaw
systemctl status nanoclaw
journalctl -u nanoclaw -f  # Follow logs
```

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.
