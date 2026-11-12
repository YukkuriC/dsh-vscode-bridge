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
- 组合键状态：`document` 捕获阶段的 `pointerdown` / `click` 记录修饰键，2 秒内有效。勾选的按键需同时按住；最后一项不可取消，插件页会显示当前生效的组合键。
- 开关：`plugins.bundle.config`，key `dsh-vscode-bridge`；总开关、组合键开关、Ctrl / Shift / Alt / Meta。状态存 `localStorage`，即时生效。
