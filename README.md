# dsh-vscode-bridge

在 Harness Web UI 中把 VS Code 拉进链接链路，并提供一个从外部往当前对话输入框投递内容的口子。

## 功能

### 在 VS Code 中打开链接

- `vscode://` 链接：聊天里所有以 `vscode://` 开头的链接，点击直接在本地 VS Code 打开。
- DSH 内链劫持：在侧栏控制器真正打开资源之前拦截所有 `dsh-resource://` 链接，解析出绝对路径后直接交给 VS Code，不展开侧栏。
- 插件页开关（插件管理 → `dsh-vscode-bridge` 的主页面）：
    - 总开关：是否劫持所有 DSH 内链。
    - 仅在按下组合键时劫持：只在总开关打开时显示与生效。
    - 组合键选择：Ctrl / Shift / Alt / Meta。
- 打开前清理会让 VS Code 隐身的 `ELECTRON_RUN_AS_NODE`。

### 外部投递到输入框

- 外部程序执行 `cli\attach.cmd <路径 | 路径:行号 | 路径:起-止 | URL>`，或直接向插件目录的 `attach.sqlite` 插入一行。
- 客户端按可配置间隔（默认 2 秒）轮询队列，把内容插入当前对话的输入框；文件路径插入为文件引用 chip，chip 显示带行号的文件名（`文件:行` / `文件:起-止`），HTTP(S) 地址按文本插入。
- 插件页配置：轮询间隔、图片路径作为链接还是附件。

### VS Code 扩展

`ext/vscode/` 是配套的 VS Code 扩展，通过 `cli\attach.cmd` 把编辑器位置或资源路径投递到 DSH：

- 插入内容至 DSH：发送 `文件绝对路径:行号`，多行选区发送 `文件绝对路径:起-止`。单行选区与光标发送单行；没有激活编辑器时警告且不发送。已注册命令，可在键盘快捷方式中自行绑定，默认不提供快捷键。
- 插入路径至 DSH：在资源管理器与源代码管理条目右键菜单中发送文件或目录的绝对路径。
- 配置项 `dsh-vscode-bridge.attachCmd` 必须指向本插件的 `cli\attach.cmd`，无效时上述命令弹出警告且不发送。
- 图标与主插件相同；打包与链接脚本见 [`ext/vscode/README.md`](ext/vscode/README.md)。

## 安装

- 本仓库即插件包，通过 `plugin_manager` 的 `install_bundle` 以本地链接方式装入 profile。
- 重新安装：`plugin_manager` → `install_bundle`，目标填 `D:\Projects\AI\dsh-vscode-bridge`。
- 本地链接安装，修改后需重启 Harness，或等待客户端 HMR 生效。

## 开发

- 源码：`lib/host.js`（Host 路由）、`lib/open-link.js`（系统调用）、`lib/attach-store.js`（SQLite 队列）、`lib/client.js`（浏览器端）、`cli/attach.cmd`（外部入口）。
- 格式化全部文件：`npm run format`
- 只检查不修改：`npm run format:check`

实现细节与问题背景见 [`docs/implementation.md`](docs/implementation.md)。
