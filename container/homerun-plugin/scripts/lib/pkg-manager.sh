#!/usr/bin/env bash
# Shared: detect project package manager from lock files
# Usage: source "$(dirname "$0")/lib/pkg-manager.sh"

detect_pkg_manager() {
  if [ -f bun.lockb ] || [ -f bun.lock ]; then
    echo "bun"
  elif [ -f pnpm-lock.yaml ]; then
    echo "pnpm"
  elif [ -f yarn.lock ]; then
    echo "yarn"
  else
    echo "npm"
  fi
}
