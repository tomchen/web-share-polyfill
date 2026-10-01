import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { share, type ShareTarget } from '../../src/index.js'
import '../../src/legacy.js'

const originals: [object, string, PropertyDescriptor | undefined][] = []
const disable = (object: object, name: string) => {
  originals.push([object, name, Object.getOwnPropertyDescriptor(object, name)])
  Object.defineProperty(object, name, { configurable: true, value: undefined })
}
const host = () => document.querySelector('web-share-polyfill')
const root = () => host()!.shadowRoot || host()!.querySelector('iframe')!.contentDocument!
const element = (selector: string) => root().querySelector<HTMLElement>(selector)!
const target: ShareTarget = {
  id: 'test',
  name: 'Test',
  icon: '',
  run(_, s) {
    s.ok()
    s.close()
  },
}
const fixtures: Element[] = []
const add = (tag: string) => {
  const element = document.createElement(tag)
  document.body.appendChild(element)
  fixtures.push(element)
  return element
}
afterEach(async () => {
  if (host()) {
    element('.x').click()
    await vi.waitFor(() => expect(host()).toBeNull())
  }
  fixtures.forEach((element) => element.remove())
  fixtures.length = 0
  for (let i = originals.length - 1; i >= 0; i--) {
    const [object, name, descriptor] = originals[i]
    if (descriptor) Object.defineProperty(object, name, descriptor)
    else Reflect.deleteProperty(object, name)
  }
  originals.length = 0
})

describe('platform fallbacks in browsers', () => {
  it('traps actual keyboard focus and restores the opener without native dialog methods', async () => {
    disable(HTMLDialogElement.prototype, 'showModal')
    disable(HTMLDialogElement.prototype, 'close')
    const opener = add('button')
    opener.textContent = 'Open sharing'
    opener.focus()
    const p = share({ text: 'Hello' }, { native: false, targets: [target] })
    p.catch(() => {})
    const overlay = element('.wsp-overlay')
    expect(getComputedStyle(overlay).position).toBe('fixed')
    const rect = element('dialog').getBoundingClientRect()
    expect(rect.width).toBeGreaterThan(200)
    expect(rect.height).toBeGreaterThan(90)
    expect(opener.tabIndex).toBe(-1)
    await userEvent.keyboard('{Tab}')
    expect(host()!.shadowRoot!.activeElement).toBe(element('.x'))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(host()!.shadowRoot!.activeElement).toBe(element('[data-id="test"]'))
    await userEvent.keyboard('{Tab}')
    expect(host()!.shadowRoot!.activeElement).toBe(element('.x'))
    await userEvent.keyboard('{Escape}')
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(document.activeElement).toBe(opener)
    expect(opener.hasAttribute('tabindex')).toBe(false)
  })

  it('skips disabled fieldset controls but includes its first legend in the focus trap', async () => {
    disable(HTMLDialogElement.prototype, 'showModal')
    const p = share(
      { text: 'Hello' },
      {
        native: false,
        targets: [
          {
            ...target,
            run(_, s) {
              const fragment = document.createElement('div')
              fragment.innerHTML =
                '<fieldset disabled><legend><button id="legend">Legend</button></legend><button id="disabled">Disabled</button></fieldset><button id="enabled">Enabled</button>'
              s.view('Form', fragment)
            },
          },
        ],
      },
    )
    p.catch(() => {})
    element('[data-id="test"]').click()
    await userEvent.keyboard('{Tab}')
    expect(host()!.shadowRoot!.activeElement).toBe(element('#legend'))
    await userEvent.keyboard('{Tab}')
    expect(host()!.shadowRoot!.activeElement).toBe(element('#enabled'))
    await userEvent.keyboard('{Tab}')
    expect(host()!.shadowRoot!.activeElement).toBe(element('.x'))
    element('.x').click()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('isolates an iframe from hostile page CSS, carries theme overrides and restores focus', async () => {
    disable(Element.prototype, 'attachShadow')
    const opener = add('button')
    opener.focus()
    const style = add('style')
    style.textContent = `
      web-share-polyfill { --wsp-bg:rgb(1,2,3); --wsp-fg:rgb(240,240,240); --wsp-radius:5px }
      web-share-polyfill, iframe, dialog, .w, .i { display:none!important; width:1px!important; color:red!important; animation:none!important }
      button { background:rgb(255,0,0)!important }
      @keyframes wi { from { opacity:0 } to { opacity:0 } }
    `
    const p = share({ text: 'Hello' }, { native: false, targets: [target] })
    p.catch(() => {})
    const frame = host()!.querySelector('iframe')!
    const doc = frame.contentDocument!
    const computed = doc.defaultView!.getComputedStyle(element('dialog'))
    expect(frame.title).toBe('Share')
    expect(getComputedStyle(frame).display).toBe('block')
    expect(computed.backgroundColor).toBe('rgb(1, 2, 3)')
    expect(computed.borderTopLeftRadius).toBe('5px')
    expect(computed.color).toBe('rgb(240, 240, 240)')
    expect(element('dialog').getBoundingClientRect().width).toBeGreaterThan(200)
    expect(document.querySelectorAll('dialog')).toHaveLength(0)
    expect(doc.defaultView!.getComputedStyle(element('[data-id="test"]')).backgroundColor).not.toBe('rgb(255, 0, 0)')
    await userEvent.keyboard('{Tab}')
    expect(doc.activeElement).toBe(element('.x'))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(doc.activeElement).toBe(element('[data-id="test"]'))
    element('[data-id="test"]').click()
    await expect(p).resolves.toBe('test')
    expect(document.activeElement).toBe(opener)
  })
})
