# 实现细节

## 背景：为什么直接点击没有反应

1. Web UI 的 Markdown 渲染会区分链接协议：只有 `http:` / `https:` 会走 `openExternalLink`，其它协议（如 `vscode:`）保留原生 `<a href>` 行为。
2. 原生点击会让 Electron 渲染进程导航到 `vscode://…`。桌面壳的 `will-navigate` 只允许 `dsh-app:` 和同源 `http:`，其余一律 `preventDefault()`；`setWindowOpenHandler` 也只对 http/https 调用 `shell.openExternal`。所以直接点击表现为静默无反应。
3. 即使改由 Host 直接启动协议处理器，桌面运行时仍会以 `ELECTRON_RUN_AS_NODE=1` 启动 Host（`dsh-desktop-host` 注入该变量）。`Code.exe` 继承该变量后会按 Node 脚本运行，窗口不可见。
    - 2026-11-12 本机实测：带 `ELECTRON_RUN_AS_NODE=1` 直接启动 `Code.exe --open-url -- "vscode://…"` 会立即退出且没有窗口；去掉该变量、由 Explorer 走系统协议处理器则能正常打开。
4. 把链接拷到“运行”里执行会走 ShellExecute，环境由 Explorer 提供，因此能正常打开。本插件选择由 Explorer 转发，正是复用这条已被验证的路径。

## 实现

### 结构

| 文件               | 职责                                   |
| ------------------ | -------------------------------------- |
| `index.js`         | 包入口，转出 `lib/host.js` 的导出      |
| `lib/host.js`      | Cordis 插件：注册转发路由              |
| `lib/open-link.js` | 把链接交给 Explorer（系统协议处理器）  |
| `lib/client.js`    | 页面内拦截 `vscode://` 点击并请求 Host |

### 转发路由

- `GET /vscode-bridge/open?url=<encodeURIComponent(url)>`。
- 不校验请求方法、content-type、请求体大小，也不解析 URL 结构；读取 `url` 查询参数，只确认它以 `vscode://` 开头（大小写不敏感）后转发。
- 保留一行 `ctx.connection.requestRejection(req)`：它挡的是任意本机网页对本端口的跨站调用（Host/Origin + 登录校验），不是 GET/POST 之类的协议检查。
- 响应：成功 `200`，缺少链接 `400`，交给系统失败 `502`。

### 打开方式

- `spawn('explorer.exe', [url])`，`detached` 且忽略 stdio，与在“运行”里粘贴链接回车走同一条 ShellExecute 路径。
- 环境副本只删 `ELECTRON_RUN_AS_NODE`。正常桌面下 Explorer 已在运行，VS Code 继承的是 Explorer 的环境，这一步只兜底“需要由本进程启动 Explorer”的情况。

### 客户端

- 在 `document` 捕获阶段拦截普通左键点击，命中 `a[href]` 且 `href` 以 `vscode://` 开头时 `preventDefault()`，再 `fetch('vscode-bridge/open?url=…')`。
- `dsh.client.immediately` 让浏览器模块在页面启动时加载。
- 监听器由 `ctx.effect` 注册并返回移除函数。
