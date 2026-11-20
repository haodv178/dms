#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "🛑 Đang dừng các Docker containers..."
docker compose down

echo "✅ Đã dừng toàn bộ service!"
