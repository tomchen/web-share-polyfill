// Runs in real Chromium, Firefox and WebKit: what happy-dom can't show. The modal dialog and its top layer,
// keyboard and pointer handling, the styles actually applied, layout, and the QR code as painted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import jsQR from 'jsqr'
import { nativeShare, polyfill, share, type Options } from '../../src/index.js'
import * as T from '../../src/targets.js'
import * as L from '../../src/locales.js'

// Same-origin data, so the favicon lookup doesn't leave the test server
const data = { title: 'Hello', url: location.origin + '/page?a=1' }

const host = () => document.querySelector('web-share-polyfill')
const root = () => host()?.shadowRoot
const dialog = () => root()?.querySelector('dialog') as HTMLDialogElement
const item = (id: string) => root()!.querySelector(`[data-id="${id}"]`) as HTMLElement
const css = (e: Element) => getComputedStyle(e)

/** Open the sheet (never the browser's own), wait for its entry animation, and return the pending share. */
const open = async (o: Options): Promise<{ result: Promise<string> }> => {
  const result = share(data, { native: false, look: 'material', ...o })
  result.catch(() => {}) // tests that dismiss the sheet check the rejection themselves
  await Promise.all(
    dialog()
      .getAnimations({ subtree: true })
      .map((a) => a.finished),
  )
  return { result }
}

// Share links open new tabs: keep them from leaving the test page
const stay = (e: Event) => {
  if ((e.composedPath()[0] as Element).closest?.('a')) e.preventDefault()
}
beforeEach(() => document.addEventListener('click', stay))
afterEach(async () => {
  document.removeEventListener('click', stay)
  if (host()) {
    ;(root()!.querySelector('.x') as HTMLElement).click()
    await vi.waitFor(() => expect(host()).toBeNull())
  }
})

describe('sheet', () => {
  it('opens as a visible modal dialog', async () => {
    await open({ targets: [T.x, T.copy] })
    const dlg = dialog()
    expect(dlg.open).toBe(true)
    expect(dlg.matches(':modal')).toBe(true)
    const box = dlg.getBoundingClientRect()
    expect(box.width).toBeGreaterThan(200)
    expect(box.height).toBeGreaterThan(100)
    for (const id of ['x', 'copy']) {
      const r = item(id).getBoundingClientRect()
      expect(r.width * r.height, id).toBeGreaterThan(0)
    }
    // The stylesheet is applied inside the shadow root
    expect(css(dlg).borderTopLeftRadius).toBe('28px')
    expect(css(dlg).display).toBe('flex')
  })

  it('closes on Escape and rejects with AbortError', async () => {
    const { result } = await open({ targets: [T.x] })
    await userEvent.keyboard('{Escape}')
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(host()).toBeNull()
  })

  it('closes on a click on the backdrop', async () => {
    const { result } = await open({ targets: [T.x] })
    // A page-sized element under the backdrop gives the pointer somewhere to aim
    const under = document.body.appendChild(document.createElement('div'))
    under.style.cssText = 'position:fixed;inset:0'
    try {
      await userEvent.click(under, { position: { x: 4, y: 4 }, force: true })
      await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      under.remove()
    }
  })

  it('resolves with the id of a clicked share link', async () => {
    const { result } = await open({ targets: [T.x] })
    const link = item('x') as HTMLAnchorElement
    expect(link.href).toBe('https://x.com/intent/post?text=Hello&url=' + encodeURIComponent(data.url))
    expect(link.target).toBe('_blank')
    await userEvent.click(link)
    await expect(result).resolves.toBe('x')
  })

  it('works from the keyboard', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      const { result } = await open({ targets: [T.copy] })
      // The sheet itself has focus at first, like native sheets
      expect(root()!.activeElement?.className).toBe('w')
      item('copy').focus()
      await userEvent.keyboard('{Enter}')
      await expect(result).resolves.toBe('copy')
      expect(writeText).toHaveBeenCalledWith(data.url)
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard
    }
  })

  it('shows a QR code that scans back to the link', async () => {
    await open({ targets: [T.qr] })
    await userEvent.click(item('qr'))
    const svg = root()!.querySelector('svg.qr')!
    await vi.waitFor(() => expect(svg.getBoundingClientRect().width).toBeGreaterThan(100))
    // Decode what the browser painted, not the markup
    const png = await page.screenshot({ element: svg, save: false })
    const img = new Image()
    img.src = 'data:image/png;base64,' + png
    await img.decode()
    const pad = 32
    const canvas = document.createElement('canvas')
    canvas.width = img.width + pad * 2
    canvas.height = img.height + pad * 2
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, pad, pad)
    const { data: px, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    expect(jsQR(px, width, height)?.data).toBe(data.url)
  })
})

