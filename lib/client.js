/**
 * Client half of dsh-vscode-bridge.
 *
 * Two entry points share one forwarding route:
 * - `vscode://` anchors rendered by Markdown are caught in the capture phase.
 * - `dsh-resource://file/...` addresses are intercepted inside the sidebar
 *   controller's `openResource` path, before any tab type claims them. The
 *   file's absolute path comes from the address and the session list, so no
 *   sidebar tab ever opens.
 *
 * A type is still registered as a claim marker: plugins such as
 * dsh-better-sidebar only hand a file to the native controller when a
 * non-editor type claims its address first. The marker never renders a body;
 * the interception above consumes the open.
 */
window.__ModuleLoader__.load({
    id: 'dsh-vscode-bridge',
    factory: require => {
        const React = require('react')

        const NS = 'vscodeBridge'
        const OPEN_ROUTE = 'vscode-bridge/open'
        const TAB_KIND = 'vscode-bridge'
        const BUNDLE_CONFIG_KEY = 'dsh-vscode-bridge'
        const STORAGE = {
            hijack: 'dsh-vscode-bridge.hijack',
            combo: 'dsh-vscode-bridge.combo',
            modifiers: 'dsh-vscode-bridge.modifiers',
            attachPoll: 'dsh-vscode-bridge.attachPollMs',
            imageMode: 'dsh-vscode-bridge.imageMode',
        }

        const MODIFIER_KEYS = ['ctrl', 'shift', 'alt', 'meta']
        const storedModifiers = (localStorage.getItem(STORAGE.modifiers) || 'ctrl').split(',').filter(key => MODIFIER_KEYS.includes(key))

        let settings = {
            hijackDshLinks: localStorage.getItem(STORAGE.hijack) === '1',
            onlyWithModifiers: localStorage.getItem(STORAGE.combo) === '1',
            modifiers: storedModifiers.length === 0 ? ['ctrl'] : storedModifiers,
            attachPollMs: Number(localStorage.getItem(STORAGE.attachPoll)) || 2000,
            imageMode: localStorage.getItem(STORAGE.imageMode) || 'link',
        }
        const listeners = new Set()

        function subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        }

        function update(patch) {
            settings = { ...settings, ...patch }
            localStorage.setItem(STORAGE.hijack, settings.hijackDshLinks ? '1' : '0')
            localStorage.setItem(STORAGE.combo, settings.onlyWithModifiers ? '1' : '0')
            localStorage.setItem(STORAGE.modifiers, settings.modifiers.join(','))
            localStorage.setItem(STORAGE.attachPoll, String(settings.attachPollMs))
            localStorage.setItem(STORAGE.imageMode, settings.imageMode)
            for (const listener of listeners) listener()
        }

        function useSettings() {
            return React.useSyncExternalStore(subscribe, () => settings)
        }

        /** Modifier state of the last pointer press, read while a link opens. */
        let press = { ctrl: false, shift: false, alt: false, meta: false, at: 0 }

        function recordPress(event) {
            press = {
                ctrl: event.ctrlKey,
                shift: event.shiftKey,
                alt: event.altKey,
                meta: event.metaKey,
                at: Date.now(),
            }
        }

        function comboHeld() {
            if (settings.modifiers.length === 0) return false
            if (Date.now() - press.at > 2000) return false
            return settings.modifiers.every(key => press[key])
        }

        function canHijack() {
            return settings.hijackDshLinks && (!settings.onlyWithModifiers || comboHeld())
        }

        function forwardVscode(url) {
            return fetch(`${OPEN_ROUTE}?url=${encodeURIComponent(url)}`)
        }

        function vscodeHref(anchor) {
            const href = anchor.getAttribute('href')?.trim()
            return href !== undefined && /^vscode:\/\//i.test(href) ? href : undefined
        }

        /** Encode an absolute path for `vscode://file/...`, keeping slashes and drive colons. */
        function encodePath(path) {
            return path
                .replace(/\\/g, '/')
                .split('/')
                .map(segment => encodeURIComponent(segment).replace(/%3A/gi, ':'))
                .join('/')
        }

        /** Collapse `.` / `..` without losing a drive prefix or a UNC double slash. */
        function normalizePath(path) {
            const unc = path.startsWith('//')
            const prefix = unc ? '//' : path.startsWith('/') ? '/' : ''
            const body = unc ? path.slice(2) : path.replace(/^\/+/, '')
            const segments = []
            for (const segment of body.split('/')) {
                if (segment === '' || segment === '.') continue
                if (segment === '..') {
                    segments.pop()
                    continue
                }
                segments.push(segment)
            }
            return prefix + segments.join('/')
        }

        /**
         * Absolute path of one `dsh-resource://file/...` address.
         *
         * Session addresses resolve their path against the session's stored
         * header cwd, the same base the host builds and reads these addresses
         * with. `absolute` addresses carry the path without the leading slash.
         */
        function absolutePathOf(ctx, address) {
            const parts = new URL(address).pathname.slice(1).split('/').map(decodeURIComponent)
            if (parts[0] === 'absolute') {
                const segments = parts.slice(1)
                const raw = segments.join('/')
                if (segments[0] === '') return `/${raw}`
                if (/^[A-Za-z]:$/.test(segments[0])) return raw
                return `/${raw}`
            }
            const cwd = ctx.sessions.list.getSnapshot().byId[parts[1]].cwd
            const path = parts.slice(2).join('/')
            if (path === '') return cwd
            if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return normalizePath(path)
            return normalizePath(`${cwd.replace(/\\/g, '/')}/${path}`)
        }

        /** Forward one resource address when the switches allow it. */
        function takeOver(ctx, address, options) {
            if (!canHijack()) return false
            if (!address.startsWith('dsh-resource://file/')) return false
            const line = options?.params?.line
            const suffix = line === undefined ? '' : `:${line}`
            void forwardVscode(`vscode://file/${encodePath(absolutePathOf(ctx, address))}${suffix}`)
            return true
        }

        function tabTitle(address) {
            return decodeURIComponent(address.slice(address.lastIndexOf('/') + 1))
        }

        const cardStyle = { display: 'flex', flexDirection: 'column', gap: '8px' }
        const rowStyle = { display: 'flex', alignItems: 'center', gap: '8px' }
        const hintStyle = { margin: 0, fontSize: 12, opacity: 0.7 }
        const keysStyle = { display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 20 }
        const separatorStyle = { borderTop: '1px solid #8884', margin: '4px 0' }

        /** Switches on the bundle's own page in the Plugins panel. */
        function SettingsCard({ t, view }) {
            const current = useSettings()
            if (view === 'summary') return t(current.hijackDshLinks ? 'summaryOn' : 'summaryOff')
            const rows = [
                React.createElement(
                    'label',
                    { key: 'master', style: rowStyle },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: current.hijackDshLinks,
                        onChange: event => update({ hijackDshLinks: event.target.checked }),
                    }),
                    t('hijack'),
                ),
                React.createElement('p', { key: 'hint', style: hintStyle }, t('hijackHint')),
            ]
            if (current.hijackDshLinks) {
                rows.push(
                    React.createElement(
                        'label',
                        { key: 'combo', style: rowStyle },
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: current.onlyWithModifiers,
                            onChange: event => update({ onlyWithModifiers: event.target.checked }),
                        }),
                        t('onlyWithModifiers'),
                    ),
                )
                rows.push(React.createElement('p', { key: 'comboHint', style: hintStyle }, t('onlyWithModifiersHint')))
                if (current.onlyWithModifiers) {
                    rows.push(
                        React.createElement(
                            'div',
                            { key: 'keys', style: keysStyle },
                            React.createElement('span', null, t('modifiers')),
                            MODIFIER_KEYS.map(key =>
                                React.createElement(
                                    'label',
                                    { key, style: rowStyle },
                                    React.createElement('input', {
                                        type: 'checkbox',
                                        checked: current.modifiers.includes(key),
                                        disabled: current.modifiers.length === 1 && current.modifiers[0] === key,
                                        onChange: event =>
                                            update({
                                                modifiers: event.target.checked
                                                    ? [...current.modifiers, key]
                                                    : current.modifiers.filter(item => item !== key),
                                            }),
                                    }),
                                    t(key),
                                ),
                            ),
                        ),
                    )
                    rows.push(
                        React.createElement(
                            'p',
                            { key: 'comboState', style: hintStyle },
                            t('activeCombo', { keys: current.modifiers.map(key => t(key)).join(' + ') }),
                        ),
                    )
                }
            }
            rows.push(React.createElement('div', { key: 'attach-sep', style: separatorStyle }))
            rows.push(React.createElement('p', { key: 'attach-hint', style: hintStyle }, t('attachHint')))
            rows.push(
                React.createElement(
                    'label',
                    { key: 'attach-poll', style: rowStyle },
                    t('attachPoll'),
                    React.createElement('input', {
                        type: 'number',
                        min: 200,
                        step: 100,
                        value: current.attachPollMs,
                        onChange: event => update({ attachPollMs: Math.max(200, Number(event.target.value)) }),
                        style: { width: 96 },
                    }),
                ),
            )
            rows.push(
                React.createElement(
                    'label',
                    { key: 'attach-image', style: rowStyle },
                    t('attachImageMode'),
                    React.createElement(
                        'select',
                        {
                            value: current.imageMode,
                            onChange: event => update({ imageMode: event.target.value }),
                        },
                        React.createElement('option', { value: 'link' }, t('attachImageLink')),
                        React.createElement('option', { value: 'attachment' }, t('attachImageAttachment')),
                    ),
                ),
            )
            return React.createElement('div', { style: cardStyle }, rows)
        }

        /** Polls the attach queue and inserts its rows into this composer. */
        function makeAttachPoller(ctx) {
            return function AttachPoller({ inputActions, sessionId }) {
                const current = useSettings()
                const markerRef = React.useRef(null)
                const retryRef = React.useRef([])

                React.useEffect(() => {
                    let disposed = false

                    const pasteImage = async item => {
                        const response = await fetch(`vscode-bridge/attach/image?id=${item.id}`)
                        const blob = await response.blob()
                        const name = item.content.split(/[\\/]/).pop()
                        const file = new File([blob], name, { type: blob.type })
                        const data = new DataTransfer()
                        data.items.add(file)
                        let node = markerRef.current
                        let editor = null
                        for (let depth = 0; depth < 8 && node !== null; depth += 1) {
                            editor = node.querySelector('[contenteditable="true"]')
                            if (editor !== null) break
                            node = node.parentElement
                        }
                        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
                    }

                    const insertItem = item => {
                        if (/^https?:\/\//i.test(item.content)) {
                            return inputActions.insertText(item.content, inputActions.captureInsertion())
                        }
                        const match = item.content.match(/^(.*):(\d+)(?:-(\d+))?$/u)
                        const path = match === null ? item.content : match[1]
                        const lineRange = match === null ? undefined : match[3] === undefined ? match[2] : `${match[2]}-${match[3]}`
                        const mention = /\s/u.test(path) ? `@"${path}"` : `@${path}`
                        const name = path.split(/[\\/]/).pop()
                        const actx = ctx.sessions.scope(sessionId)
                        const span = inputActions.captureInsertion()
                        return (
                            actx.bail(actx, 'slash/input-insert-reference', {
                                reference: {
                                    source: 'reference',
                                    ref: mention,
                                    label: lineRange === undefined ? name : `${name}:${lineRange}`,
                                    appearance: 'file',
                                    clipboardText: mention,
                                },
                                span,
                            }) === true
                        )
                    }

                    const tick = async () => {
                        const response = await fetch('vscode-bridge/attach/pending')
                        const { items } = await response.json()
                        if (disposed) return
                        const queue = [...retryRef.current.splice(0), ...items]
                        for (let index = 0; index < queue.length; index += 1) {
                            const item = queue[index]
                            if (item.kind === 'image' && current.imageMode === 'attachment') {
                                await pasteImage(item)
                                continue
                            }
                            if (!insertItem(item)) {
                                retryRef.current.push(...queue.slice(index))
                                break
                            }
                        }
                    }

                    const timer = setInterval(tick, current.attachPollMs)
                    return () => {
                        disposed = true
                        clearInterval(timer)
                    }
                }, [current.attachPollMs, current.imageMode, inputActions, sessionId])

                return React.createElement('span', { ref: markerRef, hidden: true })
            }
        }

        const EN = {
            summaryOn: 'Hijacking DSH links to VS Code',
            summaryOff: 'DSH links open in the sidebar',
            hijack: 'Hijack all DSH links to VS Code',
            hijackHint: 'Open dsh-resource links in VS Code without opening the sidebar.',
            onlyWithModifiers: 'Only when modifier keys are held',
            onlyWithModifiersHint: 'Only clicks that hold every selected key are hijacked.',
            modifiers: 'Modifier keys',
            activeCombo: 'Active combo: {keys}',
            attachHint: 'Rows queued from outside are inserted into this conversation\u2019s composer.',
            attachPoll: 'Poll interval (ms)',
            attachImageMode: 'Image paths',
            attachImageLink: 'As link',
            attachImageAttachment: 'As attachment',
            ctrl: 'Ctrl',
            shift: 'Shift',
            alt: 'Alt',
            meta: 'Meta',
        }
        const ZH = {
            summaryOn: '已把 DSH 内链劫持到 VS Code',
            summaryOff: 'DSH 内链仍在侧栏打开',
            hijack: '劫持所有 DSH 内链到 VS Code',
            hijackHint: '把 dsh-resource 链接直接在 VS Code 打开，不再展开侧栏。',
            onlyWithModifiers: '仅在按下组合键时劫持',
            onlyWithModifiersHint: '只有按住所有勾选按键的点击才会被劫持。',
            modifiers: '组合键',
            activeCombo: '当前组合键：{keys}',
            attachHint: '从外部写入队列的行会插入当前对话的输入框。',
            attachPoll: '轮询间隔（毫秒）',
            attachImageMode: '图片路径',
            attachImageLink: '作为链接',
            attachImageAttachment: '作为附件',
            ctrl: 'Ctrl',
            shift: 'Shift',
            alt: 'Alt',
            meta: 'Meta',
        }

        return {
            inject: ['slots', 'locale', 'sessions', 'sidebarRightTabs'],
            apply(ctx) {
                ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'vscode-bridge: dictionaries')

                ctx.effect(() => {
                    document.addEventListener('pointerdown', recordPress, true)
                    document.addEventListener('mousedown', recordPress, true)
                    document.addEventListener('click', recordPress, true)
                    return () => {
                        document.removeEventListener('pointerdown', recordPress, true)
                        document.removeEventListener('mousedown', recordPress, true)
                        document.removeEventListener('click', recordPress, true)
                    }
                }, 'vscode-bridge: modifier capture')

                // Claim marker only: when a file opens, another plugin (for
                // example dsh-better-sidebar) routes it to the native
                // controller only if a non-editor type names the address. The
                // controller patch below consumes that open.
                ctx.effect(
                    () =>
                        ctx.sidebarRightTabs.register({
                            id: TAB_KIND,
                            kind: TAB_KIND,
                            patterns: ['dsh-resource://file/session/**'],
                            title: tabTitle,
                            canOpen: canHijack,
                        }),
                    'vscode-bridge: dsh-resource claim marker',
                )

                ctx.effect(() => {
                    const sidebar = ctx.get('sidebarRight')
                    const openResource = sidebar.openResource
                    const openResourceIn = sidebar.openResourceIn
                    sidebar.openResource = function (address, options) {
                        if (takeOver(ctx, address, options)) return
                        return openResource.call(this, address, options)
                    }
                    sidebar.openResourceIn = function (sessionId, address, options) {
                        if (takeOver(ctx, address, options)) return
                        return openResourceIn.call(this, sessionId, address, options)
                    }
                    return () => {
                        sidebar.openResource = openResource
                        sidebar.openResourceIn = openResourceIn
                    }
                }, 'vscode-bridge: dsh-resource interception')

                ctx.slots.inject('plugins.bundle.config', () =>
                    ctx.slots.register(
                        {
                            name: 'plugins.bundle.config',
                            key: BUNDLE_CONFIG_KEY,
                            locale: NS,
                        },
                        SettingsCard,
                    ),
                )

                // `input.dock` renders in both the hero (a blank new Session) and
                // the active composer, while `composer.dock` is skipped entirely
                // in the hero. A new conversation therefore needs this slot to
                // poll the attach queue before its first message exists.
                ctx.slots.inject('conversation.input.dock', () =>
                    ctx.slots.register(
                        {
                            name: 'conversation.input.dock',
                            id: 'vscode-bridge-attach',
                        },
                        makeAttachPoller(ctx),
                    ),
                )

                ctx.effect(() => {
                    const onClick = event => {
                        if (
                            event.defaultPrevented ||
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                        ) {
                            return
                        }
                        const target = event.target
                        if (!(target instanceof Element)) return
                        const anchor = target.closest('a[href]')
                        if (anchor === null) return
                        const url = vscodeHref(anchor)
                        if (url === undefined) return
                        event.preventDefault()
                        event.stopImmediatePropagation()
                        void forwardVscode(url)
                    }
                    document.addEventListener('click', onClick, true)
                    return () => {
                        document.removeEventListener('click', onClick, true)
                    }
                }, 'vscode-bridge: vscode:// anchors')
            },
        }
    },
})
