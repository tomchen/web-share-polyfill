/**
 * web-share-polyfill: the Web Share API everywhere.
 *
 * Uses the browser's own share sheet when there is one, and a small, native-looking
 * share sheet (rendered in a shadow root) when there isn't. `web-share-polyfill/legacy` adds fallbacks for
 * browsers without Shadow DOM or `<dialog>`.
 */
import CSS from './style.js'

/** Data accepted by `share()`, same shape as `navigator.share()`. */
export interface ShareData {
  title?: string
  text?: string
  url?: string
  files?: File[]
}

/** Normalized data handed to targets. Missing fields are empty strings; `url` is absolute. */
export interface ShareInput {
  title: string
  text: string
  url: string
  /** The files to share; empty when there are none. */
  files: File[]
}

export type StringKey =
  'share' | 'close' | 'copy' | 'copyLink' | 'copied' | 'qr' | 'email' | 'sms' | 'print' | 'more' | 'back'

export type Strings = Record<StringKey, string>

/** Controller passed to a target's `run()`. */
export interface Sheet {
  /** The tile or row that was clicked. */
  item: HTMLElement
  /** Resolved UI strings. */
  strings: Strings
  /** The target's resolved label. */
  label: string
  /** Mark the share as done. The share promise resolves with `value` (default: the target id) when the sheet closes. */
  ok(value?: string | Promise<string>): void
  /** Close the sheet. */
  close(): void
  /** Replace the sheet body with a sub-view that has a back button and a title. */
  view(title: string, content: Node): void
}

/** A share destination shown in the sheet. */
export interface ShareTarget {
  /** Unique id, returned by `share()` when the target is used. */
  id: string
  /** Label. A function receives the data and the UI strings. */
  name: string | ((data: ShareInput, strings: Strings) => string)
  /** Localized labels by locale code, e.g. `{ zh: '微博' }`. */
  names?: Record<string, string>
  /** SVG path data. */
  icon: string
  /** Size of the icon's square viewBox. Default 24. */
  box?: number
  /** Draw the icon as a 2px stroke instead of a fill. */
  stroke?: boolean
  /** Brand color. Targets with a color are shown as apps, others as actions. */
  color?: string
  /** Link to open. Return an empty value to hide the target for this data. */
  url?(data: ShareInput): string | false | undefined | null
  /** Custom action, used when there is no `url`. */
  run?(data: ShareInput, sheet: Sheet): unknown
  /** Show the target only when this returns a truthy value. */
  when?(data: ShareInput): unknown
  /**
   * The target can share these files (the sheet shows it for them, and `canShare()` says yes).
   * Other targets only show up when there is also a title, text or link to share.
   */
  files?(files: File[]): unknown
}

export interface Options {
  /**
   * Targets in display order. Or lists by viewer language, with `'*'` for everyone else:
   * `{ '*': [copy, x], zh: [copy, wechat], ja: [copy, line] }`.
   */
  targets?: ShareTarget[] | Record<string, ShareTarget[]>
  /** Extra locales (see `web-share-polyfill/locales`). English is always included. */
  locales?: string[]
  /** Language(s) to use instead of the viewer's browser languages. */
  lang?: string | readonly string[]
  /** Locale code to use when none of the viewer's languages is available. Default: `en`. */
  fallback?: string
  /**
   * Override UI strings: `{ copied: 'Done!' }` for every language, or by the sheet's language, with `'*'`
   * for all of them: `{ '*': { share: 'Send' }, zh: { copied: '好了' } }`.
   */
  strings?: Partial<Strings> | Record<string, Partial<Strings>>
  /** Color scheme. Default: follows the system. */
  theme?: 'light' | 'dark'
  /** Visual style. Default: `apple` on Apple platforms, `material` elsewhere. */
  look?: 'apple' | 'material'
  /** Try the browser's native share sheet first. Default: true. */
  native?: boolean
}

const KEYS: StringKey[] = [
  'share',
  'close',
  'copy',
  'copyLink',
  'copied',
  'qr',
  'email',
  'sms',
  'print',
  'more',
  'back',
]

/** English strings (always bundled). */
export const en = 'en|Share|Close|Copy|Copy link|Copied|QR code|Email|SMS|Print|More|Back'

const ALIAS: Record<string, string> = { no: 'nb', nn: 'nb', tl: 'fil', iw: 'he', in: 'id', ji: 'yi' }

const nav: Navigator = typeof navigator < 'u' ? navigator : ({} as Navigator)
const MARK = Symbol.for('web-share-polyfill')
const current = nav.share as (Navigator['share'] & { [MARK]?: Navigator['share'] }) | undefined

