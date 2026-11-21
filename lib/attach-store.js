import { DatabaseSync } from 'node:sqlite'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** SQLite file kept beside the plugin: received messages wait here for the app. */
const DB_PATH = fileURLToPath(new URL('../attach.sqlite', import.meta.url))

/** Files whose changes mean the queue may have new rows: the database and its WAL. */
const DATABASE_FILES = [DB_PATH, `${DB_PATH}-wal`]

/** Fingerprint of the last successful take; undefined means "read once". */
let fingerprint

/** Milliseconds a blocked statement waits for the other connection's lock. */
const LOCK_TIMEOUT_MS = 5000

/** `mtime:size` of the database and its WAL, or `-` for a missing file. */
function currentFingerprint() {
    return DATABASE_FILES.map(path => {
        const info = statSync(path, { throwIfNoEntry: false })
        return info === undefined ? '-' : `${info.mtimeMs}:${info.size}`
    }).join('|')
}

const IMAGE_TYPES = new Map([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.bmp', 'image/bmp'],
    ['.ico', 'image/x-icon'],
    ['.svg', 'image/svg+xml'],
])

const db = new DatabaseSync(DB_PATH)
db.exec(`
    PRAGMA busy_timeout = ${LOCK_TIMEOUT_MS};
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS attach_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        content TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS attach_messages_pending ON attach_messages (consumed_at, id);
`)

const insertMessage = db.prepare('INSERT INTO attach_messages (session_id, content, kind, created_at) VALUES (?, ?, ?, ?)')
const selectPending = db.prepare('SELECT id, content, kind FROM attach_messages WHERE consumed_at IS NULL ORDER BY id')
const markConsumed = db.prepare('UPDATE attach_messages SET consumed_at = ? WHERE id = ?')
const selectById = db.prepare('SELECT content, kind FROM attach_messages WHERE id = ?')

/** Media type of one image path, or undefined for a non-image path. */
function imageMediaType(path) {
    const clean = path.split('?', 1)[0]
    const dot = clean.lastIndexOf('.')
    return dot === -1 ? undefined : IMAGE_TYPES.get(clean.slice(dot).toLowerCase())
}

/** Store one received message for the app to pick up. */
export function queueAttach(content, sessionId) {
    const remote = /^https?:\/\//i.test(content)
    const kind = !remote && imageMediaType(content) !== undefined ? 'image' : 'text'
    insertMessage.run(sessionId, content, kind, Date.now())
}

/** Take every unconsumed message, marking the batch consumed. */
function takePending() {
    db.exec('BEGIN IMMEDIATE')
    try {
        const rows = selectPending.all()
        const now = Date.now()
        for (const row of rows) markConsumed.run(now, row.id)
        db.exec('COMMIT')
        return rows
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }
}

/**
 * Take pending messages only when the database files changed since the last
 * take. Returns null while unchanged, so an idle poll costs two stats and no
 * SQLite transaction.
 */
export function takePendingIfChanged() {
    const before = currentFingerprint()
    if (before === fingerprint) return null
    const rows = takePending()
    fingerprint = before
    return rows
}

/** Bytes and media type of one queued image, for the composer's paste path. */
export function readAttachImage(id) {
    const row = selectById.get(id)
    const mediaType = imageMediaType(row.content)
    return { bytes: readFileSync(row.content), mediaType }
}
