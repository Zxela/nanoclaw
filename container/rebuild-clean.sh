#!/bin/bash
# Force a completely clean container rebuild, bypassing all build cache.
#
# Use this when:
#   - A dependency update isn't being picked up
#   - Stale files appear in the container after editing container/
#   - `./build.sh` seems to use old versions of files
#
# Why this is necessary:
#   `docker build --no-cache` does NOT invalidate COPY steps — the BuildKit
#   builder's internal volume retains stale file metadata. The only reliable
#   way to force a clean slate is to prune the builder first.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"

echo "=== Pruning BuildKit builder cache ==="
${CONTAINER_RUNTIME} builder prune -f

echo ""
echo "=== Rebuilding from clean state ==="
exec "$SCRIPT_DIR/build.sh" "$@"
