---
name: add-openscad
description: Add OpenSCAD 3D modeling to NanoClaw. Agents can create .scad models, render them as PNG previews, and send both the rendered image and source files back to chat.
---

# Add OpenSCAD 3D Modeling

This skill adds OpenSCAD support to NanoClaw containers. After setup, agents can:
- Write `.scad` 3D model files
- Render them to PNG previews using `scad-render`
- Send the rendered image and zipped source files back to the chat

## Prerequisites

- NanoClaw must be set up and running
- At least one channel configured (Discord recommended for file attachments)
- Docker installed and working

## Setup Steps

### 1. Rebuild the container image

The Dockerfile already includes OpenSCAD, xvfb, and the `scad-render` wrapper. Rebuild:

```bash
./container/build.sh
```

Verify OpenSCAD is installed:

```bash
docker run --rm --entrypoint bash nanoclaw-agent:latest -c "openscad --version"
```

### 2. Verify the skill is deployed

The OpenSCAD skill (`container/skills/openscad/SKILL.md`) is automatically synced to container sessions on next container launch. Verify it exists:

```bash
ls container/skills/openscad/SKILL.md
```

### 3. Restart NanoClaw

```bash
# Linux (systemd)
systemctl restart nanoclaw   # or: systemctl --user restart nanoclaw

# macOS (launchd)
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### 4. Test it

Send a message to the bot in Discord:

```
@NanoClaw create a 3D model of a coffee mug
```

The bot should:
1. Write a `.scad` file
2. Render it to PNG
3. Send both the PNG preview and a ZIP of the `.scad` files to the chat

## Troubleshooting

### "scad-render: command not found"
Container image needs rebuilding: `./container/build.sh`

### Rendering fails with display errors
The `scad-render` wrapper uses `xvfb-run` for headless rendering. If it fails, check that xvfb is installed in the container:
```bash
docker run --rm --entrypoint bash nanoclaw-agent:latest -c "which xvfb-run"
```

### Files not appearing in Discord
- Check that the Discord channel has `sendFile` support (it does by default after this update)
- Check `logs/nanoclaw.log` for "File send rejected" warnings — this means the file extension isn't in the allowlist
- Current allowlist: `.png`, `.zip`. Extend via `FILE_SEND_ALLOWLIST` env var in `.env`

### Agent doesn't use OpenSCAD
The agent needs the skill loaded. Verify it exists in the container:
```bash
docker run --rm --entrypoint bash nanoclaw-agent:latest -c "cat /home/node/.claude/skills/openscad/SKILL.md" 2>/dev/null
```
If missing, the skill sync happens at container launch. Try restarting NanoClaw and sending a new message.
