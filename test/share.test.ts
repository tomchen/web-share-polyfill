// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Core = typeof import('../src/index.js')
type Targets = typeof import('../src/targets.js')

/** Load a fresh copy of the library, optionally with a native navigator.share in place. */
const load = async (
  native?: (data: ShareData) => Promise<void>,
  nativeCanShare: (data?: ShareData) => boolean = () => true,
): Promise<Core & { T: Targets }> => {
  vi.resetModules()
  Object.defineProperty(navigator, 'share', { value: native, configurable: true, writable: true })
  Object.defineProperty(navigator, 'canShare', {
    value: native ? nativeCanShare : undefined,
    configurable: true,
    writable: true,
  })
  const core = await import('../src/index.js')
  const T = await import('../src/targets.js')
  return { ...core, T }
}

const sheet = () => document.querySelector('web-share-polyfill')?.shadowRoot
const dialog = () => sheet()?.querySelector('dialog') as HTMLDialogElement | undefined
const items = () => [...(sheet()?.querySelectorAll('[data-id]') ?? [])] as HTMLElement[]
const click = (id: string) => (sheet()!.querySelector(`[data-id="${id}"]`) as HTMLElement).click()
const flush = () => new Promise((r) => setTimeout(r, 200))

beforeEach(() => {
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true })
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('canShare', () => {
  it('validates data like the native API', async () => {
    const { canShare } = await load()
    expect(canShare()).toBe(false)
    expect(canShare({})).toBe(false)
    expect(canShare({ url: 'https://example.com' })).toBe(true)
    expect(canShare({ text: 'hi' })).toBe(true)
    expect(canShare({ url: 'http://[bad' })).toBe(false)
    // Any link scheme, unlike the native API (http and https only)
    for (const url of ['mailto:a@example.com', 'tel:+15555550100', 'myapp://open/1', '/relative?q=1']) {
      expect(canShare({ url }), url).toBe(true)
    }
    expect(canShare({ files: [new File(['x'], 'x.txt')] })).toBe(false)
  })
})

