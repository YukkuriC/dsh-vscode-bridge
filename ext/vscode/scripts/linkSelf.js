// Link this extension into the local VS Code extension directories.
// Usage: node scripts/linkSelf.js [-f]

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const EXT_DIR = path.resolve(__dirname, '..')
const EXT_NAME = require('../package.json').name
const FORCE = process.argv.includes('-f')
const EDITOR_DIRS = ['.vscode', '.vscode-insiders', '.vscode-oss']

const home = os.homedir()
const extensionsDirs = EDITOR_DIRS.map(name => path.join(home, name, 'extensions')).filter(
    dir => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() === true,
)

if (extensionsDirs.length === 0) {
    console.error(`[error] No VS Code extensions directory found under ${home}`)
    process.exit(1)
}

let linked = 0
let failed = 0
console.log(`=== linkSelf ===`)
console.log(`Source: ${EXT_DIR}`)
console.log('')

for (const extensionsDir of extensionsDirs) {
    const linkPath = path.join(extensionsDir, EXT_NAME)
    if (fs.lstatSync(linkPath, { throwIfNoEntry: false }) !== undefined) {
        if (!FORCE) {
            console.log(`[skip] ${linkPath} already exists (use -f to replace)`)
            failed += 1
            continue
        }
        fs.rmSync(linkPath, { recursive: true, force: true })
        console.log(`[info] removed ${linkPath}`)
    }
    fs.symlinkSync(EXT_DIR, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    console.log(`[ok] ${linkPath} -> ${EXT_DIR}`)
    linked += 1
}

console.log('')
console.log(`=== Result: ${linked} linked, ${failed} skipped ===`)
if (linked === 0) process.exit(1)
console.log('[done] Restart VS Code or run "Developer: Reload Window" to load the extension.')