/** The browser's own `navigator.share`, if any (captured before polyfilling). */
export const nativeShare: Navigator['share'] | undefined =
  current && (MARK in current ? current[MARK] : current.bind(nav))
const nativeCanShare = (current && MARK in current ? (current as any).c : nav.canShare?.bind(nav)) as
  Navigator['canShare'] | undefined

/** The viewer's preferred languages. */
export const languages = (lang?: string | readonly string[]): readonly string[] =>
  lang ? ([] as string[]).concat(lang) : nav.languages?.length ? nav.languages : [nav.language || 'en']

/** Return the first key of `available` that matches the language list, e.g. `zh-TW` → `zh-hant`, `pt-BR` → `pt`. */
export const match = (available: object, langs: readonly string[]): string | undefined => {
  for (let l of langs) {
    l = l.toLowerCase()
    if (/^zh-(hant|tw|hk|mo)/.test(l)) l = 'zh-hant'
    const base = l.split('-')[0]
    for (const c of [l, base, ALIAS[base]]) if (c && c in available) return c
  }
}

/**
 * Validate and normalize share data. Throws a TypeError like `navigator.share()` when there is nothing
 * to share or the link can't be parsed. Unlike it, any link scheme is fine (mailto:, tel:, app links…).
 */
const input = (data?: ShareData | null): ShareInput => {
  const { title, text, url, files } = data || {}
  if (title == null && text == null && url == null && !files?.length) throw new TypeError('Nothing to share')
  return {
    title: title == null ? '' : '' + title,
    text: text == null ? '' : '' + text,
    url: url == null ? '' : new URL(url, document.baseURI).href,
    files: files ? [...files] : [],
  }
}

/**
 * The target list for the viewer's language (or `lang`): the first one only, since a viewer who prefers
 * English, then Chinese, uses the apps of English speakers ('*'), not WeChat.
 */
const listFor = (o: Options = {}): ShareTarget[] => {
  const list = o.targets || []
  return Array.isArray(list) ? list : list[match(list, languages(o.lang).slice(0, 1)) || '*'] || []
}

/** Whether the sheet has a target for these files. */
const sheetTakes = (files: File[], o?: Options) => listFor(o).some((g) => g.files?.(files))

/**
 * Polyfill for `navigator.canShare()`. Files: when the native API takes them, or when one of the targets
 * in `o` does (`save`, `copy`…); `navigator.canShare()` installed by `polyfill(o)` checks its options.
 */
export const canShare = (data?: ShareData, o?: Options): boolean => {
  try {
    const { files } = input(data)
    return !files.length || !!nativeCanShare?.(data) || sheetTakes(files, o)
  } catch {
    return false
  }
}

let D: Document
const NS = 'http://www.w3.org/2000/svg'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: Node, text?: string) => {
  const e = D.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  parent?.appendChild(e)
  return e
}

const attrs = (e: Element, a: Record<string, string>) => {
  for (const k in a) e.setAttribute(k, a[k])
}

/** Create an `<svg>` with one path. */
export const icon = (d: string, stroke?: boolean, box = 24): SVGSVGElement => {
  D = document
  const s = D.createElementNS(NS, 'svg')
  const p = D.createElementNS(NS, 'path')
  attrs(s, { viewBox: `0 0 ${box} ${box}`, 'aria-hidden': 'true' })
  if (stroke) s.setAttribute('class', 's')
  p.setAttribute('d', d)
  s.appendChild(p)
  return s
}

const CLOSE = 'M6 6l12 12M18 6 6 18'
const BACK = 'M15 5l-7 7 7 7'

