import { forwardVscodeLink } from './open-link.js'

/** Cordis function-plugin name. */
export const name = 'vscode-bridge'

/** The route carrier and the connection trust fence. */
export const inject = ['webServer', 'connection']

const OPEN_PATH = '/vscode-bridge/open'

/** The vscode:// link carried by one request, or undefined. */
function linkOf(req) {
    const url = new URL(req.url ?? '/', 'http://localhost').searchParams.get('url')?.trim()
    return url !== undefined && url.toLowerCase().startsWith('vscode://') ? url : undefined
}

export function apply(ctx) {
    ctx.effect(
        () =>
            ctx.webServer.register({
                kind: 'exact',
                path: OPEN_PATH,
                handler: async (req, res) => {
                    // The port is reachable from any local page; this one call is
                    // the Host/Origin + login fence, not a protocol check.
                    const rejection = ctx.connection.requestRejection(req)
                    if (rejection !== undefined) {
                        res.statusCode = rejection
                        res.end()
                        return
                    }
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
}
