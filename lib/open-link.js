import { spawn } from 'node:child_process'

/**
 * Hand one vscode:// link to the OS protocol handler.
 *
 * Explorer performs the ShellExecute in its own process, so VS Code starts
 * from Explorer's environment. Stripping ELECTRON_RUN_AS_NODE only matters
 * when Explorer has to be started by this process: Code.exe inherits that
 * switch and would run as Node without a window.
 */
export function forwardVscodeLink(url) {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn('explorer.exe', [url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env,
    })
    return new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('spawn', () => {
            child.unref()
            resolve()
        })
    })
}
