# dsh-vscode-bridge

在 Harness Web UI 中放行 `vscode://` 链接：点击聊天里的这类链接，在本机 VS Code 中打开对应文件、行号或目录。

## 功能

- 放行所有以 `vscode://` 开头的链接（大小写不敏感），支持文件、目录和带行号的目标。
- 只处理普通左键点击；带 Ctrl/Cmd/Shift/Alt 的点击保持浏览器默认行为。
- 打开前清理会让 VS Code 隐身的 `ELECTRON_RUN_AS_NODE`，避免“点了没反应”。

## 安装

- 本仓库即插件包，已通过 `plugin_manager` 的 `install_bundle` 以本地链接方式装入 `desktop` profile。
- 重新安装：`plugin_manager` → `install_bundle`，目标填 `D:\Projects\AI\dsh-vscode-bridge`。
- 本地链接安装，修改后需重启 Harness，或等待客户端 HMR 生效。

## 开发

- 源码：`lib/host.js`（Host 路由）、`lib/open-link.js`（系统调用）、`lib/client.js`（浏览器端）。
- 格式化全部文件：`npm run format`
- 只检查不修改：`npm run format:check`

实现细节与问题背景见 [`docs/implementation.md`](docs/implementation.md)。
