#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

docker compose up -d --build

echo "✅ Toàn bộ hệ thống đã khởi động:"
echo "   - Frontend Dashboard: http://localhost:5173"
echo "   - Backend API:        http://localhost:3000/api/health"
echo "   - Python VRP Solver:  http://localhost:8090"
echo "   - PostgreSQL DB:      localhost:5432"
