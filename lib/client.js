/**
 * Client half of dsh-vscode-bridge.
 *
 * Markdown renders `vscode://` targets as plain anchors, and the desktop shell
 * cancels that navigation. Catch plain left clicks in the capture phase and
 * ask the Host half to open the link.
 */
window.__ModuleLoader__.load({
    id: 'dsh-vscode-bridge',
    factory: () => {
        const OPEN_ROUTE = 'vscode-bridge/open'

        /** The anchor's vscode:// target, if it has one. */
        function vscodeHref(anchor) {
            const href = anchor.getAttribute('href')?.trim()
            return href !== undefined && /^vscode:\/\//i.test(href) ? href : undefined
        }

        /** Hand one URL to the Host route. */
        async function forward(url) {
            try {
                await fetch(`${OPEN_ROUTE}?url=${encodeURIComponent(url)}`)
            } catch (error) {
                console.warn(`[vscode-bridge] open failed for ${url}`, error)
            }
        }

        return {
            inject: [],
            apply(ctx) {
                ctx.effect(() => {
                    const onClick = event => {
                        if (
                            event.defaultPrevented ||
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                        )
                            return
                        const target = event.target
                        if (!(target instanceof Element)) return
                        const anchor = target.closest('a[href]')
                        if (anchor === null) return
                        const url = vscodeHref(anchor)
                        if (url === undefined) return
                        event.preventDefault()
                        event.stopImmediatePropagation()
                        void forward(url)
                    }
                    document.addEventListener('click', onClick, true)
                    return () => {
                        document.removeEventListener('click', onClick, true)
                    }
                })
            },
        }
    },
})