describe('files', () => {
  const jpeg = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 30
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e33'
    ctx.fillRect(0, 0, 40, 30)
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg'))
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  }

  it('copies an image as PNG', async () => {
    let copied: ClipboardItem | undefined
    const write = vi.fn(async (items: ClipboardItem[]) => void (copied = items[0]))
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    try {
      const result = share({ files: [await jpeg()] }, { native: false, targets: [T.copy] })
      await userEvent.click(item('copy'))
      await expect(result).resolves.toBe('copy')
      const png = await copied!.getType('image/png')
      expect(png.type).toBe('image/png')
      const bitmap = await createImageBitmap(png)
      expect([bitmap.width, bitmap.height]).toEqual([40, 30])
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard
    }
  })

  it('saves files through download links', async () => {
    const saved: string[] = []
    const record = (e: Event) => {
      const a = e.target as HTMLAnchorElement
      if (a.download) saved.push(a.download)
    }
    document.addEventListener('click', record, true)
    try {
      const result = share({ files: [await jpeg()] }, { native: false, targets: [T.save] })
      await userEvent.click(item('save'))
      await expect(result).resolves.toBe('save')
      expect(saved).toEqual(['photo.jpg'])
    } finally {
      document.removeEventListener('click', record, true)
    }
  })
})

describe('styling', () => {
  const background = async (theme: 'light' | 'dark') => {
    await open({ targets: [T.x], theme })
    const bg = css(dialog()).backgroundColor
    ;(root()!.querySelector('.x') as HTMLElement).click()
    await vi.waitFor(() => expect(host()).toBeNull())
    return bg
  }

  it('has light and dark themes', async () => {
    expect(await background('light')).toBe('rgb(255, 255, 255)')
    expect(await background('dark')).toBe('rgb(30, 31, 32)')
  })

  it('takes --wsp-* custom properties and ::part() rules from the page', async () => {
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = `
      web-share-polyfill { --wsp-bg: rgb(1, 2, 3); --wsp-radius: 5px }
      web-share-polyfill::part(label) { color: rgb(4, 5, 6) }`
    try {
      await open({ targets: [T.x] })
      expect(css(dialog()).backgroundColor).toBe('rgb(1, 2, 3)')
      expect(css(dialog()).borderTopLeftRadius).toBe('5px')
      expect(css(item('x').querySelector('.l')!).color).toBe('rgb(4, 5, 6)')
    } finally {
      style.remove()
    }
  })

  it('lays out right to left for RTL languages', async () => {
    await open({ lang: 'ar', locales: [L.ar], targets: [T.x] })
    expect(css(dialog()).direction).toBe('rtl')
    // The close button moves to the left of the title
    const close = root()!.querySelector('.x')!.getBoundingClientRect()
    const title = root()!.querySelector('.t')!.getBoundingClientRect()
    expect(close.right).toBeLessThanOrEqual(title.left)
  })
})

// Only where the browser has no share sheet of its own, so nothing native pops up
describe.skipIf(nativeShare)('polyfill', () => {
  afterEach(() => {
    delete (navigator as { share?: unknown }).share
    delete (navigator as { canShare?: unknown }).canShare
  })

  it('installs navigator.share() and navigator.canShare()', async () => {
    polyfill({ targets: [T.x] })
    expect(navigator.canShare({ url: data.url })).toBe(true)
    expect(navigator.canShare({})).toBe(false)
    const p = navigator.share(data)
    await vi.waitFor(() => expect(dialog()?.open).toBe(true))
    await userEvent.click(item('x'))
    await expect(p).resolves.toBeUndefined()
  })
})
