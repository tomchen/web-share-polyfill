// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copy, qrView } from '../src/targets.js'
import type { ShareInput, Sheet, Strings } from '../src/index.js'

const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const execCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')
const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
const sheet = (): Sheet => {
  const item = document.createElement('button')
  item.innerHTML = '<span class="c"></span><span class="l"></span>'
  document.body.appendChild(item)
  return {
    item,
    strings: { copied: 'Copied', qr: 'QR code' } as Strings,
    label: 'QR code',
    ok: vi.fn(),
    close: vi.fn(),
    view: vi.fn(),
  }
}
const data = (files: File[] = []): ShareInput => ({ title: '', text: '', url: '', files })

afterEach(() => {
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else delete (navigator as { clipboard?: unknown }).clipboard
  if (execCommand) Object.defineProperty(document, 'execCommand', execCommand)
  else delete (document as { execCommand?: unknown }).execCommand
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.textContent = ''
})

describe('older target APIs', () => {
  it('copies a text file without Blob.text, async clipboard, or replaceChildren', async () => {
    setClipboard(undefined)
    const file = new File(['Hello, 世界'], 'note.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: undefined })
    const s = sheet()
    Object.defineProperty(s.item.querySelector('.c'), 'replaceChildren', { value: undefined })
    let copied = ''
    const exec = vi.fn(() => {
      copied = s.item.querySelector('textarea')!.value
      return true
    })
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })

    expect(copy.files!([file])).toBe(true)
    copy.run!(data([file]), s)
    await vi.waitFor(() => expect(s.ok).toHaveBeenCalled())
    expect(exec).toHaveBeenCalledWith('copy')
    expect(copied).toBe('Hello, 世界')
    expect(s.item.querySelector('.l')!.textContent).toBe('Copied')
    expect(s.item.querySelector('.c svg')).not.toBeNull()
    expect(s.item.querySelector('textarea')).toBeNull()
  })

  it('hides image copy when the required clipboard APIs are unavailable', () => {
    const png = new File(['png'], 'image.png', { type: 'image/png' })
    const jpeg = new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' })
    setClipboard(undefined)
    vi.stubGlobal('ClipboardItem', undefined)
    expect(copy.files!([png])).toBe(false)

    setClipboard({ write: vi.fn() })
    expect(copy.files!([png])).toBe(false)
    vi.stubGlobal('ClipboardItem', class {})
    expect(copy.files!([png])).toBe(true)

    vi.stubGlobal('createImageBitmap', undefined)
    expect(copy.files!([jpeg])).toBe(false)
  })

  it('runs legacy copying in the sheet item’s document', () => {
    setClipboard(undefined)
    const s = sheet()
    const frameDocument = document.implementation.createHTMLDocument('Share')
    frameDocument.body.appendChild(s.item)
    const exec = vi.fn(() => true)
    Object.defineProperty(frameDocument, 'execCommand', { value: exec, configurable: true })
    const outerExec = vi.fn(() => false)
    Object.defineProperty(document, 'execCommand', { value: outerExec, configurable: true })
    copy.run!({ ...data(), text: 'Hello' }, s)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(outerExec).not.toHaveBeenCalled()
    expect(s.ok).toHaveBeenCalled()
  })

  it('builds the QR view without DocumentFragment.append', () => {
    const s = sheet()
    const fragment = document.createDocumentFragment()
    Object.defineProperty(fragment, 'append', { value: undefined })
    vi.spyOn(document, 'createDocumentFragment').mockReturnValue(fragment)
    qrView('Hello', s)
    expect(fragment.querySelector('svg')).not.toBeNull()
    expect(fragment.querySelector('p')!.textContent).toBe('Hello')
    expect(s.view).toHaveBeenCalledWith('QR code', fragment)
  })
})
