# xiaohongshu-mcp

小红书 MCP 服务，提供 HTTP MCP 接口和业务 API，并带一个本地开发用的 `ai-marketing` 前端。

当前仓库的本地开发形态是：
- Go 后端默认监听 `18060`
- `ai-marketing` 前端默认监听 `3001`
- 推荐在 `Windows + WSL2 Ubuntu` 下运行
- 推荐通过 [`start_dev.sh`](./start_dev.sh) 一键启动

## 项目结构

```text
xiaohongshu-mcp/
├─ main.go                 # Go 服务入口
├─ routes.go               # HTTP 路由，包含 /mcp 和 /api/v1
├─ service.go              # 小红书核心服务
├─ start_dev.sh            # WSL 开发启动脚本
├─ start-dev.sh            # start_dev.sh 的兼容入口
├─ ai-marketing/           # 本地开发前端
├─ cookies.json            # 登录态持久化文件
└─ login_state.json        # 登录状态缓存
```

## 功能概览

- HTTP MCP 服务，入口为 `http://localhost:18060/mcp`
- 登录相关 API
- 小红书内容发布
- 搜索、推荐流、详情、评论、用户信息
- 本地管理前端 `ai-marketing`

## 运行环境

推荐环境：
- Windows 11
- WSL2
- Ubuntu 24.04 或同类 Linux 发行版

最低依赖：
- Go `1.24.x`
- Node.js `22.x`
- pnpm `10.x`
- Linux 版 Chrome 或 Chromium
- `tmux`
- `curl`
- `ss` 所在工具包

说明：
- `start_dev.sh` 会在 WSL 中自动查找 `go`、`node`、`pnpm` 和 Chrome/Chromium。
- 前端依赖 `node:sqlite`，因此建议直接使用 Node 22。
- 后端依赖 `ROD_BROWSER_BIN` 指向 WSL 内的 Linux 浏览器，不要指向 Windows 的 Chrome。

## 依赖说明

### Go 依赖

核心依赖定义在 [`go.mod`](./go.mod)：

- `github.com/gin-gonic/gin`
- `github.com/go-rod/rod`
- `github.com/modelcontextprotocol/go-sdk`
- `github.com/sirupsen/logrus`
- `github.com/xpzouying/headless_browser`

安装 Go 依赖：

```bash
cd /mnt/f/xiaohongshu-mcp
go mod download
```

### 前端依赖

前端依赖定义在 [`ai-marketing/package.json`](./ai-marketing/package.json)。

核心依赖包括：
- React 19
- Vite 7
- tsx
- tRPC
- Tailwind CSS 4
- Express

安装前端依赖：

```bash
cd /mnt/f/xiaohongshu-mcp/ai-marketing
pnpm install
```

## 安装步骤

### 1. 克隆仓库

如果仓库就放在当前路径，可以跳过。

```bash
git clone <your-repo-url> /mnt/f/xiaohongshu-mcp
cd /mnt/f/xiaohongshu-mcp
```

### 2. 进入 WSL

```powershell
wsl -d Ubuntu
```

进入后：

```bash
cd /mnt/f/xiaohongshu-mcp
```

### 3. 安装系统依赖

如果是全新 WSL 环境，先安装基础工具：

```bash
sudo apt update
sudo apt install -y curl unzip tmux iproute2
```

如果还没有 Go、Node.js、pnpm、Chrome/Chromium，需要先安装。

### 4. 安装 Go

要求版本：`1.24.x`

安装完成后确认：

```bash
go version
```

### 5. 安装 Node.js 和 pnpm

要求版本：
- Node.js `22.x`
- pnpm `10.x`

确认命令：

```bash
node -v
pnpm -v
```

### 6. 安装 Linux Chrome/Chromium

后端需要浏览器驱动登录和页面操作。必须在 WSL 内安装 Linux 浏览器，并记录二进制路径。

常见路径示例：

```bash
/usr/bin/google-chrome
/usr/bin/chromium
/home/<user>/chrome-for-testing/chrome-linux64/chrome
```

确认浏览器路径：

```bash
command -v google-chrome || true
command -v chromium || true
command -v chromium-browser || true
```

如果脚本无法自动识别，启动前手动设置：

```bash
export ROD_BROWSER_BIN=/path/to/linux/chrome
```

### 7. 安装项目依赖

```bash
cd /mnt/f/xiaohongshu-mcp
go mod download

cd /mnt/f/xiaohongshu-mcp/ai-marketing
pnpm install
```

## 启动方式

### 推荐方式：一键启动

在 WSL 中执行：

```bash
cd /mnt/f/xiaohongshu-mcp
./start_dev.sh
```

