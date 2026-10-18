#!/usr/bin/env bash
# 一键启动：MySQL/Redis/RabbitMQ（docker compose）+ 后端 API + Worker + 前端
# 用法示例：
#   ./start.sh                    # 全部启动
#   START_FRONTEND=0 ./start.sh   # 只跑 API + Worker
#   START_WORKER=0 ./start.sh     # 不启动 Worker
#   STOP_DOCKER=1 ./start.sh      # 退出时停掉 compose 拉起的依赖
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

START_FRONTEND="${START_FRONTEND:-1}"
START_WORKER="${START_WORKER:-1}"
STOP_DOCKER="${STOP_DOCKER:-0}"

echo "==> starting dependencies (mysql / redis / rabbitmq)"
docker compose up -d mysql redis rabbitmq

cleanup() {
  echo "==> shutting down"
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WORKER_PID:-}" ]] && kill "$WORKER_PID" 2>/dev/null || true
  [[ -n "${FRONT_PID:-}" ]] && kill "$FRONT_PID" 2>/dev/null || true
  if [[ "$STOP_DOCKER" == "1" ]]; then
    docker compose stop mysql redis rabbitmq
  fi
}
trap cleanup EXIT INT TERM

echo "==> building backend"
(cd backend && npm run build)

echo "==> starting backend API (:8080)"
(cd backend && node dist/main.js) &
API_PID=$!

if [[ "$START_WORKER" == "1" ]]; then
  echo "==> starting worker"
  (cd backend && node dist/worker-main.js) &
  WORKER_PID=$!
fi

if [[ "$START_FRONTEND" == "1" ]]; then
  echo "==> starting frontend (:5173)"
  (cd frontend && npm run dev) &
  FRONT_PID=$!
fi

echo "==> all set: frontend http://localhost:5173  api http://localhost:8080/healthz"
wait
