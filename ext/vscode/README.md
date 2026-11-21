# dsh-vscode-bridge（VS Code 扩展）

把 VS Code 中的编辑器行位置或资源路径，通过 DSH 插件的 `cli/attach.cmd` 投递到当前 DSH 对话的输入框。图标与主插件相同。

## 功能

### 插入内容至 DSH

- 文本编辑器右键菜单中的「插入内容至 DSH」。
- 统一发送 `文件绝对路径:行号`；多行选区发送 `文件绝对路径:起-止`。
- 有选区时：发送选区覆盖的起止行；单行选区发送单行。
- 无选区时：行号取光标所在行。
- 没有激活的文本编辑器时：不发送，并弹出警告。
- 命令已注册，可在「键盘快捷方式」中自行绑定（搜索 `插入内容至 DSH`），默认不提供快捷键。

### 插入路径至 DSH

- 资源管理器（项目文件查看窗口）条目右键菜单。
- 源代码管理（版本控制窗口）条目右键菜单。
- 发送所点条目的绝对路径；多选时逐条发送。目录同样适用。

## 配置

| 配置项                        | 说明                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `dsh-vscode-bridge.attachCmd` | DSH 插件 `cli/attach.cmd` 的绝对路径，例如 `D:\Projects\AI\dsh-vscode-bridge\cli\attach.cmd`。 |

路径为空或不是文件时，运行上述功能只会弹出警告，不会发送任何内容。

## 使用前提

- DSH 侧插件已安装并运行，`cli/attach.cmd` 可执行。
- 扩展只调用现有的 `<路径 | 路径:行号 | 路径:起-止 | URL>` 入口，不修改 DSH 侧队列格式。

## 安装

### 方式一：链接到本机 VS Code（开发用）

```powershell
cd ext/vscode
npm install
npm run link
```

脚本会在 `%USERPROFILE%\.vscode\extensions`、`.vscode-insiders\extensions`、`.vscode-oss\extensions` 中创建指向本目录的 junction。已存在同名链接时默认跳过，用 `npm run link:force` 覆盖。完成后重启 VS Code，或执行「开发人员: 重新加载窗口」。

### 方式二：打包 VSIX

```powershell
cd ext/vscode
npm install
npm run package
```

生成 `dsh-vscode-bridge-0.1.0.vsix`，然后在 VS Code 中「扩展 → 从 VSIX 安装」，或执行：

```powershell
code --install-extension .\dsh-vscode-bridge-0.1.0.vsix
```

## 开发

- 入口：`extension.js`（CommonJS，无需编译）。
- 链接脚本：`scripts/linkSelf.js`。
- 打包使用 `@vscode/vsce`，配置与依赖均在本目录的 `package.json`，与仓库根目录的 `package.json` 无关。