/** Black or white, whichever reads better on `color`. */
const onColor = (color: string): string => {
  let h = color.slice(1)
  if (h.length < 6) h = h.replace(/./g, '$&$&')
  const n = parseInt(h, 16)
  return (n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 186 ? '#000' : '#fff'
}

/** Where the sheet is built and how it is shown. */
export interface Surface {
  /** The `<web-share-polyfill>` element put in the page. */
  host: HTMLElement
  /** Where the sheet's `<dialog>` goes. */
  root: ParentNode
  /** Put the host in the page and show `dlg` as a modal with `focus` focused. `cancel` dismisses the sheet. */
  open(dlg: HTMLDialogElement, focus: HTMLElement, cancel: () => void): void
  /** Close `dlg`, firing its `close` event. */
  close(dlg: HTMLDialogElement): void
  /** Take the host out of the page. */
  remove(): void
}

let sheet: CSSStyleSheet | undefined

/**
 * @internal The default surface: a shadow root and a modal `<dialog>`. `web-share-polyfill/legacy` replaces
 * it with one that also works without them.
 */
export const hooks = {
  surface(css: string, _title: string): Surface {
    const host = D.createElement('web-share-polyfill')
    const root = host.attachShadow({ mode: 'open' })
    try {
      if (!sheet) (sheet = new CSSStyleSheet()).replaceSync(css)
      root.adoptedStyleSheets = [sheet]
    } catch {
      el('style', '', root, css)
    }
    return {
      host,
      root,
      open(dlg, focus) {
        ;(D.body || D.documentElement).appendChild(host)
        dlg.showModal()
        focus.focus()
      },
      close: (dlg) => dlg.close(),
      remove: () => host.remove(),
    }
  },
}

let busy = 0

/** Show the share sheet. Resolves with the id of the chosen target, rejects with an AbortError when dismissed. */
const showSheet = (d: ShareInput, o: Options = {}, noMore?: 1): Promise<string> => {
  if (busy) return Promise.reject(new DOMException('Share in progress', 'InvalidStateError'))
  D = document

  // Language and strings
  const locales: Record<string, string> = { en }
  o.locales?.forEach((l) => (locales[l.slice(0, l.indexOf('|'))] = l))
  const langs = languages(o.lang)
  const code = match(locales, langs) || match(locales, [o.fallback || 'en']) || 'en'
  const parts = locales[code].split('|')
  const base = en.split('|')
  const t = {} as Strings
  // Overrides: one set, or sets by language (keys are locale codes, not string names)
  const ss = (o.strings || {}) as Record<string, any>
  const own: Partial<Strings> = KEYS.some((k) => k in ss) ? ss : { ...ss['*'], ...ss[match(ss, [code])!] }
  KEYS.forEach((k, i) => (t[k] = own[k] ?? (parts[i + 1] || base[i + 1])))

  // Platform look
  const apple = /mac|iphone|ipad|ipod/i.test((nav as any).userAgentData?.platform || nav.platform || '')
  const look = o.look ?? (apple ? 'apple' : 'material')

  const view = hooks.surface(CSS, t.share)
  const dlg = el(
    'dialog',
    (look == 'apple' ? 'a' : 'm') + (o.theme ? (o.theme == 'dark' ? ' dk' : ' lt') : ''),
    view.root,
  )
  attrs(dlg, {
    part: 'sheet',
    'aria-label': t.share,
    lang: code,
    dir: /^(ar|he|fa|ur|ps|sd|ug|yi|ckb|dv)\b/.test(code) ? 'rtl' : 'ltr',
  })
  const wrap = el('div', 'w', dlg)
  wrap.tabIndex = -1
  el('i', 'h', wrap)

  // Header: site icon, title, address, close button
  let hostname = ''
  let favicon = ''
  try {
    const u = new URL(d.url)
    if (u.origin != 'null') {
      hostname = u.host
      favicon =
        (u.origin == location.origin && (D.querySelector('link[rel~=icon]') as HTMLLinkElement)?.href) ||
        u.origin + '/favicon.ico'
    }
  } catch {}
  // Sharing one image: its thumbnail instead of the site icon
  const image = d.files.length == 1 && /^image\//.test(d.files[0].type)
  if (image) favicon = URL.createObjectURL(d.files[0])
  const head = el('header', '', wrap)
  const first = d.title || d.text || hostname || d.files.map((f) => f.name).join(', ')
  const fav = el('span', 'f', head, (hostname || first || '?')[0].toUpperCase())
  if (favicon) {
    const img = el('img', image ? 'th' : '', fav)
    img.alt = ''
    img.onerror = () => img.remove()
    img.src = favicon
  }
  const info = el('div', 't', head)
  el('b', '', info, first)
  el('span', '', info, d.url ? d.url.replace(/^https?:\/\/(www\.)?/, '') : d.title && d.text)
  const x = el('button', 'x', head)
  attrs(x, { part: 'close', 'aria-label': t.close })
  x.appendChild(icon(CLOSE, true))

  const body = el('div', 'b', wrap)
  // With files, the targets that take them; the others need a title, text or link to share
  const hasText = d.title || d.text || d.url
  const targets = listFor(o).filter(
    (g) =>
      (!noMore || g.id != 'more') &&
      ((d.files.length && g.files?.(d.files)) || (hasText && (!g.when || g.when(d)) && (!g.url || g.url(d)))),
  )
  const label = (g: ShareTarget) => (typeof g.name == 'function' ? g.name(d, t) : (g.names && g.names[code]) || g.name)

  const render = () => {
    body.textContent = ''
    const apps = el('div', 'p', body)
    const acts = el('div', 'q', body)
    targets.forEach((g, i) => {
      const href = g.url?.(d)
      const it = el(href ? 'a' : 'button', 'i', g.color ? apps : acts)
      attrs(it, { part: 'target', 'data-i': '' + i, 'data-id': g.id })
      if (href) {
        ;(it as HTMLAnchorElement).href = href
        if (/^https?:/.test(href)) attrs(it, { target: '_blank', rel: 'noopener noreferrer' })
      }
      const c = el('span', 'c', it)
      c.setAttribute('part', 'icon')
      if (g.color) {
        c.style.setProperty('--c', g.color)
        c.style.setProperty('--g', onColor(g.color))
      }
      c.appendChild(icon(g.icon, g.stroke, g.box))
      el('span', 'l', it, label(g)).setAttribute('part', 'label')
    })
  }
  render()

  // Closing
  let result: string | Promise<string> | undefined
  let closing = 0
  const close = () => {
    if (!closing++) {
      dlg.classList.add('z')
      setTimeout(() => view.close(dlg), 150)
    }
  }

  busy = 1
  return new Promise<string>((resolve, reject) => {
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault()
      close()
    })
    const done = () => {
      closing = 1
      if (image) URL.revokeObjectURL(favicon)
      view.remove()
      busy = 0
    }
    dlg.addEventListener('close', () => {
      done()
      result ? resolve(result) : reject(new DOMException('Share canceled', 'AbortError'))
    })
    dlg.addEventListener('click', (e) => {
      // Nothing more once closing (the sheet fades out for a moment)
      if (closing) return
      const target = e.target as Element
      // A click on the dialog box itself is a click on the backdrop
      if (target == dlg || target.closest('.x')) return close()
      if (target.closest('.k')) {
        render()
        wrap.focus()
        return
      }
      const it = target.closest('[data-i]') as HTMLElement | null
      if (!it) return
      const g = targets[+it.dataset.i!]
      if (g.url) {
        // Let the link open, then close
        result = g.id
        setTimeout(close)
      } else {
        g.run?.(d, {
          item: it,
          strings: t,
          label: label(g),
          ok: (v) => (result = v ?? g.id),
          close,
          view(title, content) {
            if (closing) return
            body.textContent = ''
            const v = el('div', 'v', body)
            const bar = el('div', 'vh', v)
            const back = el('button', 'k', bar)
            back.setAttribute('aria-label', t.back)
            back.appendChild(icon(BACK, true))
            el('b', '', bar, title)
            v.appendChild(content)
            back.focus()
          },
        })
      }
    })

    try {
      // Focus the sheet itself, like native sheets, rather than its first button
      view.open(dlg, wrap, close)
    } catch (e) {
      // E.g. no <dialog> support without web-share-polyfill/legacy: don't stay busy
      done()
      reject(e)
    }
  })
}

