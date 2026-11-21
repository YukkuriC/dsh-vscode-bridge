#!/usr/bin/env node
/**
 * Queue one message for the running DSH app's composer.
 *
 * Usage: node --experimental-sqlite cli/attach.mjs <path | path:line | path:start-end | URL>
 */
import { queueAttach } from '../lib/attach-store.js'

const content = process.argv.slice(2).join(' ').trim()
if (content === '') {
    console.error('usage: attach <path | path:line | URL>')
    process.exit(1)
}
queueAttach(content, null)
console.log('queued')
