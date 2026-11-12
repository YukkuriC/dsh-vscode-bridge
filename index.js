// Package entry. The plugin lives in `lib/host.js`; this shim keeps the
// package root resolvable for the Loader and for `import 'dsh-vscode-bridge'`.
export * from './lib/host.js'
