# Requirements

## 必要环境
- Windows + WSL Ubuntu
- Go：`/usr/local/go/bin/go`
- Node.js + `pnpm`
- Linux Chrome for Testing

## WSL 依赖
如果没有 `python3`，先装它；当前方案用它解压 Chrome：
```bash
sudo apt update
sudo apt install -y python3
```

## Chrome for Testing
下载并解压后，给可执行文件加权限：
```bash
chmod +x /home/lbx/chrome-for-testing/chrome-linux64/chrome
chmod +x /home/lbx/chrome-for-testing/chrome-linux64/chrome_crashpad_handler
```

## 说明
- 不要直接用 Windows 的 `chrome.exe`
- 扫码登录时，`ROD_BROWSER_BIN` 需要指向 WSL 内的 Linux Chrome
- 示例：
```bash
export ROD_BROWSER_BIN=/home/lbx/chrome-for-testing/chrome-linux64/chrome
```
