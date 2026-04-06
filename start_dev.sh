#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/mnt/f/xiaohongshu-mcp"
AI_MARKETING_DIR="$ROOT_DIR/ai-marketing"
RUN_DIR="${RUN_DIR:-/tmp/xiaohongshu-mcp}"

PROCESS_LOG="$RUN_DIR/start-dev.log"
AI_MARKETING_LOG="$RUN_DIR/ai-marketing-dev.log"
BACKEND_LOG="$RUN_DIR/xhs-backend.log"

AI_MARKETING_PID_FILE="$RUN_DIR/ai-marketing-dev.pid"
BACKEND_PID_FILE="$RUN_DIR/xhs-backend.pid"

AI_MARKETING_PORT="${AI_MARKETING_PORT:-3001}"
BACKEND_PORT="${BACKEND_PORT:-18060}"
SKIP_BUILD="${SKIP_BUILD:-0}"

PNPM_BIN_DEFAULT="/home/lbx/.local/share/pnpm/.tools/pnpm/10.4.1/bin/pnpm"
ROD_BROWSER_DEFAULT="/home/lbx/chrome-for-testing/chrome-linux64/chrome"

mkdir -p "$RUN_DIR"
: >"$PROCESS_LOG"

log() {
  local message="$1"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" | tee -a "$PROCESS_LOG"
}

run_step() {
  local label="$1"
  shift

  log "开始: $label"
  if "$@" >>"$PROCESS_LOG" 2>&1; then
    log "完成: $label"
    return 0
  fi

  log "失败: $label"
  return 1
}

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
  local candidates=()

  if [ -n "${NODE_BIN:-}" ] && [ -x "${NODE_BIN}" ]; then
    candidates+=("${NODE_BIN}")
  fi

  if [ -d "$HOME/.nvm/versions/node" ]; then
    while IFS= read -r candidate; do
      candidates+=("$candidate")
    done < <(find "$HOME/.nvm/versions/node" -maxdepth 3 -type f -path "*/bin/node" 2>/dev/null | sort -V -r)
  fi

  if command -v node >/dev/null 2>&1; then
    candidates+=("$(command -v node)")
  fi

  for candidate in "${candidates[@]}"; do
    if [ -x "$candidate" ] && "$candidate" -e "const { isBuiltin } = require('node:module'); process.exit(isBuiltin('node:sqlite') ? 0 : 1)" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done

  for candidate in "${candidates[@]}"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

detect_pnpm_bin() {
  if [ -n "${PNPM_BIN:-}" ] && [ -x "${PNPM_BIN}" ]; then
    echo "${PNPM_BIN}"
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    command -v pnpm
    return 0
  fi

  if [ -x "$PNPM_BIN_DEFAULT" ]; then
    echo "$PNPM_BIN_DEFAULT"
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
    "$ROD_BROWSER_DEFAULT"
    "$HOME/chrome-for-testing/chrome-linux64/chrome"
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

kill_pid_file() {
  local pid_file="$1"

  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$pid_file"
}

kill_pattern() {
  local pattern="$1"
  pkill -f "$pattern" 2>/dev/null || true
}

kill_port_listener() {
  local port="$1"
  local pids

  pids="$(
    ss -ltnp 2>/dev/null \
      | grep -E ":$port " \
      | grep -o 'pid=[0-9]\+' \
      | cut -d= -f2 \
      | sort -u \
      || true
  )"

  if [ -z "$pids" ]; then
    return 0
  fi

  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
  done
}

kill_tmux_session() {
  local session_name="$1"

  if command -v tmux >/dev/null 2>&1; then
    tmux kill-session -t "$session_name" 2>/dev/null || true
  fi
}

start_tmux_session() {
  local session_name="$1"
  local command_text="$2"

  tmux new-session -d -s "$session_name" bash
  tmux send-keys -t "$session_name" "$command_text" C-m
}

wait_for_port() {
  local port="$1"
  local name="$2"

  for _ in $(seq 1 60); do
    if ss -ltn | grep -q ":$port "; then
      return 0
    fi
    sleep 1
  done

  log "$name 启动超时，请检查日志"
  return 1
}

get_wsl_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

windows_is_admin() {
  if ! command -v powershell.exe >/dev/null 2>&1; then
    echo "false"
    return 0
  fi

  powershell.exe -NoProfile -Command "[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent().IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)" 2>/dev/null \
    | tr -d '\r' \
    | tail -n 1 \
    | tr '[:upper:]' '[:lower:]'
}

