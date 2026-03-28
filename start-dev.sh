#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/mnt/f/xiaohongshu-mcp"
FRONTEND_DIR="$ROOT_DIR/ai-marketing"
FRONTEND_SESSION="ai_marketing_frontend"
BACKEND_SESSION="xhs_backend"
FRONTEND_LOG="/tmp/ai-marketing-frontend.log"
BACKEND_LOG="/tmp/xhs-backend.log"

detect_go_bin() {
  if [ -n "${GO_BIN:-}" ] && [ -x "${GO_BIN}" ]; then
    echo "${GO_BIN}"
    return 0
  fi

  if command -v go >/dev/null 2>&1; then
    command -v go
    return 0
  fi

  if [ -x "/usr/local/go/bin/go" ]; then
    echo "/usr/local/go/bin/go"
    return 0
  fi

  if [ -x "$HOME/.local/go/bin/go" ]; then
    echo "$HOME/.local/go/bin/go"
    return 0
  fi

  return 1
}

detect_node_bin() {
  if [ -n "${NODE_BIN:-}" ] && [ -x "${NODE_BIN}" ]; then
    echo "${NODE_BIN}"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  return 1
}

detect_browser_bin() {
  if [ -n "${ROD_BROWSER_BIN:-}" ] && [ -x "${ROD_BROWSER_BIN}" ]; then
    echo "${ROD_BROWSER_BIN}"
    return 0
  fi

  local candidates=(
    "$HOME/chrome-for-testing/chrome-linux64/chrome"
    "/home/lbx/chrome-for-testing/chrome-linux64/chrome"
    "$(command -v google-chrome 2>/dev/null || true)"
    "$(command -v google-chrome-stable 2>/dev/null || true)"
    "$(command -v chromium 2>/dev/null || true)"
    "$(command -v chromium-browser 2>/dev/null || true)"
  )

  for candidate in "${candidates[@]}"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

wait_for_port() {
  local port="$1"
  local name="$2"

  for _ in $(seq 1 30); do
    if ss -ltn "( sport = :$port )" | grep -q ":$port"; then
      return 0
    fi
    sleep 1
  done

  echo "$name 启动超时，请检查日志"
  return 1
}

if ! command -v tmux >/dev/null 2>&1; then
  echo "缺少 tmux，请先在 WSL 中安装 tmux"
  exit 1
fi

GO_BIN_VALUE="$(detect_go_bin || true)"
NODE_BIN_VALUE="$(detect_node_bin || true)"
ROD_BROWSER_BIN_VALUE="$(detect_browser_bin || true)"

if [ -z "$GO_BIN_VALUE" ]; then
  echo "找不到 go，请先在 WSL 安装 Go，或设置 GO_BIN"
  exit 1
fi

if [ -z "$NODE_BIN_VALUE" ]; then
  echo "找不到 node，请先在 WSL 安装 Node.js，或设置 NODE_BIN"
  exit 1
fi

if [ -z "$ROD_BROWSER_BIN_VALUE" ]; then
  echo "找不到可用的 Chrome/Chromium，请设置 ROD_BROWSER_BIN"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "前端依赖不存在，请先在 WSL 执行 pnpm install"
  exit 1
fi

tmux kill-session -t "$FRONTEND_SESSION" 2>/dev/null || true
tmux kill-session -t "$BACKEND_SESSION" 2>/dev/null || true

tmux new-session -d -s "$FRONTEND_SESSION" \
  "cd $FRONTEND_DIR && export PATH=\"$(dirname "$NODE_BIN_VALUE"):\$PATH\" && export NODE_ENV=development DISABLE_MANUS_RUNTIME=1 && pnpm exec tsx server/_core/index.ts > $FRONTEND_LOG 2>&1"

tmux new-session -d -s "$BACKEND_SESSION" \
  "cd $ROOT_DIR && export PATH=\"$(dirname "$GO_BIN_VALUE"):\$PATH\" && export ROD_BROWSER_BIN=\"$ROD_BROWSER_BIN_VALUE\" && \"$GO_BIN_VALUE\" run . > $BACKEND_LOG 2>&1"

wait_for_port 3000 "前端"
wait_for_port 18060 "后端"

echo "前端: http://localhost:3000"
echo "后端: http://localhost:18060"
echo "前端日志: tail -f $FRONTEND_LOG"
echo "后端日志: tail -f $BACKEND_LOG"
echo "GO_BIN: $GO_BIN_VALUE"
echo "NODE_BIN: $NODE_BIN_VALUE"
echo "ROD_BROWSER_BIN: $ROD_BROWSER_BIN_VALUE"
echo "tmux 会话:"
tmux list-sessions