兼容入口也可以：

```bash
cd /mnt/f/xiaohongshu-mcp
./start-dev.sh
```

脚本行为：
1. 检查 `go`、`node`、`pnpm`、`ROD_BROWSER_BIN`
2. 编译 `ai-marketing`
3. 编译 Go 后端
4. 清理旧进程
5. 使用 `tmux` 启动前后端
6. 尝试检查 Windows `localhost` 连通性

默认端口：
- 前端：`3001`
- 后端：`18060`

默认日志：
- `/tmp/xiaohongshu-mcp/start-dev.log`
- `/tmp/xiaohongshu-mcp/ai-marketing-dev.log`
- `/tmp/xiaohongshu-mcp/xhs-backend.log`

默认 `tmux` 会话：
- `ai_marketing_frontend`
- `xhs_backend`

### 快速重启：跳过编译

如果依赖已经安装完，只是想快速拉起开发服务，推荐：

```bash
cd /mnt/f/xiaohongshu-mcp
SKIP_BUILD=1 ./start_dev.sh
```

这个模式适合：
- 已经完成过构建
- 只想重启服务
- 避免 `vite build` 拉长启动时间

### 手动启动前端

```bash
cd /mnt/f/xiaohongshu-mcp/ai-marketing
NODE_ENV=development PORT=3001 ./node_modules/.bin/tsx watch server/_core/index.ts
```

启动成功后通常会看到：

```text
Server running on http://localhost:3001/
```

说明：
- 如果 `3001` 被占用，前端代码会向后尝试空闲端口
- `start_dev.sh` 默认显式设置 `PORT=3001`

### 手动启动后端

```bash
cd /mnt/f/xiaohongshu-mcp
export ROD_BROWSER_BIN=/path/to/linux/chrome
go run .
```

如果需要指定参数：

```bash
cd /mnt/f/xiaohongshu-mcp
export ROD_BROWSER_BIN=/path/to/linux/chrome
go run . -headless=true -port=:18060
```

说明：
- 默认端口是 `:18060`
- MCP 入口是 `/mcp`
- 健康检查入口是 `/health`

### 使用 tmux 保活

前端：

```bash
tmux kill-session -t ai_marketing_frontend 2>/dev/null || true
tmux new-session -d -s ai_marketing_frontend 'bash'
tmux send-keys -t ai_marketing_frontend 'cd /mnt/f/xiaohongshu-mcp/ai-marketing && export NODE_ENV=development && export PORT=3001 && ./node_modules/.bin/tsx watch server/_core/index.ts > /tmp/xiaohongshu-mcp/ai-marketing-dev.log 2>&1' C-m
```

后端：

```bash
tmux kill-session -t xhs_backend 2>/dev/null || true
tmux new-session -d -s xhs_backend 'bash'
tmux send-keys -t xhs_backend 'cd /mnt/f/xiaohongshu-mcp && export ROD_BROWSER_BIN=/path/to/linux/chrome && go run . > /tmp/xiaohongshu-mcp/xhs-backend.log 2>&1' C-m
```

查看会话：

```bash
tmux ls
```

查看日志：

```bash
tail -f /tmp/xiaohongshu-mcp/ai-marketing-dev.log
tail -f /tmp/xiaohongshu-mcp/xhs-backend.log
```

## 访问地址

在 WSL 内：
- 前端：`http://127.0.0.1:3001/`
- 后端健康检查：`http://127.0.0.1:18060/health`
- MCP：`http://127.0.0.1:18060/mcp`

在 Windows 浏览器中：
- 前端：`http://localhost:3001/`
- 后端健康检查：`http://localhost:18060/health`
- MCP：`http://localhost:18060/mcp`

注意：
- 后端根路径 `/` 可能返回 `404`，这是正常现象。
- 是否能访问，请优先验证 `/health` 和 `/mcp`。

## Windows portproxy 配置

当服务运行在 WSL 中，但 Windows 侧 `localhost` 无法访问时，需要配置 `portproxy`。

### 1. 获取 WSL IP

在 WSL 中执行：

```bash
hostname -I
```

例如：

```text
172.29.176.75
```

假设得到的 WSL IP 为 `172.29.176.75`。

### 2. 以管理员身份打开 PowerShell

必须使用管理员权限，否则 `netsh interface portproxy add` 会失败。

### 3. 添加 portproxy

前端 `3001`：

```powershell
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=3001
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=3001 connectaddress=172.29.176.75 connectport=3001
```

后端 `18060`：

```powershell
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=18060
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=18060 connectaddress=172.29.176.75 connectport=18060
```

