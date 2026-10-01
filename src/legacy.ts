/**
 * Side-effect entry: lets the sheet open in browsers without a modal `<dialog>` (Safari before 15.4,
 * Firefox before 98) or Shadow DOM (Firefox before 63). Import it once, anywhere:
 * `import 'web-share-polyfill/legacy'`. The script-tag build includes it.
 *
 * Without `<dialog>`, the sheet is shown in an overlay that does what a modal dialog does: Escape and
 * backdrop clicks close it, focus stays in it, and the page behind is inert. Without Shadow DOM, the sheet
 * lives in a same-origin iframe, which keeps page and sheet styles apart.
 */
import { hooks, type Surface } from './index.js'

const CSS =
  '.wsp-overlay{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:flex;flex-direction:column;background:var(--wsp-backdrop,rgba(0,0,0,.4))}' +
  'dialog.wsp-legacy{position:relative;top:auto;right:auto;bottom:auto;left:auto;margin:auto}' +
  '@media(max-width:599px){dialog.wsp-legacy{margin:auto 0 0}}'

/** The public custom properties, copied into the iframe (they don't inherit into it). */
const PROPS = ['bg', 'fg', 'muted', 'tile', 'line', 'accent', 'radius', 'font', 'backdrop']

const FOCUSABLE =
  'a[href],area[href],button,input,select,textarea,iframe,object,embed,audio[controls],video[controls],summary,[tabindex],[contenteditable]'

/** The focused element, looking into shadow roots. */
const active = (doc: Document): Element | null => {
  let a = doc.activeElement
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement
  return a
}
const focus = (node: Element | null) => (node as HTMLElement | null)?.focus?.()

const base = hooks.surface

