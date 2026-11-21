const { spawn } = require('node:child_process')
const { existsSync, statSync } = require('node:fs')
const vscode = require('vscode')

const CONFIG_SECTION = 'dsh-vscode-bridge'
const ATTACH_CMD_KEY = 'attachCmd'
const INSERT_CONTENT_COMMAND = 'dsh-vscode-bridge.insertContent'
const INSERT_PATH_COMMAND = 'dsh-vscode-bridge.insertPath'

/** UI strings; VS Code reports its display language, so the manifest nls files are enough. */
const STRINGS = {
    en: {
        missingAttachCmd: 'DSH: set "dsh-vscode-bridge.attachCmd" to the path of the DSH plugin\'s cli/attach.cmd first.',
        invalidAttachCmd: path => `DSH: the configured attach.cmd path is not a file: ${path}`,
        noActiveEditor: 'DSH: no active text editor, nothing was sent.',
        sendFailed: (code, detail) => `DSH: attach.cmd exited with code ${code}${detail === '' ? '' : `: ${detail}`}`,
    },
    zh: {
        missingAttachCmd: 'DSH：请先在设置 dsh-vscode-bridge.attachCmd 中填写 DSH 插件的 cli/attach.cmd 路径。',
        invalidAttachCmd: path => `DSH：配置的 attach.cmd 路径无效：${path}`,
        noActiveEditor: 'DSH：没有激活的文本编辑器，未发送内容。',
        sendFailed: (code, detail) => `DSH：attach.cmd 退出码 ${code}${detail === '' ? '' : `：${detail}`}`,
    },
}

const strings = STRINGS[vscode.env.language.toLowerCase().startsWith('zh') ? 'zh' : 'en']

/** Configured attach.cmd, or undefined after warning about the missing/invalid setting. */
function attachCmdPath() {
    const configured = vscode.workspace.getConfiguration(CONFIG_SECTION).get(ATTACH_CMD_KEY, '').trim()
    if (configured === '') {
        void vscode.window.showWarningMessage(strings.missingAttachCmd)
        return undefined
    }
    if (!existsSync(configured) || !statSync(configured).isFile()) {
        void vscode.window.showWarningMessage(strings.invalidAttachCmd(configured))
        return undefined
    }
    return configured
}

/** Quote one argument for the command line handed to cmd.exe. */
function quoteArg(value) {
    return `"${value.replace(/"/g, '""')}"`
}

/** Run attach.cmd. */
function runAttach(cmdPath, args) {
    const commandLine = [cmdPath, ...args].map(quoteArg).join(' ')
    const child = spawn(process.env.ComSpec, ['/d', '/s', '/c', `"${commandLine}"`], {
        windowsHide: true,
        windowsVerbatimArguments: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
        stderr += chunk
    })
    return new Promise((resolve, reject) => {
        child.on('error', reject)
        child.on('close', code => resolve({ code, stderr }))
    })
}

/** Send one payload and report a failed CLI run. */
async function send(cmdPath, args) {
    const { code, stderr } = await runAttach(cmdPath, args)
    if (code !== 0) void vscode.window.showErrorMessage(strings.sendFailed(code, stderr.trim()))
}

/** `path:line` at the caret, or `path:start-end` for a selection spanning lines. */
function referenceOf(document, selection) {
    const startLine = selection.start.line + 1
    let endLine = startLine
    if (!selection.isEmpty) endLine = selection.end.character === 0 ? selection.end.line : selection.end.line + 1
    const lines = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`
    return `${document.uri.fsPath}:${lines}`
}

/** Queue the cursor line, or the lines covered by the selection, as a `path:start-end` reference. */
async function insertContent() {
    const editor = vscode.window.activeTextEditor
    if (editor === undefined) {
        void vscode.window.showWarningMessage(strings.noActiveEditor)
        return
    }
    const cmdPath = attachCmdPath()
    if (cmdPath === undefined) return
    await send(cmdPath, [referenceOf(editor.document, editor.selection)])
}

/** Absolute paths of the explorer/SCM selection, in the order VS Code passed them. */
function selectedPaths(args) {
    const [first, selected] = args
    if (first instanceof vscode.Uri) return (selected === undefined ? [first] : selected).map(uri => uri.fsPath)
    return args.map(state => state.resourceUri.fsPath)
}

/** Queue every selected file or directory as a path reference. */
async function insertPath(...args) {
    const cmdPath = attachCmdPath()
    if (cmdPath === undefined) return
    for (const path of selectedPaths(args)) await send(cmdPath, [path])
}

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand(INSERT_CONTENT_COMMAND, insertContent),
        vscode.commands.registerCommand(INSERT_PATH_COMMAND, insertPath),
    )
}

module.exports = { activate }
