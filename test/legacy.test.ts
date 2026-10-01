// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareTarget, Sheet } from '../src/index.js'

const target: ShareTarget = {
  id: 'done',
  name: 'Done',
  icon: '',
  run(_, sheet) {
    sheet.ok()
    sheet.close()
  },
}
const descriptors: [object, string, PropertyDescriptor | undefined][] = []
const missing = (object: object, name: string) => {
  descriptors.push([object, name, Object.getOwnPropertyDescriptor(object, name)])
  Object.defineProperty(object, name, { configurable: true, value: undefined })
}
const load = async (shadow = true) => {
  vi.resetModules()
  missing(navigator, 'share')
  missing(navigator, 'canShare')
  missing(HTMLDialogElement.prototype, 'showModal')
  missing(HTMLDialogElement.prototype, 'close')
  if (!shadow) missing(Element.prototype, 'attachShadow')
  const core = await import('../src/index.js')
  await import('../src/legacy.js')
  return core
}
const host = () => document.querySelector('web-share-polyfill')!
const root = () => host().shadowRoot || host().querySelector('iframe')!.contentDocument!
const button = (selector: string) => root().querySelector<HTMLElement>(selector)!
const key = (element: Element, name: string, shiftKey = false) => {
  const event = new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, composed: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}
const dismiss = () => button('.x').click()

beforeEach(() => {
  document.body.innerHTML =
    '<button id="opener">Share</button><main aria-hidden="false"><a href="#" tabindex="3">Other</a></main>'
  document.querySelector<HTMLElement>('#opener')!.focus()
})
afterEach(async () => {
  if (document.querySelector('web-share-polyfill')) {
    dismiss()
    await new Promise((resolve) => setTimeout(resolve, 170))
  }
  for (let i = descriptors.length - 1; i >= 0; i--) {
    const [object, name, descriptor] = descriptors[i]
    if (descriptor) Object.defineProperty(object, name, descriptor)
    else Reflect.deleteProperty(object, name)
  }
  descriptors.length = 0
  document.body.textContent = ''
  document.documentElement.style.cssText = ''
  vi.restoreAllMocks()
})