hooks.surface = (css: string, title: string): Surface => {
  const shadow = typeof Element.prototype.attachShadow == 'function'
  if (shadow && typeof HTMLDialogElement == 'function' && typeof HTMLDialogElement.prototype.showModal == 'function')
    return base(css, title)

  let host: HTMLElement
  let root: ParentNode
  const style = document.createElement('style')
  style.textContent = (shadow ? '' : css) + CSS
  if (shadow) {
    // Shadow DOM without <dialog>: the usual shadow root, plus the overlay's styles
    ;({ host, root } = base(css, title))
  } else {
    // A frame isolates both ways: selector prefixes can't keep a page's !important rules or keyframes out
    host = document.createElement('web-share-polyfill')
    root = document.createDocumentFragment()
  }
  root.appendChild(style)

  const previous = active(document)
  let cleanup = () => {}

  return {
    host,
    root,
    open(dialog, initial, cancel) {
      ;(document.body || document.documentElement).appendChild(host)
      let frame: HTMLIFrameElement | undefined
      if (!shadow) {
        // Inline !important declarations keep ordinary page resets off the host and the frame
        host.style.cssText =
          'all:initial!important;display:block!important;position:fixed!important;top:0!important;right:0!important;bottom:0!important;left:0!important;z-index:2147483647!important;'
        frame = document.createElement('iframe')
        frame.title = title
        frame.style.cssText =
          'all:initial!important;display:block!important;width:100%!important;height:100%!important;border:0!important;background:transparent!important;'
        host.appendChild(frame)
        const doc = frame.contentDocument!
        doc.title = title
        // Relative target links resolve against the page, not about:blank
        const b = doc.createElement('base')
        b.href = document.baseURI
        doc.head.appendChild(b)
        doc.documentElement.style.cssText = 'height:100%;background:transparent'
        doc.body.style.cssText = 'margin:0;height:100%;background:transparent'
        // Custom properties set on the page are a snapshot: later changes don't reach the open sheet
        const inherited = getComputedStyle(host)
        for (const name of PROPS) {
          const value = inherited.getPropertyValue('--wsp-' + name)
          if (value) doc.body.style.setProperty('--wsp-' + name, value)
        }
        doc.body.appendChild(root)
      }

      const doc = dialog.ownerDocument
      const docs = doc == document ? [doc] : [document, doc]
      const overlay = doc.createElement('div')
      overlay.className = 'wsp-overlay'
      dialog.parentNode!.insertBefore(overlay, dialog)
      overlay.appendChild(dialog)
      dialog.classList.add('wsp-legacy')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('open', '')

      // Record only the changes made here, and don't undo the page's own changes made since
      const saved: [Element, string, string | null, string][] = []
      const set = (node: Element, name: string, value: string) => {
        if (node.getAttribute(name) != value) {
          saved.push([node, name, node.getAttribute(name), value])
          node.setAttribute(name, value)
        }
      }
      // Take the page's controls out of the tab order, open shadow roots included
      const exclude = (parent: ParentNode) => {
        for (const node of Array.from(parent.querySelectorAll(FOCUSABLE)))
          if (!host.contains(node)) set(node, 'tabindex', '-1')
        for (const node of Array.from(parent.querySelectorAll('*')))
          if (node != host && !host.contains(node) && node.shadowRoot) exclude(node.shadowRoot)
      }
      const hideBackground = () => {
        const parent = host.parentElement
        if (!parent) return cancel()
        for (const node of Array.from(parent.children))
          if (node != host) {
            set(node, 'aria-hidden', 'true')
            set(node, 'inert', '')
          }
        exclude(parent)
      }
      // The sheet's controls in tab order; equal tabindex values keep document order (sort may be unstable)
      const tabbable = () =>
        Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
          .filter((node) => {
            if (node.tabIndex < 0 || node.matches(':disabled') || node.closest('[hidden],[inert]')) return false
            for (let p: HTMLElement | null = node; p && p != dialog; p = p.parentElement) {
              const s = doc.defaultView!.getComputedStyle(p)
              if (s.display == 'none' || s.visibility == 'hidden') return false
            }
            return true
          })
          .map((node, index) => ({ node, index }))
          .sort((a, b) => (a.node.tabIndex || Infinity) - (b.node.tabIndex || Infinity) || a.index - b.index)
          .map((e) => e.node)
      const inside = () => dialog.contains(active(doc)) && (!frame || document.activeElement == frame)
      const focusSheet = () => {
        focus(frame || null)
        initial.focus()
      }
      let redirecting = false
      const keepFocus = () => {
        if (host.parentNode && !redirecting && !inside()) {
          redirecting = true
          focusSheet()
          redirecting = false
        }
      }
      const keydown = (e: KeyboardEvent) => {
        const key = e.key || ({ 9: 'Tab', 27: 'Escape' } as Record<number, string>)[e.keyCode]
        if (key == 'Escape' || key == 'Esc') {
          e.preventDefault()
          e.stopPropagation()
          cancel()
        } else if (key == 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          const list = tabbable()
          const i = list.indexOf(active(doc) as HTMLElement)
          const next =
            i < 0 ? (e.shiftKey ? list.length - 1 : 0) : (i + (e.shiftKey ? list.length - 1 : 1)) % list.length
          focus(list.length ? list[next] : initial)
        } else if (!inside()) {
          // A script moved focus to the page, or the page got the key event
          e.preventDefault()
          e.stopPropagation()
          keepFocus()
        }
      }
      const backdrop = (e: MouseEvent) => {
        if (e.target == overlay) cancel()
      }
      const html = document.documentElement.style
      const overflow = html.getPropertyValue('overflow')
      const priority = html.getPropertyPriority('overflow')
      html.setProperty('overflow', 'hidden', 'important')
      const observer = typeof MutationObserver == 'function' ? new MutationObserver(hideBackground) : undefined

      cleanup = () => {
        observer?.disconnect()
        docs.forEach((d) => {
          d.removeEventListener('keydown', keydown, true)
          d.removeEventListener('focusin', keepFocus, true)
        })
        overlay.removeEventListener('click', backdrop)
        for (let i = saved.length - 1; i >= 0; i--) {
          const [node, name, value, assigned] = saved[i]
          if (node.getAttribute(name) == assigned) {
            if (value == null) node.removeAttribute(name)
            else node.setAttribute(name, value)
          }
        }
        if (html.getPropertyValue('overflow') == 'hidden') {
          if (overflow) html.setProperty('overflow', overflow, priority)
          else html.removeProperty('overflow')
        }
        // Back to where focus was, if it is still in the page
        let node: Node | null = previous
        while (node && node != document) node = node.parentNode || (node as ShadowRoot).host
        if (node) focus(previous)
      }

      focusSheet()
      hideBackground()
      observer?.observe(host.parentNode!, { childList: true, subtree: true })
      docs.forEach((d) => {
        d.addEventListener('keydown', keydown, true)
        d.addEventListener('focusin', keepFocus, true)
      })
      overlay.addEventListener('click', backdrop)
    },
    close(dialog) {
      if (!dialog.hasAttribute('open')) return
      dialog.removeAttribute('open')
      dialog.dispatchEvent(new Event('close'))
    },
    remove() {
      // Focus goes back to the page once the sheet is gone (a focused frame would keep it otherwise)
      host.remove()
      cleanup()
      cleanup = () => {}
    },
  }
}
