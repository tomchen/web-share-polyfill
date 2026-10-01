// Exercise the palette cascade independently of navigator.share and the user's OS theme.
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import CSS from '../../src/style.js'

let host: HTMLElement | undefined
const fixture = (look: string, system: string, theme = '', legacy = false) => {
  host = document.body.appendChild(document.createElement('div'))
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  // Force only the media condition under test. All selectors, declarations and order stay intact.
  style.textContent = CSS.replace(/prefers-color-scheme:dark/g, `min-width:${system === 'dark' ? 0 : 99999}px`)
  if (legacy)
    style.textContent = style.textContent.replace(
      /@supports\s*\(background:color-mix\([^)]*\)\)/g,
      '@supports (wsp-unsupported:1)',
    )
  root.appendChild(style)
  const dialog = document.createElement('dialog')
  dialog.className = `${look} ${theme}`
  dialog.innerHTML = '<button class="x">Close</button><button class="i">Target</button><button class="k">Back</button>'
  root.appendChild(dialog)
  dialog.showModal()
  return { dialog, root }
}
afterEach(() => host?.remove())

const palettes = {
  m: {
    light: ['#fff', '#1f1f1f', '#5f6368', '#edf0f3', '#dadce0', '#0b57d0'],
    dark: ['#1e1f20', '#e3e3e3', '#a8abaf', '#303134', '#3c4043', '#a8c7fa'],
  },
  a: {
    light: ['#f2f2f7', '#000', '#8a8a8e', '#fff', '#c6c6c8', '#007aff'],
    dark: ['#1c1c1e', '#fff', '#98989f', '#2c2c2e', '#38383a', '#0a84ff'],
  },
}

describe('compatible colors', () => {
  for (const look of ['m', 'a'] as const) {
    for (const system of ['light', 'dark'] as const) {
      for (const theme of ['', 'lt', 'dk']) {
        it(`${look}, system ${system}, theme ${theme || 'auto'}`, () => {
          const { dialog } = fixture(look, system, theme)
          const scheme = theme ? (theme === 'dk' ? 'dark' : 'light') : system
          const style = getComputedStyle(dialog)
          expect(['B', 'F', 'M', 'T', 'L', 'A'].map((k) => style.getPropertyValue(`--${k}`).trim())).toEqual(
            palettes[look][scheme],
          )
          expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
          expect(style.colorScheme).toBe(theme ? scheme : 'light dark')
        })
      }
    }
  }

  it('keeps every public color override in forced dark Apple mode', () => {
    const { dialog } = fixture('a', 'light', 'dk')
    for (const key of ['bg', 'fg', 'muted', 'tile', 'line', 'accent'])
      host!.style.setProperty(`--wsp-${key}`, 'rgb(1, 2, 3)')
    const style = getComputedStyle(dialog)
    expect(style.backgroundColor).toBe('rgb(1, 2, 3)')
    expect(style.color).toBe('rgb(1, 2, 3)')
    for (const key of ['b', 'f', 'm', 't', 'l', 'a'])
      expect(style.getPropertyValue(`--${key}`).trim()).toBe('rgb(1, 2, 3)')
  })

  it('keeps close, back and hover backgrounds without color-mix', async () => {
    const { root } = fixture('m', 'dark', '', true)
    for (const selector of ['.x', '.k', '.i']) {
      const target = root.querySelector(selector)!
      if (selector === '.i') await userEvent.hover(target)
      expect(getComputedStyle(target).backgroundColor).toBe('rgb(48, 49, 52)')
    }
  })
})