windows_localhost_reachable() {
  local port="$1"

  if ! command -v powershell.exe >/dev/null 2>&1; then
    return 1
  fi

  local result
  result="$(
    powershell.exe -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:$port/ -TimeoutSec 5).StatusCode } catch { 'FAIL' }" 2>/dev/null \
      | tr -d '\r' \
      | tail -n 1
  )"

  [ "$result" = "200" ]
}

ensure_windows_portproxy() {
  local port="$1"
  local wsl_ip="$2"

  if ! command -v powershell.exe >/dev/null 2>&1; then
    return 1
  fi

  local is_admin
  is_admin="$(windows_is_admin)"
  if [ "$is_admin" != "true" ]; then
    log "Windows 当前不是管理员权限，无法自动写入 localhost:$port 的 portproxy"
    return 1
  fi

  powershell.exe -NoProfile -Command "netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$port | Out-Null; netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=$port connectaddress=$wsl_ip connectport=$port" >>"$PROCESS_LOG" 2>&1
}

verify_windows_localhost() {
  local port="$1"
  local wsl_ip="$2"

  if windows_localhost_reachable "$port"; then
    log "Windows localhost:$port 可访问"
    return 0
  fi

  log "Windows localhost:$port 当前不可访问"

  if ensure_windows_portproxy "$port" "$wsl_ip"; then
    sleep 2
    if windows_localhost_reachable "$port"; then
      log "已补齐 Windows portproxy，localhost:$port 可访问"
      return 0
    fi
  fi

  if [ -n "$wsl_ip" ]; then
    log "管理员 PowerShell 可执行以下命令补齐端口映射:"
    log "netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$port"
    log "netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=$port connectaddress=$wsl_ip connectport=$port"
    log "netsh interface portproxy show all"
  fi

  log "请直接在 WSL 内访问 http://127.0.0.1:$port ，或以管理员权限补充 Windows portproxy"
  return 1
}

ensure_paths() {
  if [ ! -d "$AI_MARKETING_DIR" ]; then
    log "未找到 ai-marketing 目录: $AI_MARKETING_DIR"
    exit 1
  fi

  if [ ! -d "$AI_MARKETING_DIR/node_modules" ]; then
    log "ai-marketing/node_modules 不存在，请先在 WSL 执行 pnpm install"
    exit 1
  fi

  if [ ! -f "$AI_MARKETING_DIR/server/_core/index.ts" ]; then
    log "未找到 ai-marketing 启动入口: server/_core/index.ts"
    exit 1
  fi
}

compile_ai_marketing() {
  run_step "编译 ai-marketing" bash -lc "
    cd '$AI_MARKETING_DIR'
    export PATH='$(dirname "$NODE_BIN_VALUE")':'$(dirname "$PNPM_BIN_VALUE")':\"\$PATH\"
    '$PNPM_BIN_VALUE' build
  "
}

compile_backend() {
  run_step "编译 Go 后端" bash -lc "
    cd '$ROOT_DIR'
    export PATH='$(dirname "$GO_BIN_VALUE")':\"\$PATH\"
    '$GO_BIN_VALUE' build ./...
  "
}

stop_existing_services() {
  log "清理旧的开发进程"

  kill_tmux_session "ai_marketing_frontend"
  kill_tmux_session "xhs_backend"

  kill_pid_file "$AI_MARKETING_PID_FILE"
  kill_pid_file "$BACKEND_PID_FILE"

  kill_pattern "tsx watch server/_core/index.ts"
  kill_pattern "server/_core/index.ts"
  kill_pattern "$AI_MARKETING_DIR/server/_core/index.ts"
  kill_pattern "go run $ROOT_DIR"
  kill_pattern "go run ."
  kill_port_listener "$AI_MARKETING_PORT"
  kill_port_listener "$BACKEND_PORT"

  sleep 2
}

start_ai_marketing() {
  log "启动 ai-marketing 服务，端口: $AI_MARKETING_PORT"

  if command -v tmux >/dev/null 2>&1; then
    start_tmux_session \
      "ai_marketing_frontend" \
      "cd '$AI_MARKETING_DIR' && export PATH='$(dirname "$NODE_BIN_VALUE")':'$(dirname "$PNPM_BIN_VALUE")':\"\$PATH\" && export NODE_ENV=development && export DISABLE_MANUS_RUNTIME=1 && export PORT='$AI_MARKETING_PORT' && '$AI_MARKETING_DIR/node_modules/.bin/tsx' watch server/_core/index.ts > '$AI_MARKETING_LOG' 2>&1"
    echo "tmux:ai_marketing_frontend" >"$AI_MARKETING_PID_FILE"
    return 0
  fi

  nohup bash -lc "
    cd '$AI_MARKETING_DIR'
    export PATH='$(dirname "$NODE_BIN_VALUE")':'$(dirname "$PNPM_BIN_VALUE")':\"\$PATH\"
    export NODE_ENV=development
    export DISABLE_MANUS_RUNTIME=1
    export PORT='$AI_MARKETING_PORT'
    exec setsid '$AI_MARKETING_DIR/node_modules/.bin/tsx' watch server/_core/index.ts </dev/null
  " >"$AI_MARKETING_LOG" 2>&1 &

  echo $! >"$AI_MARKETING_PID_FILE"
}