describe('legacy dialog', () => {
  it('opens without dialog methods and traps keyboard focus in both directions', async () => {
    const { share } = await load()
    const p = share({ text: 'Hello' }, { targets: [target] })
    expect(button('dialog').getAttribute('role')).toBe('dialog')
    expect(button('dialog').getAttribute('aria-modal')).toBe('true')
    expect(button('dialog').hasAttribute('open')).toBe(true)
    const wrap = button('.w')
    expect(host().shadowRoot!.activeElement).toBe(wrap)
    key(wrap, 'Tab')
    expect(host().shadowRoot!.activeElement).toBe(button('.x'))
    key(button('.x'), 'Tab', true)
    expect(host().shadowRoot!.activeElement).toBe(button('[data-id="done"]'))
    key(button('[data-id="done"]'), 'Tab')
    expect(host().shadowRoot!.activeElement).toBe(button('.x'))
    wrap.focus()
    key(wrap, 'Tab', true)
    expect(host().shadowRoot!.activeElement).toBe(button('[data-id="done"]'))
    button('[data-id="done"]').click()
    await expect(p).resolves.toBe('done')
  })

  it('excludes existing and added background controls, and restores attributes and focus', async () => {
    const { share } = await load()
    document.documentElement.style.setProperty('overflow', 'auto')
    const p = share({ text: 'Hello' })
    const opener = document.querySelector<HTMLElement>('#opener')!
    const main = document.querySelector('main')!
    const link = main.querySelector('a')!
    expect(opener.tabIndex).toBe(-1)
    expect(link.tabIndex).toBe(-1)
    expect(main.getAttribute('aria-hidden')).toBe('true')
    expect(main.hasAttribute('inert')).toBe(true)
    expect(document.documentElement.style.overflow).toBe('hidden')
    const newButton = document.createElement('button')
    main.appendChild(newButton)
    await vi.waitFor(() => expect(newButton.tabIndex).toBe(-1))
    opener.focus()
    expect(host().shadowRoot!.activeElement).toBe(button('.w'))
    dismiss()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(document.activeElement).toBe(opener)
    expect(opener.hasAttribute('tabindex')).toBe(false)
    expect(newButton.hasAttribute('tabindex')).toBe(false)
    expect(link.getAttribute('tabindex')).toBe('3')
    expect(main.getAttribute('aria-hidden')).toBe('false')
    expect(main.hasAttribute('inert')).toBe(false)
    expect(document.documentElement.style.overflow).toBe('auto')
    const event = key(opener, 'Tab')
    expect(event.defaultPrevented).toBe(false)
  })

  it('handles Escape, backdrop, close and successful repeated share flows', async () => {
    const { share } = await load()
    for (const close of [() => key(button('.w'), 'Escape'), () => button('.wsp-overlay').click(), dismiss]) {
      const p = share({ text: 'Hello' }, { targets: [target] })
      close()
      // A second close is harmless; actions during the closing animation cannot change the result.
      dismiss()
      button('[data-id="done"]').click()
      await expect(p).rejects.toMatchObject({ name: 'AbortError' })
      expect(document.querySelector('web-share-polyfill')).toBeNull()
    }
    const p = share({ text: 'Hello' }, { targets: [target] })
    button('[data-id="done"]').click()
    await expect(p).resolves.toBe('done')
  })

  it('recomputes the focus trap after a sub-view and returns focus when going back', async () => {
    const { share } = await load()
    let controller: Sheet | undefined
    const p = share(
      { text: 'Hello' },
      {
        targets: [
          {
            ...target,
            run(_, s) {
              controller = s
              const content = document.createElement('button')
              content.id = 'custom'
              content.textContent = 'Custom action'
              s.view('Details', content)
            },
          },
        ],
      },
    )
    button('[data-id="done"]').click()
    expect(host().shadowRoot!.activeElement).toBe(button('.k'))
    key(button('.k'), 'Tab')
    expect(host().shadowRoot!.activeElement).toBe(button('#custom'))
    button('.k').click()
    expect(host().shadowRoot!.activeElement).toBe(button('.w'))
    expect(button('[data-id="done"]')).toBeTruthy()
    controller!.ok()
    dismiss()
    await expect(p).resolves.toBe('done')
  })

  it('settles and restores background state if the host is removed externally', async () => {
    const { share } = await load()
    const p = share({ text: 'Hello' })
    p.catch(() => {})
    host().parentNode!.removeChild(host())
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    const opener = document.querySelector<HTMLElement>('#opener')!
    expect(opener.hasAttribute('tabindex')).toBe(false)
    expect(opener.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(opener)
    const next = share({ text: 'Again' }, { targets: [target] })
    button('[data-id="done"]').click()
    await expect(next).resolves.toBe('done')
  })

  it('preserves document order for equal tabindex even with an unstable Array.sort', async () => {
    const { share } = await load()
    const p = share(
      { text: 'Hello' },
      {
        targets: [
          {
            ...target,
            run(_, sheet) {
              const content = document.createElement('div')
              for (const [id, tabIndex] of [
                ['second-a', 2],
                ['first', 1],
                ['second-b', 2],
                ['zero', 0],
              ] as const) {
                const input = document.createElement('input')
                input.id = id
                input.tabIndex = tabIndex
                content.appendChild(input)
              }
              sheet.view('Order', content)
            },
          },
        ],
      },
    )
    p.catch(() => {})
    button('[data-id="done"]').click()
    button('.w').focus()
    const originalSort = Array.prototype.sort
    const unstable = vi.spyOn(Array.prototype, 'sort').mockImplementation(function (
      this: any[],
      compare?: (a: any, b: any) => number,
    ) {
      const before = this.slice()
      // Reverse ties only for the focus trap's element/entry list, leaving the DOM emulator alone.
      const focusList =
        compare && this.length > 0 && this.every((value) => (value.node || value) instanceof HTMLElement)
      return originalSort.call(
        this,
        focusList ? (a, b) => compare!(a, b) || before.indexOf(b) - before.indexOf(a) : compare,
      )
    })
    try {
      for (const selector of ['#first', '#second-a', '#second-b', '.x', '.k', '#zero']) {
        key(button('.w'), 'Tab')
        expect(host().shadowRoot!.activeElement).toBe(button(selector))
      }
    } finally {
      unstable.mockRestore()
    }
    dismiss()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('cleans up a failed native open so the next share can succeed', async () => {
    vi.resetModules()
    missing(navigator, 'share')
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementationOnce(() => {
      throw new Error('open failed')
    })
    const { share } = await import('../src/index.js')
    await expect(share({ text: 'Hello' })).rejects.toThrow('open failed')
    expect(document.querySelector('web-share-polyfill')).toBeNull()
    show.mockRestore()
    const p = share({ text: 'Again' }, { targets: [target] })
    button('[data-id="done"]').click()
    await expect(p).resolves.toBe('done')
  })
})

describe('missing Shadow DOM', () => {
  it('isolates styles in a titled frame and bridges public CSS custom properties', async () => {
    const { share } = await load(false)
    // happy-dom does not inherit custom properties through all:initial like browsers do.
    const computed = getComputedStyle
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => {
      const style = computed(element)
      if (element.tagName == 'WEB-SHARE-POLYFILL') {
        return {
          getPropertyValue: (property: string) =>
            property == '--wsp-bg' ? 'rgb(1, 2, 3)' : style.getPropertyValue(property),
        } as CSSStyleDeclaration
      }
      return style
    })
    const p = share({ text: 'Hello' }, { targets: [target], strings: { share: 'Send this' } })
    p.catch(() => {})
    const frame = host().querySelector('iframe')!
    expect(frame.title).toBe('Send this')
    expect(frame.contentDocument!.title).toBe('Send this')
    expect(host().shadowRoot).toBeNull()
    expect(document.querySelector('dialog')).toBeNull()
    expect(frame.contentDocument!.querySelector('dialog')!.getAttribute('aria-label')).toBe('Send this')
    expect(frame.contentDocument!.body.style.getPropertyValue('--wsp-bg')).toBe('rgb(1, 2, 3)')
    expect(frame.contentDocument!.querySelector('style')!.textContent).toContain('dialog')
    expect(document.querySelectorAll('style')).toHaveLength(0)
    expect(frame.contentDocument!.querySelector('base')!.href).toBe(document.baseURI)
    key(button('.w'), 'Tab')
    expect(frame.contentDocument!.activeElement).toBe(button('.x'))
    button('[data-id="done"]').click()
    await expect(p).resolves.toBe('done')
    expect(document.activeElement).toBe(document.querySelector('#opener'))
  })

  it('supports custom sub-views, Escape and repeated iframe lifecycles', async () => {
    const { share } = await load(false)
    for (let i = 0; i < 2; i++) {
      const p = share(
        { text: 'Hello' },
        {
          targets: [
            {
              ...target,
              run(_, s) {
                const content = document.createElement('input')
                content.id = 'custom'
                s.view('Details', content)
              },
            },
          ],
        },
      )
      button('[data-id="done"]').click()
      const doc = host().querySelector('iframe')!.contentDocument!
      expect(button('#custom').ownerDocument).toBe(doc)
      expect(doc.activeElement).toBe(button('.k'))
      key(button('.k'), 'Escape')
      await expect(p).rejects.toMatchObject({ name: 'AbortError' })
      expect(document.querySelector('web-share-polyfill')).toBeNull()
    }
  })
})