查看现有规则：

```powershell
netsh interface portproxy show all
```

### 4. 确认 `IP Helper` 服务

```powershell
Get-Service iphlpsvc
```

需要看到服务状态为 `Running`。

### 5. 验证连通性

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3001/
Invoke-WebRequest -UseBasicParsing http://localhost:18060/health
Invoke-WebRequest -UseBasicParsing http://localhost:18060/mcp
```

说明：
- `http://localhost:3001/` 返回 `200` 代表前端可达
- `http://localhost:18060/health` 返回 `200` 代表后端可达
- `http://localhost:18060/mcp` 只要不是连接超时，通常说明转发已经生效

### 6. 常见问题

#### WSL IP 变了

WSL 重启后 IP 可能变化，原有 `portproxy` 会失效，需要重新执行上面的删除和添加命令。

#### localhost 超时，但 WSL IP 可访问

这通常说明：
- `portproxy` 规则没有更新
- PowerShell 不是管理员
- `IP Helper` 服务未运行

#### 脚本自动补齐失败

[`start_dev.sh`](./start_dev.sh) 会尝试检查 Windows `localhost` 是否可达，但自动写入 `portproxy` 仍然要求管理员权限。

## 验证步骤

### 验证进程

在 WSL 中执行：

```bash
ss -ltn | grep 3001
ss -ltn | grep 18060
```

### 验证前端

```bash
curl -I http://127.0.0.1:3001/
```

### 验证后端

```bash
curl http://127.0.0.1:18060/health
```

### 验证 MCP

```bash
curl -X POST http://127.0.0.1:18060/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
```

## 常用开发命令

### 前端类型检查

```bash
cd /mnt/f/xiaohongshu-mcp/ai-marketing
./node_modules/.bin/tsc --noEmit
```

### 前端格式化

```bash
cd /mnt/f/xiaohongshu-mcp/ai-marketing
pnpm format
```

### 后端测试

```bash
cd /mnt/f/xiaohongshu-mcp
go test ./...
```

### 后端构建

```bash
cd /mnt/f/xiaohongshu-mcp
go build ./...
```

## MCP 客户端接入

服务启动后，可将 MCP 地址配置为：

```text
http://localhost:18060/mcp
```

如果客户端运行在 Docker 内，可改用：

```text
http://host.docker.internal:18060/mcp
```

## 常见问题

### `go: command not found`

说明 Go 未安装，或者未加入 PATH。先确认：

```bash
which go
go version
```

### `pnpm: command not found`

说明 pnpm 未安装。先确认 Node 版本，再安装 pnpm。

### 未找到 Chrome/Chromium

启动前手动设置：

```bash
export ROD_BROWSER_BIN=/path/to/linux/chrome
```

### `start_dev.sh` 能找到脚本，但启动失败

优先检查：
- `ai-marketing/node_modules` 是否存在
- `ROD_BROWSER_BIN` 是否有效
- `tmux` 是否可用
- `/tmp/xiaohongshu-mcp/*.log` 中是否有明确错误

### `./start_dev.sh` 启动很慢

默认会先执行编译：
- `pnpm build`
- `go build ./...`

如果只是日常开发重启，使用：

```bash
SKIP_BUILD=1 ./start_dev.sh
```

### Windows 浏览器打不开 `localhost`

先验证 WSL IP 是否可访问：

```powershell
Invoke-WebRequest -UseBasicParsing http://<wsl-ip>:3001/
Invoke-WebRequest -UseBasicParsing http://<wsl-ip>:18060/health
```

如果 WSL IP 可访问，而 `localhost` 不可访问，基本就是 `portproxy` 问题。

## 当前仓库的已验证启动组合

基于当前仓库脚本，已验证的本地开发组合是：
- WSL: `Ubuntu`
- 前端端口：`3001`
- 后端端口：`18060`
- Windows 访问：通过 `localhost` + `portproxy`

推荐日常命令：

```bash
wsl -d Ubuntu bash -lc 'cd /mnt/f/xiaohongshu-mcp && SKIP_BUILD=1 ./start_dev.sh'
```

首次完整启动：

```bash
wsl -d Ubuntu bash -lc 'cd /mnt/f/xiaohongshu-mcp && ./start_dev.sh'
```

## 备注

- [`start_dev.sh`](./start_dev.sh) 当前将项目根目录写死为 `/mnt/f/xiaohongshu-mcp`。
- 如果你的仓库不在这个路径，需要修改脚本中的 `ROOT_DIR`，或者改用手动启动方式。
- 不要把 `ROD_BROWSER_BIN` 指向 Windows 浏览器路径。
