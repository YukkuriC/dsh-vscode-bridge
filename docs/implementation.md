# 实现细节

## 背景：为什么直接点击没有反应

1. Web UI 的 Markdown 渲染会区分链接协议：只有 `http:` / `https:` 会走 `openExternalLink`，其它协议（如 `vscode:`）保留原生 `<a href>` 行为。
2. 原生点击会让 Electron 渲染进程导航到 `vscode://…`。桌面壳的 `will-navigate` 只允许 `dsh-app:` 和同源 `http:`，其余一律 `preventDefault()`；`setWindowOpenHandler` 也只对 http/https 调用 `shell.openExternal`。所以直接点击表现为静默无反应。
3. 即使改由 Host 直接启动协议处理器，桌面运行时仍会以 `ELECTRON_RUN_AS_NODE=1` 启动 Host（`dsh-desktop-host` 注入该变量）。`Code.exe` 继承该变量后会按 Node 脚本运行，窗口不可见。
    - 2026-11-12 本机实测：带 `ELECTRON_RUN_AS_NODE=1` 直接启动 `Code.exe --open-url -- "vscode://…"` 会立即退出且没有窗口；去掉该变量、由 Explorer 走系统协议处理器则能正常打开。
4. 把链接拷到“运行”里执行会走 ShellExecute，环境由 Explorer 提供，因此能正常打开。本插件选择由 Explorer 转发，正是复用这条已被验证的路径。

## 结构

| 文件               | 职责                                  |
| ------------------ | ------------------------------------- |
| `index.js`         | 包入口，转出 `lib/host.js` 的导出     |
| `lib/host.js`      | Cordis 插件：注册转发路由             |
| `lib/open-link.js` | 把链接交给 Explorer（系统协议处理器） |
| `lib/client.js`    | 链接拦截、打开入口拦截、插件页开关    |

## Host

- `GET /vscode-bridge/open?url=<encodeURIComponent(url)>`。读取 `url` 查询参数，确认以 `vscode://` 开头后转发。
- 每个请求先经过 `ctx.connection.requestRejection(req)`。
- `spawn('explorer.exe', [url])`，`detached` 且忽略 stdio；环境副本删除 `ELECTRON_RUN_AS_NODE`。
- 响应：成功 `200`，缺少链接 `400`，交给系统失败 `502`。

## Client

- `vscode://` 锚点：在 `document` 捕获阶段拦截普通左键点击，调用 Host 路由。
- `dsh-resource://` 内链：包装 `ctx.get('sidebarRight')` 的 `openResource` 与 `openResourceIn`。命中开关时把地址解析为绝对路径，拼成 `vscode://file/<path>[:line]` 调用 Host 路由，然后直接返回，不调用原方法。
- 地址解析：`dsh-resource://file/session/<sessionId>/<path>` 的 path 按会话 header cwd 解析，支持绝对路径、`..`、UNC；`absolute` 作用域按语法去掉前导 `/`。行号取 `options.params.line`。
- 注册占位类型 `vscode-bridge`（`patterns: ['dsh-resource://file/session/**']`，`canOpen` 读开关，无正文），让 dsh-better-sidebar 的文件树把文件交回 `openResource`。
- 组合键状态：`document` 捕获阶段的 `pointerdown` / `mousedown` / `click` 记录修饰键，2 秒内有效。勾选的按键需同时按住；最后一项不可取消，插件页会显示当前生效的组合键。
- 开关：`plugins.bundle.config`，key `dsh-vscode-bridge`；总开关、组合键开关、Ctrl / Shift / Alt / Meta。状态存 `localStorage`，即时生效。

## Attach 队列

- 外部入口：DSH 的 CLI 子命令不可由插件扩展，因此没有 `dsh attach`。发送方调用 `cli\attach.cmd <路径 | 路径:行号 | 路径:起-止 | URL>`（内部执行 `cli/attach.mjs` → `queueAttach`），或用任意 SQLite 驱动直接向 `attach.sqlite` 插入一行；两种方式都只写队列，不依赖 DSH 进程。
- 存储：插件目录的 `attach.sqlite`（WAL）。连接开启 `PRAGMA busy_timeout = 5000`，写锁被另一进程占用时等待而不是立刻报 `database is locked`。表 `attach_messages(id, session_id, content, kind, created_at, consumed_at)`；`kind` 为 `text` 或 `image`。
- 读取：`GET /vscode-bridge/attach/pending` 先比较 `attach.sqlite` 与 `attach.sqlite-wal` 的 `mtimeMs` + `size` 指纹。与上次相同就直接返回空列表，不执行任何 SQLite 语句；变了才取走未消费行并更新指纹。客户端仍按间隔发 HTTP，但空转时不读库。
- 客户端：在 `conversation.input.dock` 挂载轮询器，间隔取插件页配置（默认 2000 毫秒）。该 slot 在 hero（未发首条消息的新对话）和活跃输入框下都会渲染；`conversation.composer.dock` 在 hero 下不渲染，挂在那里会让新对话永远不轮询。无 Session 的首页不挂轮询器，消息留在队列里，选定工作区后插入。文件路径通过 agent 上下文的 `slash/input-insert-reference` 事件插入为文件引用 chip（可点击的链接），行号并入 chip 名称（`文件:行` 或 `文件:起-止`）；HTTP(S) 地址按文本插入。插入被拒绝时保留到下一轮重试。
- 图片：`link` 模式按文件引用 chip 插入；`attachment` 模式取回图片字节，构造 `File` 并以 `paste` 事件投给输入框编辑器，走正常的附件上传与卡片流程。

## VS Code 扩展

`ext/vscode/` 是配套扩展，只负责采集并调用 `attach.cmd`：

- 插入内容：`editor/context` 菜单。发送 `uri.fsPath:行号`；多行选区发送 `uri.fsPath:起-止`（选区结束在行首时不包含结束行），单行选区取选区首行，无选区时取光标行（`selection.active.line + 1`）。没有 `activeTextEditor` 时弹警告并返回。
- 插入路径：`explorer/context` 与 `scm/resourceState/context` 菜单。资源管理器取 `(uri, selectedUris)`，源代码管理取多个 `SourceControlResourceState`，逐条发送 `resourceUri.fsPath`。
- 配置：`dsh-vscode-bridge.attachCmd`。每次执行先校验路径存在且为文件，否则弹警告并返回。
- 调用：`cmd.exe /d /s /c` 执行 `attach.cmd`，参数逐个加引号，路径中的空格不需要额外处理。
- 命令未贡献 `keybindings`，由用户在键盘快捷方式中自行绑定。打包与链接脚本见 `ext/vscode/README.md`。
