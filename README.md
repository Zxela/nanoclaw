# NanoClaw

Personal AI assistant. Forked from [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw).

Agents run in isolated Docker containers. Single Node.js process with channel-based messaging (Discord).

## Quick Reference

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
systemctl restart nanoclaw  # Restart service
```

See [CLAUDE.md](CLAUDE.md) for architecture and development details.
