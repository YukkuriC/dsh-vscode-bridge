# dsh-vscode-bridge

在 Harness Web UI 中把 VS Code 拉进链接链路：放行 `vscode://` 链接，并把 DSH 内链劫持到 VS Code。

## 功能

- `vscode://` 链接：聊天里所有以 `vscode://` 开头的链接，点击直接在本地 VS Code 打开。
- DSH 内链劫持：在侧栏控制器真正打开资源之前拦截所有 `dsh-resource://` 链接，解析出绝对路径后直接交给 VS Code，不展开侧栏。
- 插件页开关（插件管理 → `dsh-vscode-bridge` 的主页面）：
    - 总开关：是否劫持所有 DSH 内链。
    - 仅在按下组合键时劫持：只在总开关打开时显示与生效。
    - 组合键选择：Ctrl / Shift / Alt / Meta。
- 打开前清理会让 VS Code 隐身的 `ELECTRON_RUN_AS_NODE`。

## 安装

- 本仓库即插件包，通过 `plugin_manager` 的 `install_bundle` 以本地链接方式装入 profile。
- 重新安装：`plugin_manager` → `install_bundle`，目标填 `D:\Projects\AI\dsh-vscode-bridge`。
- 本地链接安装，修改后需重启 Harness，或等待客户端 HMR 生效。

## 开发

- 源码：`lib/host.js`（Host 路由）、`lib/open-link.js`（系统调用）、`lib/client.js`（浏览器端）。
- 格式化全部文件：`npm run format`
- 只检查不修改：`npm run format:check`

实现细节与问题背景见 [`docs/implementation.md`](docs/implementation.md)。
