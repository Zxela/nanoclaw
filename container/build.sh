#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"

echo "=== Syncing marketplace plugins ==="
./sync-plugins.sh

echo ""
echo "=== Generating skills catalog ==="
npx tsx generate-catalog.ts

echo ""
echo "=== Pruning BuildKit builder cache ==="
# BuildKit retains stale file metadata in its builder volume — --no-cache alone
# does not invalidate COPY steps. Pruning before every build ensures the container
# always reflects the current state of the build context.
${CONTAINER_RUNTIME} builder prune -f

echo ""
echo "=== Building container image ==="
echo "Image: ${IMAGE_NAME}:${TAG}"

${CONTAINER_RUNTIME} build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | ${CONTAINER_RUNTIME} run -i ${IMAGE_NAME}:${TAG}"