describe('share', () => {
  it('uses the native share sheet when there is one', async () => {
    const native = vi.fn(() => Promise.resolve())
    const { share, T } = await load(native)
    await expect(share({ url: 'https://example.com' }, { targets: [T.x] })).resolves.toBe('native')
    expect(native).toHaveBeenCalledOnce()
    expect(sheet()).toBeUndefined()
  })

  it('passes native AbortError through', async () => {
    const { share } = await load(() => Promise.reject(new DOMException('no', 'AbortError')))
    await expect(share({ url: 'https://example.com' })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('falls back to the sheet when native sharing is not allowed, without offering "more"', async () => {
    const { share, T } = await load(() => Promise.reject(new DOMException('no', 'NotAllowedError')))
    const p = share({ url: 'https://example.com' }, { targets: [T.copy, T.x, T.more] })
    await vi.waitFor(() => expect(dialog()?.open).toBe(true))
    expect(items().map((i) => i.dataset.id)).toEqual(['x', 'copy'])
    click('x')
    await expect(p).resolves.toBe('x')
  })

  it('shows the sheet without native support, and rejects with AbortError when dismissed', async () => {
    const { share, T } = await load()
    const p = share({ title: 'Hello', url: '/page?a=1' }, { targets: [T.x, T.copy, T.more] })
    expect(dialog()?.open).toBe(true)
    // "more" needs the native API; relative URLs resolve against the document
    expect(items().map((i) => i.dataset.id)).toEqual(['x', 'copy'])
    const link = sheet()!.querySelector('[data-id="x"]') as HTMLAnchorElement
    expect(link.href).toBe(
      'https://x.com/intent/post?text=Hello&url=' + encodeURIComponent(new URL('/page?a=1', location.href).href),
    )
    expect(link.target).toBe('_blank')
    ;(sheet()!.querySelector('.x') as HTMLElement).click()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(sheet()).toBeUndefined()
  })

  it('uses the sheet for data the native API refuses, like a mailto: link', async () => {
    const native = vi.fn(() => Promise.resolve())
    const { share, T } = await load(native, (d) => !d?.url || /^https?:/.test(d.url))
    const p = share({ url: 'mailto:someone@example.com' }, { targets: [T.x, T.more] })
    expect(native).not.toHaveBeenCalled()
    // No "more": the native sheet can't take it either
    expect(items().map((i) => i.dataset.id)).toEqual(['x'])
    click('x')
    await expect(p).resolves.toBe('x')
  })

  it('uses the sheet when the native API throws a TypeError', async () => {
    const { share, T } = await load(() => Promise.reject(new TypeError('Unsupported')))
    const p = share({ url: 'https://example.com' }, { targets: [T.x] })
    await vi.waitFor(() => expect(dialog()?.open).toBe(true))
    click('x')
    await expect(p).resolves.toBe('x')
  })

  it('offers "more" in sheet mode when native sharing exists', async () => {
    const native = vi.fn(() => Promise.resolve())
    const { share, T } = await load(native)
    const p = share({ url: 'https://example.com', title: 'T' }, { native: false, targets: [T.more] })
    click('more')
    await expect(p).resolves.toBe('native')
    expect(native).toHaveBeenCalledWith({ url: 'https://example.com/', title: 'T' })
  })

  it('picks the target list for the viewer language, with "*" for the rest', async () => {
    const { share, T } = await load()
    const targets = { '*': [T.x], zh: [T.weibo], 'zh-hant': [T.line] }
    for (const [lang, id] of [
      ['zh-CN', 'weibo'],
      ['zh-TW', 'line'],
      ['fr', 'x'],
      [undefined, 'x'], // the viewer is en-US
    ] as const) {
      const p = share({ url: 'https://example.com' }, { lang, targets })
      expect(items().map((i) => i.dataset.id)).toEqual([id])
      click(id)
      await expect(p).resolves.toBe(id)
      await flush()
    }
  })

  it('rejects a second share while one is open', async () => {
    const { share, T } = await load()
    const first = share({ url: 'https://example.com' }, { targets: [T.x] })
    await expect(share({ url: 'https://example.com' })).rejects.toMatchObject({ name: 'InvalidStateError' })
    click('x')
    await expect(first).resolves.toBe('x')
  })

  it('rejects invalid data and files without native support', async () => {
    const { share } = await load()
    await expect(share({})).rejects.toBeInstanceOf(TypeError)
    await expect(share({ files: [new File(['x'], 'x.txt')] })).rejects.toBeInstanceOf(TypeError)
  })

  it('hides targets that do not apply to the data', async () => {
    const { share, T } = await load()
    const p = share({ text: 'just text' }, { targets: [T.facebook, T.whatsapp, T.qr, T.copy] })
    expect(items().map((i) => i.dataset.id)).toEqual(['whatsapp', 'qr', 'copy'])
    expect(sheet()!.querySelector('[data-id="copy"] .l')!.textContent).toBe('Copy')
    click('whatsapp')
    await p
  })

  it('copies the link and reports "copied"', async () => {
    const { share, T } = await load()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const p = share({ title: 'T', url: 'https://example.com/a' }, { targets: [T.copy] })
    expect(sheet()!.querySelector('[data-id="copy"] .l')!.textContent).toBe('Copy link')
    click('copy')
    await vi.waitFor(() => expect(sheet()!.querySelector('[data-id="copy"] .l')!.textContent).toBe('Copied'))
    expect(writeText).toHaveBeenCalledWith('https://example.com/a')
    await expect(p).resolves.toBe('copy')
  })

  it('shows a QR code sub-view', async () => {
    const { share, T } = await load()
    const p = share({ url: 'https://example.com' }, { targets: [T.qr] })
    click('qr')
    const svg = sheet()!.querySelector('svg.qr')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 29 29') // version 2 (25 modules) + margin
    expect(sheet()!.querySelector('.u')!.textContent).toBe('https://example.com/')
    // back, then close: the share still counts as done
    ;(sheet()!.querySelector('.k') as HTMLElement).click()
    expect(items()).toHaveLength(1)
    ;(sheet()!.querySelector('.x') as HTMLElement).click()
    await expect(p).resolves.toBe('qr')
  })
})

describe('files', () => {
  const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' })
  const pdf = () => new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
  const txt = () => new File(['Hello'], 'note.txt', { type: 'text/plain' })

  it('canShare() says yes only when something can take the files', async () => {
    const { canShare, polyfill, T } = await load()
    const files = [pdf()]
    expect(canShare({ files })).toBe(false)
    expect(canShare({ files }, { targets: [T.x] })).toBe(false)
    expect(canShare({ files }, { targets: [T.save] })).toBe(true)
    expect(canShare({ files }, { targets: { '*': [T.x], en: [T.save] } })).toBe(true)
    // copy takes one image or one text file
    expect(canShare({ files: [png()] }, { targets: [T.copy] })).toBe(true)
    expect(canShare({ files: [txt()] }, { targets: [T.copy] })).toBe(true)
    expect(canShare({ files }, { targets: [T.copy] })).toBe(false)
    expect(canShare({ files: [png(), png()] }, { targets: [T.copy] })).toBe(false)
    // navigator.canShare() checks the options given to polyfill()
    polyfill({ targets: [T.x] })
    expect(navigator.canShare({ files })).toBe(false)
    polyfill({ targets: [T.save] })
    expect(navigator.canShare({ files })).toBe(true)
    // The native API taking them is enough
    const withNative = await load(() => Promise.resolve())
    expect(withNative.canShare({ files })).toBe(true)
  })

  it('shows only the targets that take files, unless there is also a link', async () => {
    const { share, T } = await load()
    const targets = [T.x, T.copy, T.qr, T.save]
    const p = share({ files: [png()] }, { targets })
    expect(items().map((i) => i.dataset.id)).toEqual(['copy', 'save'])
    ;(sheet()!.querySelector('.x') as HTMLElement).click()
    await p.catch(() => {})
    await flush()
    const q = share({ files: [png()], url: 'https://example.com' }, { targets })
    expect(items().map((i) => i.dataset.id)).toEqual(['x', 'copy', 'qr', 'save'])
    ;(sheet()!.querySelector('.x') as HTMLElement).click()
    await q.catch(() => {})
  })

  it('shows the file names, and a thumbnail for one image', async () => {
    const { share, T } = await load()
    const create = URL.createObjectURL
    const revoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:thumb')
    URL.revokeObjectURL = vi.fn()
    try {
      const p = share({ files: [png()] }, { targets: [T.save] })
      expect(sheet()!.querySelector('.t b')!.textContent).toBe('photo.png')
      expect(sheet()!.querySelector('.f img.th')!.getAttribute('src')).toBe('blob:thumb')
      ;(sheet()!.querySelector('.x') as HTMLElement).click()
      await p.catch(() => {})
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb')
      await flush()
      const q = share({ files: [png(), pdf()] }, { targets: [T.save] })
      expect(sheet()!.querySelector('.t b')!.textContent).toBe('photo.png, doc.pdf')
      expect(sheet()!.querySelector('.f img')).toBeNull()
      ;(sheet()!.querySelector('.x') as HTMLElement).click()
      await q.catch(() => {})
    } finally {
      URL.createObjectURL = create
      URL.revokeObjectURL = revoke
    }
  })

  it('rejects files that no target takes', async () => {
    const { share, T } = await load()
    await expect(share({ files: [pdf()] }, { targets: [T.x, T.copy] })).rejects.toBeInstanceOf(TypeError)
  })

  it('uses the sheet when the native API refuses the files', async () => {
    const native = vi.fn(() => Promise.resolve())
    const { share, T } = await load(native, (d) => !d?.files?.length)
    const p = share({ files: [pdf()] }, { targets: [T.save, T.more] })
    expect(native).not.toHaveBeenCalled()
    expect(items().map((i) => i.dataset.id)).toEqual(['save'])
    ;(sheet()!.querySelector('.x') as HTMLElement).click()
    await p.catch(() => {})
  })

  it('saves the files with their names', async () => {
    const { share, T } = await load()
    const saved: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    const create = URL.createObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:test')
    try {
      const p = share({ files: [png(), pdf()] }, { targets: [T.save] })
      expect(sheet()!.querySelector('[data-id="save"] .l')!.textContent).toBe('photo.png +1')
      ;(sheet()!.querySelector('[data-id="save"]') as HTMLElement).click()
      await expect(p).resolves.toBe('save')
      expect(saved).toEqual(['photo.png', 'doc.pdf'])
    } finally {
      click.mockRestore()
      URL.createObjectURL = create
    }
  })

  it('copies an image as PNG, and a text file as text', async () => {
    const { share, T } = await load()
    const write = vi.fn(() => Promise.resolve())
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { write, writeText }, configurable: true })
    const Item = globalThis.ClipboardItem
    globalThis.ClipboardItem = class {
      constructor(public items: Record<string, Promise<Blob>>) {}
    } as unknown as typeof ClipboardItem
    try {
      const file = png()
      const p = share({ files: [file] }, { targets: [T.copy] })
      ;(sheet()!.querySelector('[data-id="copy"]') as HTMLElement).click()
      await expect(p).resolves.toBe('copy')
      const item = (write.mock.calls[0] as unknown as [[{ items: Record<string, Promise<Blob>> }]])[0][0]
      expect(await item.items['image/png']).toBe(file)
      await flush()

      const q = share({ files: [txt()] }, { targets: [T.copy] })
      ;(sheet()!.querySelector('[data-id="copy"]') as HTMLElement).click()
      await expect(q).resolves.toBe('copy')
      expect(writeText).toHaveBeenCalledWith('Hello')
    } finally {
      globalThis.ClipboardItem = Item
    }
  })
})

describe('language', () => {
  it('matches browser languages to locales', async () => {
    const { match } = await load()
    const locales = { en: 1, zh: 1, 'zh-hant': 1, pt: 1, 'pt-pt': 1, nb: 1, fil: 1 }
    expect(match(locales, ['zh-CN'])).toBe('zh')
    expect(match(locales, ['zh-TW'])).toBe('zh-hant')
    expect(match(locales, ['zh-Hant-HK'])).toBe('zh-hant')
    expect(match(locales, ['zh-HK'])).toBe('zh-hant')
    expect(match(locales, ['pt-BR'])).toBe('pt')
    expect(match(locales, ['pt-PT'])).toBe('pt-pt')
    expect(match(locales, ['no'])).toBe('nb')
    expect(match(locales, ['tl'])).toBe('fil')
    expect(match(locales, ['xx', 'en-GB'])).toBe('en')
    expect(match(locales, ['xx'])).toBeUndefined()
  })

  it('localizes the sheet and target names, with overrides and RTL', async () => {
    const { share, T } = await load()
    const L = await import('../src/locales.js')
    const p = share(
      { url: 'https://example.com' },
      { lang: 'zh-CN', locales: [L.zh, L.ar], targets: [T.copy, T.weibo], strings: { copied: 'OK!' } },
    )
    expect(dialog()!.getAttribute('aria-label')).toBe('分享')
    expect(dialog()!.lang).toBe('zh')
    expect(sheet()!.querySelector('[data-id="copy"] .l')!.textContent).toBe('复制链接')
    expect(sheet()!.querySelector('[data-id="weibo"] .l')!.textContent).toBe('微博')
    ;(sheet()!.querySelector('.x') as HTMLElement).click()
    await p.catch(() => {})
    await flush()

    const q = share({ url: 'https://example.com' }, { lang: ['ar-EG'], locales: [L.zh, L.ar], targets: [T.x] })
    expect(dialog()!.dir).toBe('rtl')
    expect(dialog()!.getAttribute('aria-label')).toBe('مشاركة')
    click('x')
    await q
  })

  it('overrides strings for every language, or by language', async () => {
    const { share, T } = await load()
    const L = await import('../src/locales.js')
    const copyLabel = async (lang: string, strings: object) => {
      const p = share(
        { url: 'https://example.com' },
        { lang, locales: [L.zh, L.zhHant, L.fr], targets: [T.copy], strings },
      )
      const label = sheet()!.querySelector('[data-id="copy"] .l')!.textContent
      ;(sheet()!.querySelector('.x') as HTMLElement).click()
      await p.catch(() => {})
      await flush()
      return label
    }
    // One set: every language
    expect(await copyLabel('fr', { copyLink: 'Link!' })).toBe('Link!')
    // By language, with '*' for the others
    const byLang = { '*': { copyLink: 'Link!' }, zh: { copyLink: '链接！' }, 'zh-hant': { copyLink: '連結！' } }
    expect(await copyLabel('zh-CN', byLang)).toBe('链接！')
    expect(await copyLabel('zh-TW', byLang)).toBe('連結！')
    expect(await copyLabel('fr', byLang)).toBe('Link!')
    // A language without its own set, and no '*': the locale's strings
    expect(await copyLabel('fr', { zh: { copyLink: '链接！' } })).toBe('Copier le lien')
  })

  it('uses the fallback locale when no viewer language is available', async () => {
    const { share, T } = await load()
    const L = await import('../src/locales.js')
    const open = async (o: object) => {
      const p = share({ url: 'https://example.com' }, { targets: [T.x], ...o })
      const label = dialog()!.getAttribute('aria-label')
      click('x')
      await p
      await flush()
      return label
    }
    // Viewer is en-US; English is not the fallback, but still matches the viewer first
    expect(await open({ locales: [L.fr], fallback: 'fr' })).toBe('Share')
    expect(await open({ lang: 'es-MX', locales: [L.fr, L.de], fallback: 'fr' })).toBe('Partager')
    expect(await open({ lang: 'es-MX', locales: [L.fr, L.de] })).toBe('Share')
    expect(await open({ lang: 'es-MX', locales: [L.fr], fallback: 'xx' })).toBe('Share')
    expect(await open({ lang: 'de-AT', locales: [L.fr, L.de], fallback: 'fr' })).toBe('Teilen')
  })

  it('every locale has all strings', async () => {
    const L = await import('../src/locales.js')
    for (const [name, value] of Object.entries(L)) {
      const parts = value.split('|')
      expect(parts, name).toHaveLength(12)
      expect(parts.every(Boolean), name).toBe(true)
    }
  })
})

describe('auto', () => {
  it('installs the default targets for each language, and only imports those', async () => {
    vi.resetModules()
    for (const k of ['share', 'canShare']) {
      Object.defineProperty(navigator, k, { value: undefined, configurable: true, writable: true })
    }
    await import('../src/auto.js')
    const { defaults } = await import('../src/defaults.js')
    for (const [lang, ids] of Object.entries(defaults)) {
      Object.defineProperty(navigator, 'languages', { value: [lang == '*' ? 'en' : lang], configurable: true })
      const p = navigator.share({ url: 'https://example.com' })
      // sms, more, kakaotalk and save hide themselves here: no touch screen, no native sheet, no Kakao SDK,
      // no files
      const expected = ids.filter((id) => !['sms', 'more', 'kakaotalk', 'save'].includes(id))
      expect(
        items()
          .map((i) => i.dataset.id)
          .sort(),
        lang,
      ).toEqual(expected.sort())
      ;(sheet()!.querySelector('.x') as HTMLElement).click()
      await p.catch(() => {})
    }
  })
})

describe('polyfill', () => {
  it('installs navigator.share and navigator.canShare', async () => {
    const { polyfill, T } = await load()
    polyfill({ targets: [T.x] })
    expect(navigator.canShare({ url: 'https://example.com' })).toBe(true)
    const p = navigator.share({ url: 'https://example.com' })
    click('x')
    await expect(p).resolves.toBeUndefined()
  })

  it('keeps using the native API after polyfilling, even when loaded twice', async () => {
    const native = vi.fn(() => Promise.resolve())
    const first = await load(native)
    first.polyfill()
    // Simulate a second copy of the library loaded later on the page
    vi.resetModules()
    const second = await import('../src/index.js')
    expect(second.nativeShare).toBe(first.nativeShare)
    second.polyfill()
    await navigator.share({ url: 'https://example.com' })
    expect(native).toHaveBeenCalledOnce()
  })
})
