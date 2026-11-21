import { forwardVscodeLink } from './open-link.js'
import { readAttachImage, takePendingIfChanged } from './attach-store.js'

/** Cordis function-plugin name. */
export const name = 'vscode-bridge'

/** Route carriers and the connection trust fence. */
export const inject = ['webServer', 'connection']

const OPEN_PATH = '/vscode-bridge/open'
const ATTACH_PENDING_PATH = '/vscode-bridge/attach/pending'
const ATTACH_IMAGE_PATH = '/vscode-bridge/attach/image'

/** JSON response for the attach queue. */
function sendJson(res, status, payload) {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(payload))
}

/** The vscode:// link carried by one request, or undefined. */
function linkOf(req) {
    const url = new URL(req.url ?? '/', 'http://localhost').searchParams.get('url')?.trim()
    return url !== undefined && url.toLowerCase().startsWith('vscode://') ? url : undefined
}

export function apply(ctx) {
    /** Answer an untrusted/unauthenticated request; true when it was rejected. */
    const rejected = (req, res) => {
        const rejection = ctx.connection.requestRejection(req)
        if (rejection === undefined) return false
        res.statusCode = rejection
        res.end()
        return true
    }

    ctx.effect(
        () =>
            ctx.webServer.register({
                kind: 'exact',
                path: OPEN_PATH,
                handler: async (req, res) => {
                    // The port is reachable from any local page; this one call is
                    // the Host/Origin + login fence, not a protocol check.
                    if (rejected(req, res)) return
                    const url = linkOf(req)
                    if (url === undefined) {
                        res.statusCode = 400
                        res.end('expected ?url=vscode://...')
                        return
                    }
                    try {
                        await forwardVscodeLink(url)
                    } catch {
                        res.statusCode = 502
                        res.end('could not hand the link to the OS')
                        return
                    }
                    res.statusCode = 200
                    res.end('ok')
                },
            }),
        'vscode-bridge: forward vscode:// links',
    )

    ctx.effect(
        () =>
            ctx.webServer.register({
                kind: 'exact',
                path: ATTACH_PENDING_PATH,
                handler: (req, res) => {
                    if (rejected(req, res)) return
                    sendJson(res, 200, { items: takePendingIfChanged() ?? [] })
                },
            }),
        'vscode-bridge: attach pending',
    )

    ctx.effect(
        () =>
            ctx.webServer.register({
                kind: 'exact',
                path: ATTACH_IMAGE_PATH,
                handler: (req, res) => {
                    if (rejected(req, res)) return
                    const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('id')
                    const { bytes, mediaType } = readAttachImage(Number(id))
                    res.statusCode = 200
                    res.setHeader('content-type', mediaType)
                    res.setHeader('cache-control', 'no-store')
                    res.end(bytes)
                },
            }),
        'vscode-bridge: attach image bytes',
    )
}
