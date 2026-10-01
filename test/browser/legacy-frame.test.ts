import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { share } from '../../src/index.js'
import '../../src/legacy.js'
import { qr } from '../../src/targets.js'

const host = () => document.querySelector('web-share-polyfill')
const root = () => host()?.shadowRoot || host()?.querySelector('iframe')?.contentDocument
const dialog = () => root()?.querySelector('dialog') as HTMLDialogElement
const close = async () => {
  ;(root()?.querySelector('.x') as HTMLElement)?.click()
  await vi.waitFor(() => expect(host()).toBeNull())
}
afterEach(async () => {
  if (host()) await close()
  vi.restoreAllMocks()
})

describe('legacy platform paths', () => {
  it('contains keyboard focus, dismisses on Escape, and restores background state', async () => {
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(undefined as never)
    // Replace the capability itself: an implementation that throws tests a different failure path.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')!
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { ...descriptor, value: undefined })
    const before = document.body.appendChild(document.createElement('button'))
    before.textContent = 'Before'
    before.focus()
    try {
      const result = share({ text: 'Legacy QR' }, { native: false, targets: [qr] })
      result.catch(() => {})
      expect(dialog().classList.contains('wsp-legacy')).toBe(true)
      expect(before.getAttribute('tabindex')).toBe('-1')
      await userEvent.keyboard('{Tab}')
      expect(root()!.activeElement).toBe(root()!.querySelector('.x'))
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      expect(root()!.activeElement).toBe(root()!.querySelector('[data-id="qr"]'))
      await userEvent.keyboard('{Escape}')
      await expect(result).rejects.toMatchObject({ name: 'AbortError' })
      expect(document.activeElement).toBe(before)
      expect(before.hasAttribute('tabindex')).toBe(false)
      expect(before.hasAttribute('aria-hidden')).toBe(false)
    } finally {
      before.remove()
    }
  })

  it('isolates the no-shadow iframe, retains overrides and supports repeated QR/back/close', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow')!
    Object.defineProperty(Element.prototype, 'attachShadow', { ...descriptor, value: undefined })
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent =
      'button { font-size: 90px !important; color: red !important } web-share-polyfill { --wsp-bg: rgb(1, 2, 3) }'
    try {
      for (let i = 0; i < 2; i++) {
        const result = share({ text: 'Legacy QR' }, { native: false, targets: [qr] })
        result.catch(() => {})
        const frame = host()!.querySelector('iframe')!
        expect(frame.title).toBe('Share')
        const doc = frame.contentDocument!
        const computed = frame.contentWindow!.getComputedStyle(dialog())
        expect(computed.backgroundColor).toBe('rgb(1, 2, 3)')
        expect(dialog().getBoundingClientRect().width).toBeGreaterThan(200)
        const target = doc.querySelector('[data-id="qr"]') as HTMLElement
        expect(frame.contentWindow!.getComputedStyle(target).fontSize).not.toBe('90px')
        target.click()
        expect(doc.querySelector('svg.qr')).not.toBeNull()
        ;(doc.querySelector('.k') as HTMLElement).click()
        expect(doc.querySelector('svg.qr')).toBeNull()
        await close()
        await expect(result).resolves.toBe('qr')
      }
    } finally {
      Object.defineProperty(Element.prototype, 'attachShadow', descriptor)
      style.remove()
    }
  })
})