/**
 * Share data. Uses the native share sheet when available (unless `native: false`),
 * and the built-in sheet otherwise, or when the native one is not allowed (e.g. in an iframe).
 * Resolves with the id of the target used (`'native'` for the browser's own sheet).
 */
export const share = async (data?: ShareData, o: Options = {}): Promise<string> => {
  const d = input(data)
  if (o.native != false && nativeShare) {
    // The native sheet refuses some shares that the polyfill's takes: links other than http(s)
    // (TypeError), calls without a click or from an iframe without permission (NotAllowedError)
    if (nativeCanShare?.(data) != false) {
      try {
        await nativeShare(data!)
        return 'native'
      } catch (e) {
        if (!/^(NotAllowed|Type)Error$/.test((e as Error).name)) throw e
      }
    }
  }
  // Files, with no target for them: nothing to show, like the native API without file support
  if (d.files.length && !sheetTakes(d.files, o)) throw new TypeError('Files not supported')
  // After a refusal, don't offer the native sheet again from the polyfill's
  return showSheet(d, o, nativeShare && o.native != false ? 1 : undefined)
}

/**
 * Install `navigator.share()` and `navigator.canShare()`. Native support is kept and used first;
 * the sheet covers browsers without it and contexts where it is not allowed.
 * Call again to change the options.
 */
export const polyfill = (o?: Options): void => {
  if (!nav.userAgent) return
  const fn = (data?: ShareData) => share(data, o).then(() => {})
  const can = (data?: ShareData) => canShare(data, o)
  ;(fn as any)[MARK] = nativeShare
  ;(fn as any).c = nativeCanShare
  for (const [k, v] of [
    ['share', fn],
    ['canShare', can],
  ] as const) {
    Object.defineProperty(nav, k, { value: v, configurable: true, writable: true })
  }
}
