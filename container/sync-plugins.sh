#!/bin/bash
# Sync marketplace plugins into the container build context.
# Reads installed_plugins.json to find active versions.
# Safe to run when no plugins are installed (produces empty dirs).
#
# All non-excluded plugins are staged in full to container/agent-plugins/
# so the Dockerfile installs them as complete Claude Code plugins
# (agents/, hooks/, cookbooks/, skills/, commands/, etc.).
#
# Skills are also indexed in container/skills-catalog/plugins/ for catalog.json.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOG_DIR="$SCRIPT_DIR/skills-catalog/plugins"
AGENT_PLUGINS_DIR="$SCRIPT_DIR/agent-plugins"
PLUGINS_DIR="${CLAUDE_PLUGINS_DIR:-$HOME/.claude/plugins}"
INSTALLED_FILE="$PLUGINS_DIR/installed_plugins.json"

# Plugins that should never be synced into the container.
# Add plugin names here to block them from being included.
EXCLUDED_PLUGINS=("superpowers")

is_excluded() {
  local name="$1"
  for excluded in "${EXCLUDED_PLUGINS[@]}"; do
    if [ "$name" = "$excluded" ]; then
      return 0
    fi
  done
  return 1
}

# Clean previous sync
rm -rf "$CATALOG_DIR"
mkdir -p "$CATALOG_DIR"

# Always create agent-plugins dir so Dockerfile COPY never fails
rm -rf "$AGENT_PLUGINS_DIR"
mkdir -p "$AGENT_PLUGINS_DIR"

# If no plugins installed, exit cleanly
if [ ! -f "$INSTALLED_FILE" ]; then
  echo "No installed_plugins.json found at $INSTALLED_FILE — skipping plugin sync"
  exit 0
fi

# Parse installed_plugins.json to get active install paths
# Format: { "plugins": { "name@marketplace": [{ "installPath": "..." }] } }
INSTALL_PATHS=$(node -e "
  const data = require(process.argv[1]);
  const plugins = data.plugins || {};
  for (const [key, entries] of Object.entries(plugins)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const entry = entries[0];
    if (entry.installPath) {
      const name = key.split('@')[0];
      console.log(name + '\t' + entry.installPath);
    }
  }
" "$INSTALLED_FILE")

if [ -z "$INSTALL_PATHS" ]; then
  echo "No plugins found in installed_plugins.json"
  exit 0
fi

echo "$INSTALL_PATHS" | while IFS=$'\t' read -r PLUGIN_NAME INSTALL_PATH; do
  if is_excluded "$PLUGIN_NAME"; then
    echo "  Skipping excluded plugin: $PLUGIN_NAME"
    continue
  fi

  echo "  Syncing plugin: $PLUGIN_NAME from $INSTALL_PATH"

  # Stage the full plugin directory for installation inside the container.
  # This includes agents/, hooks/, cookbooks/, skills/, commands/, templates/,
  # diagrams/, evals/, references/, scripts/, and any other plugin files.
  cp -r "$INSTALL_PATH" "$AGENT_PLUGINS_DIR/$PLUGIN_NAME"
  echo "    Staged full plugin"

  # Also index skills into the catalog for catalog.json generation.
  SKILLS_DIR="$INSTALL_PATH/skills"
  if [ -d "$SKILLS_DIR" ]; then
    DEST="$CATALOG_DIR/$PLUGIN_NAME"
    mkdir -p "$DEST"
    for SKILL_DIR in "$SKILLS_DIR"/*/; do
      [ -d "$SKILL_DIR" ] || continue
      SKILL_NAME=$(basename "$SKILL_DIR")
      cp -r "$SKILL_DIR" "$DEST/$SKILL_NAME"
      echo "    Indexed skill: $SKILL_NAME"
    done
  fi
done

echo "Plugin sync complete."