start_backend() {
  log "启动 Go 后端，端口: $BACKEND_PORT"

  if command -v tmux >/dev/null 2>&1; then
    start_tmux_session \
      "xhs_backend" \
      "cd '$ROOT_DIR' && export PATH='$(dirname "$GO_BIN_VALUE")':\"\$PATH\" && export ROD_BROWSER_BIN='$ROD_BROWSER_BIN_VALUE' && '$GO_BIN_VALUE' run . > '$BACKEND_LOG' 2>&1"
    echo "tmux:xhs_backend" >"$BACKEND_PID_FILE"
    return 0
  fi

  nohup bash -lc "
    cd '$ROOT_DIR'
    export PATH='$(dirname "$GO_BIN_VALUE")':\"\$PATH\"
    export ROD_BROWSER_BIN='$ROD_BROWSER_BIN_VALUE'
    exec setsid '$GO_BIN_VALUE' run . </dev/null
  " >"$BACKEND_LOG" 2>&1 &

  echo $! >"$BACKEND_PID_FILE"
}

print_summary() {
  local wsl_ip
  wsl_ip="$(get_wsl_ip || true)"

  log "启动流程完成"
  log "ai-marketing: http://localhost:$AI_MARKETING_PORT"
  log "Go 后端: http://localhost:$BACKEND_PORT"
  if [ -n "$wsl_ip" ]; then
    log "WSL ai-marketing: http://$wsl_ip:$AI_MARKETING_PORT"
    log "WSL Go 后端: http://$wsl_ip:$BACKEND_PORT"
  fi
  log "流程日志: $PROCESS_LOG"
  log "ai-marketing 日志: $AI_MARKETING_LOG"
  log "Go 后端日志: $BACKEND_LOG"
  log "ai-marketing PID: $(cat "$AI_MARKETING_PID_FILE")"
  log "Go 后端 PID: $(cat "$BACKEND_PID_FILE")"
}

log "开始执行 start_dev.sh"
log "流程说明: 1) 编译 ai-marketing 2) 编译 Go 后端 3) 清理旧进程 4) 用 tmux 启动开发服务并检查 Windows localhost 可达性"

GO_BIN_VALUE="$(detect_go_bin || true)"
NODE_BIN_VALUE="$(detect_node_bin || true)"
PNPM_BIN_VALUE="$(detect_pnpm_bin || true)"
ROD_BROWSER_BIN_VALUE="$(detect_browser_bin || true)"

if [ -z "$GO_BIN_VALUE" ]; then
  log "未找到 go，请先在 WSL 安装 Go，或设置 GO_BIN"
  exit 1
fi

if [ -z "$NODE_BIN_VALUE" ]; then
  log "未找到 node，请先在 WSL 安装 Node.js，或设置 NODE_BIN"
  exit 1
fi

if [ -z "$PNPM_BIN_VALUE" ]; then
  log "未找到 pnpm，请先在 WSL 安装 pnpm，或设置 PNPM_BIN"
  exit 1
fi

if [ -z "$ROD_BROWSER_BIN_VALUE" ]; then
  log "未找到可用的 Chrome/Chromium，请设置 ROD_BROWSER_BIN"
  exit 1
fi

log "GO_BIN=$GO_BIN_VALUE"
log "NODE_BIN=$NODE_BIN_VALUE"
log "PNPM_BIN=$PNPM_BIN_VALUE"
log "ROD_BROWSER_BIN=$ROD_BROWSER_BIN_VALUE"

ensure_paths

if [ "$SKIP_BUILD" = "1" ]; then
  log "SKIP_BUILD=1，跳过编译步骤"
else
  compile_ai_marketing
  compile_backend
fi

stop_existing_services
start_ai_marketing
start_backend
wait_for_port "$AI_MARKETING_PORT" "ai-marketing"
wait_for_port "$BACKEND_PORT" "Go 后端"
verify_windows_localhost "$AI_MARKETING_PORT" "$(get_wsl_ip || true)" || true
verify_windows_localhost "$BACKEND_PORT" "$(get_wsl_ip || true)" || true
print_summary
