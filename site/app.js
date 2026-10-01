// Docs site and playground. Uses the built library from ./lib (copied from dist/ by scripts/site.mjs).
import * as W from './lib/full.js'
import { SITE_LANGS, T } from './i18n.js'

const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const h = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

// The library itself: navigator.share() everywhere, defaults from the viewer's language
W.polyfill()

// Site theme: the system's, unless chosen with the button (applied early by the script in <head>)
const darkQuery = matchMedia('(prefers-color-scheme: dark)')
const theme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light')
/** Our logo, the favicon: the same in both themes. */
const logo = () => Object.assign(h('img', 'logo'), { src: 'icon.svg', alt: '' })

const KEYS = ['share', 'close', 'copy', 'copyLink', 'copied', 'qr', 'email', 'sms', 'print', 'more', 'back']
const ACTIONS = ['copy', 'save', 'qr', 'email', 'sms', 'print', 'more']
const LOCALES = Object.fromEntries(W.locales.map((l) => [l.slice(0, l.indexOf('|')), l]))
const localeExport = (code) =>
  code.replace(/-(\w+)/, (_, s) => (s.length == 2 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1)))

/* ------------------------------------------------------------------ i18n */

let L = 'en'
try {
  L = localStorage.getItem('wsp-site-lang') || ''
} catch {}
if (!T[L]) L = W.match(T, W.languages()) || 'en'

const t = (k) => T[L][k] ?? T.en[k] ?? k
// Chinese names always say which script: 简体中文, 繁體中文 (the codes stay zh and zh-hant)
const TAGS = { zh: 'zh-Hans', 'zh-hant': 'zh-Hant' }
// Native names missing from Chrome's language data, which falls back to English for these
const NATIVE = {
  be: 'Беларуская',
  eu: 'Euskara',
  gl: 'Galego',
  hy: 'Հայերեն',
  is: 'Íslenska',
  ka: 'ქართული',
  km: 'ខ្មែរ',
  mk: 'Македонски',
  mn: 'Монгол',
  my: 'မြန်မာ',
  ne: 'नेपाली',
  si: 'සිංහල',
  sq: 'Shqip',
}
const displayName = (code, inLang = L) => {
  try {
    const n = new Intl.DisplayNames([inLang], { type: 'language' }).of(TAGS[code] || code)
    return n && n.toLowerCase() != code ? n[0].toLocaleUpperCase(inLang) + n.slice(1) : code
  } catch {
    return code
  }
}
const nativeName = (code) => NATIVE[code] || displayName(code, code)
const sheetStrings = (code) => {
  const parts = (LOCALES[code] || LOCALES.en).split('|')
  return Object.fromEntries(KEYS.map((k, i) => [k, parts[i + 1]]))
}
const htmlLang = (code) => ({ zh: 'zh-CN', 'zh-hant': 'zh-TW' })[code] || code

/** Label of a target in the given sheet language. */
const targetName = (target, code = L) =>
  typeof target.name == 'function'
    ? target.name({ title: '', text: '', url: 'x', files: [new File([], 'photo.jpg')] }, sheetStrings(code))
    : target.names?.[W.match(target.names, [code])] || target.name

/** Small colored tile with the target's icon. */
const tile = (target) => {
  const el = h('span', 'tile')
  if (target.color) {
    el.style.background = target.color
    const n = parseInt(target.color.slice(1).replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16)
    el.style.color = (n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 186 ? '#000' : '#fff'
  }
  el.appendChild(W.icon(target.icon, target.stroke, target.box))
  return el
}

/* ------------------------------------------------------- Code highlighting */

const TOKENS =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('[^'\n]*'|"[^"\n]*"|`[^`]*`)|(<\/?[\w-]+|\/?>)|\b(import|from|export|const|await|async|function|return|new|true|false)\b/g
const highlight = (src) => {
  const frag = document.createDocumentFragment()
  let last = 0
  for (const m of src.matchAll(TOKENS)) {
    frag.append(src.slice(last, m.index))
    const cls = m[1] ? 't-com' : m[2] ? 't-str' : m[3] ? 't-tag' : 't-kw'
    frag.append(h('span', cls, m[0]))
    last = m.index + m[0].length
  }
  frag.append(src.slice(last))
  return frag
}
for (const pre of $$('pre[data-code]')) {
  const src = pre.textContent
  pre.replaceChildren(highlight(src))
}

/* ------------------------------------------------------------ Copy buttons */

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]')
  if (!btn) return
  const text = document.getElementById(btn.dataset.copy).textContent
  try {
    await navigator.clipboard.writeText(text)
    btn.textContent = t('copied')
  } catch {
    getSelection().selectAllChildren(document.getElementById(btn.dataset.copy))
  }
  setTimeout(() => (btn.textContent = t('copy')), 1500)
})

/* Click to copy: option names, target ids, language codes */

const copyText = async (text, el) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  // A "Copied" bubble above the element
  el.dataset.copied = t('copied')
  clearTimeout(el.copiedTimer)
  el.copiedTimer = setTimeout(() => delete el.dataset.copied, 1200)
}
/** A button that copies `text`, showing `content` (the text itself by default). */
const copyButton = (text, content = text) => {
  const b = h('button', 'cp')
  b.type = 'button'
  b.append(content)
  b.dataset.text = text
  b.onclick = () => copyText(text, b)
  return b
}
/** Make the option names copyable (once), and label every copy button in the site language. */
const renderCopyables = () => {
  for (const code of $$('#options tbody td:first-child > code'))
    code.replaceWith(copyButton(code.textContent, code.cloneNode(true)))
  for (const b of $$('.cp')) {
    b.title = t('copy')
    b.setAttribute('aria-label', `${t('copy')}: ${b.dataset.text}`)
  }
}

// A copy button on every code block of the page (the playground makes its own)
$$('main pre.code').forEach((pre, i) => {
  pre.id ||= 'code-' + i
  const wrap = h('div', 'code-wrap')
  pre.replaceWith(wrap)
  const copy = h('button', 'copy code-copy', t('copy'))
  copy.type = 'button'
  copy.dataset.copy = pre.id
  copy.dataset.t = 'copy'
  wrap.append(pre, copy)
})

/* ------------------------------------------------------- Package managers */

// Yarn is the one without `i`: `yarn install <pkg>` doesn't add a package
const PMS = { npm: 'npm i', yarn: 'yarn add', pnpm: 'pnpm i', bun: 'bun i' }
let PM = 'npm'
try {
  PM = localStorage.getItem('wsp-site-pm') || PM
} catch {}
if (!PMS[PM]) PM = 'npm'
const installCmd = () => PMS[PM] + ' web-share-polyfill'

/** Fill `seg` with one radio per package manager (a new group when omitted). Every install command follows it. */
const pmPicker = (name, seg = h('div', 'seg sm pm')) => {
  seg.setAttribute('role', 'radiogroup')
  seg.setAttribute('aria-label', t('pm_label'))
  seg.replaceChildren(
    ...Object.keys(PMS).map((pm) => {
      const input = h('input')
      Object.assign(input, { type: 'radio', name, value: pm, checked: pm == PM })
      input.onchange = () => setPm(pm)
      const label = h('label')
      label.append(input, h('span', '', pm))
      return label
    }),
  )
  return seg
}

const renderInstall = () => {
  $('#install-cmd').textContent = $('#usage-install').textContent = installCmd()
  pmPicker('pm-usage', $('#pm-usage'))
}

const setPm = (pm) => {
  PM = pm
  try {
    localStorage.setItem('wsp-site-pm', pm)
  } catch {}
  // The playground's code blocks are rebuilt: keep the focus on the picker that was used
  const from = document.activeElement?.name
  for (const r of $$('.pm input')) r.checked = r.value == pm
  $('#install-cmd').textContent = $('#usage-install').textContent = installCmd()
  renderCode()
  if (from) $(`input[name="${from}"]:checked`)?.focus()
}

/* --------------------------------------------------------------- Hero */

// With a native share sheet, show both sheets side by side; without one, navigator.share() opens the polyfill's
if (W.nativeShare) {
  $('#share-page').dataset.t = 'hero_native'
  $('#share-fallback').hidden = false
  $('#hero-note').dataset.t = 'hero_note_native'
}

$('#share-page').addEventListener('click', () =>
  navigator.share({ title: document.title, url: location.href }).catch(() => {}),
)
$('#share-fallback').addEventListener('click', () =>
  W.share({ title: document.title, url: location.href }, { native: false, lang: L, theme: theme() }).catch(() => {}),
)

/* ---------------------------------------------------------- Playground */

const COMMON = [
  'en',
  'zh',
  'zh-hant',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'nl',
  'ru',
  'uk',
  'pl',
  'tr',
  'ar',
  'hi',
  'id',
  'vi',
  'th',
]
const LINK_ICON = 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'
// Every target, messenger included (it needs an app id, so it is a function in the library)
const ALL = { ...W.targets, messenger: W.messenger('') }
const ORDER = [
  ...ACTIONS,
  ...Object.keys(ALL)
    .filter((id) => !ACTIONS.includes(id))
    .sort(),
]

const S = {
  install: 'npm',
  api: 'polyfill',
  // Target lists by viewer language, '*' for everyone else, in tab order; and the one being edited
  targets: {},
  edit: '*',
  appId: '',
  lmode: 'viewer',
  // The common languages by default, like /common
  langs: new Set(COMMON),
  fallback: 'en',
  one: 'en',
  look: '',
  theme: '',
  accent: '',
  radius: '',
  native: true,
  // Add web-share-polyfill/legacy (npm: the script tag has it)
  legacy: false,
  // UI text overrides by language, '*' for all of them; and the one being edited
  strings: { '*': {} },
  sedit: '*',
  // The language to preview the sheet in, as a viewer of it would see it ('' for the browser's)
  plang: '',
}

const radio = (name) => $(`input[name="${name}"]:checked`).value
const own = () => {
  const id = $('#p-own-id').value.trim() || 'mysite'
  const icon = $('#p-own-icon').value.trim()
  const url = $('#p-own-url').value.trim()
  return {
    id,
    name: $('#p-own-name').value.trim() || id,
    color: $('#p-own-color').value,
    icon: icon || LINK_ICON,
    stroke: !icon,
    url: (d) => url.replace(/\{(url|title|text)\}/g, (_, k) => encodeURIComponent(d[k])),
    tpl: url,
  }
}
const ownOn = () => $('#p-own-on').checked
const defaultTargets = () => Object.fromEntries(Object.entries(W.defaults).map(([k, ids]) => [k, [...ids]]))
S.targets = defaultTargets()
const sorted = (lists) => JSON.stringify(Object.entries(lists).sort())
const isDefault = () => sorted(S.targets) == sorted(W.defaults)
const pick = (codes) => Object.fromEntries(codes.map((code) => [code, [...W.defaults[code]]]))
const PRESETS = {
  default: defaultTargets,
  simple: () => pick(['*']),
  minimal: () => ({ '*': ['copy', 'save', 'qr', 'email', 'sms', 'more'] }),
}
/** Quick presets: languages and target lists together. `langs` are the locales besides English. */
const QUICK = {
  default: { langs: COMMON.filter((c) => c != 'en') },
  en: { langs: [] },
  // weea and efc are measured by scripts/build.mjs: keep their languages in sync there
  weea: { langs: ['fr', 'de', 'it', 'es', 'pt', 'zh', 'zh-hant', 'ja', 'ko'] },
  efc: { langs: ['fr', 'zh', 'zh-hant'] },
  // Every language and the default targets
  all: { langs: Object.keys(LOCALES).filter((c) => c != 'en') },
}
const quickLangs = (q) => new Set(['en', ...QUICK[q].langs])
// The default lists of the preset's languages (just "All languages" for English only)
const quickTargets = (q) =>
  q == 'default' || q == 'all' ? defaultTargets() : pick(['*', ...QUICK[q].langs.filter((code) => W.defaults[code])])
/** The ready-made entry (/common, /all, /simple) the settings are exactly, if any. */
const readyEntry = () => {
  if (ownOn() || S.lmode != 'viewer' || S.fallback != 'en' || S.look || S.theme || !S.native || stringSets().length)
    return
  const q = quick()
  return { default: 'common', all: 'all', en: 'simple' }[q]
}

/** The quick preset the settings match, if any. */
const quick = () =>
  Object.keys(QUICK).find((q) => {
    const langs = quickLangs(q)
    return (
      S.lmode == 'viewer' &&
      langs.size == S.langs.size &&
      [...langs].every((c) => S.langs.has(c)) &&
      sorted(quickTargets(q)) == sorted(S.targets)
    )
  })

/** The preset the lists match, if any. */
const preset = () => Object.keys(PRESETS).find((k) => sorted(PRESETS[k]()) == sorted(S.targets))
/** Every target used by any list. */
const allIds = () => [...new Set(Object.values(S.targets).flat())]
/** Language for target names in the editor: the list's own, or the one the sheet would use. */
const nameLang = () => (S.edit != '*' ? S.edit : S.lmode == 'one' ? S.one : L)
const langList = () => (S.lmode == 'one' ? [S.one] : [...S.langs])

/** Data the test button shares: empty fields fall back to this page. */
const sample = () => {
  const files = [...$('#p-files').files]
  // With files, only the fields filled in: to try sharing nothing but files
  if (files.length) {
    return {
      files,
      ...($('#p-title').value && { title: $('#p-title').value }),
      ...($('#p-text').value && { text: $('#p-text').value }),
      ...($('#p-url').value && { url: new URL($('#p-url').value, location.href).href }),
    }
  }
  return {
    title: $('#p-title').value || document.title,
    ...($('#p-text').value && { text: $('#p-text').value }),
    url: new URL($('#p-url').value || location.href, location.href).href,
  }
}

/** Options for the live sheet (the full build, which takes ids). */
const liveOptions = () => {
  // The same setup as the code: every list, matched with the viewer's language
  const resolve = (ids) => {
    const list = ids.map((id) => (id == 'messenger' ? W.messenger(S.appId || '0') : id))
    if (ownOn()) list.push(own())
    return list
  }
  const lists = Object.entries(S.targets)
  const o = {
    targets:
      lists.length == 1 ? resolve(lists[0][1]) : Object.fromEntries(lists.map(([code, ids]) => [code, resolve(ids)])),
  }
  if (S.lmode == 'one') Object.assign(o, { lang: S.one, locales: [S.one] })
  // Previewing as a viewer of another language (only here: in the code, each viewer's browser decides)
  else Object.assign(o, { locales: [...S.langs], fallback: S.fallback }, S.plang && { lang: S.plang })
  if (S.look) o.look = S.look
  // The sheet follows the site's theme unless the playground sets one
  o.theme = S.theme || theme()
  if (!S.native) o.native = false
  const strings = Object.fromEntries(stringSets())
  if (Object.keys(strings).length) o.strings = strings
  return o
}

/** Why a target won't show in this browser with the test data, if it won't: a key of the hid_* strings. */
const hiddenWhy = (x) => {
  const s = sample()
  const d = { title: s.title || '', text: s.text || '', url: s.url || '', files: s.files || [] }
  const text = d.title || d.text || d.url
  if ((d.files.length && x.files?.(d.files)) || (text && (!x.when || x.when(d)) && (!x.url || x.url(d)))) return
  const why = { more: 'more', sms: 'sms', print: 'print', kakaotalk: 'kakaotalk', save: 'save' }[x.id]
  // With nothing but files, print is hidden for the data, not for the page
  return why && (text || why != 'print') ? why : 'data'
}

/** Theme variables are inherited by the sheet, so set them on the page. */
const applyStyle = () => {
  const root = document.documentElement.style
  S.accent ? root.setProperty('--wsp-accent', S.accent) : root.removeProperty('--wsp-accent')
  S.radius ? root.setProperty('--wsp-radius', S.radius) : root.removeProperty('--wsp-radius')
}

/* ---- Target lists */

/**
 * Language tabs for settings by language (target lists, UI text): "All languages" ('*'), the languages
 * added, a select to add one. `sets` is the object keyed by language; `key` its field in `S`.
 */
const langTabs = (box, sets, edit, pick, init) => {
  const choose = (code) => {
    pick(code)
    renderPlayground()
    $('[aria-pressed="true"]', box).focus()
  }
  const tabs = Object.keys(sets).map((code) => {
    const tab = h('span', 'ltab')
    const b = h('button', '', code == '*' ? t('targets_all') : nativeName(code))
    b.type = 'button'
    b.setAttribute('aria-pressed', code == edit)
    if (code != '*') b.lang = htmlLang(code)
    b.onclick = () => choose(code)
    tab.append(b)
    if (code != '*') {
      const x = h('button', 'ltab-x', '×')
      x.type = 'button'
      x.title = t('remove')
      x.setAttribute('aria-label', `${t('remove')}: ${nativeName(code)}`)
      x.onclick = () => {
        delete sets[code]
        choose('*')
      }
      tab.append(x)
    }
    return tab
  })
  // Add a language: a text field with the languages to pick from, filtered as one types (by name or code)
  const codes = sortedCodes().filter((code) => !(code in sets))
  const list = h('datalist')
  list.id = box.id + '-add'
  list.append(...codes.map((code) => Object.assign(h('option'), { value: langOption(code) })))
  const add = h('input', 'ltab-add')
  Object.assign(add, { type: 'text', placeholder: '+ ' + t('targets_add') })
  add.setAttribute('list', list.id)
  add.setAttribute('aria-label', t('targets_add'))
  add.onchange = () => {
    const code = langFromField(add.value, codes)
    if (!code) return
    sets[code] = init(code)
    choose(code)
  }
  box.replaceChildren(...tabs, add, list)
}

const renderTargets = () => {
  if (!S.targets[S.edit]) S.edit = '*'
  const nl = nameLang()
  // A new language starts from its own defaults (WeChat… for Chinese), or from the list everyone else gets
  langTabs(
    $('#p-tlangs'),
    S.targets,
    S.edit,
    (code) => (S.edit = code),
    (code) => [...(W.defaults[code] || S.targets['*'])],
  )
  $('#p-presets').setAttribute('aria-label', t('preset_label'))
  const current = preset()
  for (const r of $$('input[name="p-preset"]')) r.checked = r.value == current
  $('#p-preset-hint').textContent = t(`preset_${current || 'custom'}_hint`)

  $('#p-quick').setAttribute('aria-label', t('qp_title'))
  const q = quick()
  for (const r of $$('input[name="p-quick"]')) {
    r.checked = r.value == q
    r.parentElement.title = t(`qp_${r.value}_hint`)
  }
  $('#p-quick-hint').textContent = q ? t(`qp_${q}_hint`) : ''

  const ids = S.targets[S.edit]
  $('#p-selected').replaceChildren(
    ...ids.map((id, i) => {
      const x = ALL[id]
      const li = h('li')
      li.append(tile(x), h('span', 'name', targetName(x, nl)))
      // Targets that hide themselves in this browser or for this data, and why
      const why = hiddenWhy(x)
      if (why) {
        li.classList.add('off')
        li.append(h('span', 'hid', t('hid_' + why)))
      }
      li.append(h('span', 'id', id))
      const btn = (label, text, fn, disabled) => {
        const b = h('button', 'mini', text)
        b.type = 'button'
        b.setAttribute('aria-label', t(label))
        b.title = t(label)
        b.disabled = disabled
        b.onclick = () => {
          fn()
          renderPlayground()
        }
        return b
      }
      const swap = (j) => ([ids[i], ids[j]] = [ids[j], ids[i]])
      li.append(
        btn('move_up', '↑', () => swap(i - 1), i == 0),
        btn('move_down', '↓', () => swap(i + 1), i == ids.length - 1),
        btn('remove', '×', () => ids.splice(i, 1)),
      )
      return li
    }),
  )
  $('#p-available').replaceChildren(
    ...ORDER.filter((id) => !ids.includes(id)).map((id) => {
      const chip = h('button', 'chip')
      chip.type = 'button'
      chip.dataset.id = id
      chip.append(tile(ALL[id]), targetName(ALL[id], nl))
      chip.onclick = () => {
        ids.push(id)
        renderPlayground()
      }
      return chip
    }),
  )
  $('#p-appid-field').hidden = !allIds().includes('messenger')
}

/* ---- Languages */

const renderLangPicks = () => {
  const codes = sortedCodes()
  $('#p-lviewer').hidden = S.lmode == 'one'
  $('#p-lone').hidden = S.lmode != 'one'
  $('#p-langs').replaceChildren(
    ...codes.map((code) => {
      const l = h('label', 'pick')
      const box = h('input')
      box.type = 'checkbox'
      box.checked = code == 'en' || S.langs.has(code)
      box.disabled = code == 'en'
      box.onchange = () => {
        box.checked ? S.langs.add(code) : S.langs.delete(code)
        if (!S.langs.has(S.fallback)) S.fallback = 'en'
        renderPlayground()
      }
      const name = h('span', '', nativeName(code))
      name.lang = htmlLang(code)
      l.append(box, name, h('code', '', code))
      l.dataset.search = langSearchText(code)
      return l
    }),
  )
  $('#p-lsearch').placeholder = t('langs_search')
  $('#p-lsearch').setAttribute('aria-label', t('langs_search'))
  filterPicks()
  $('#p-lcount').textContent = `${S.langs.size} / ${codes.length}`
  const fill = (select, list, value) => {
    select.replaceChildren(
      ...list.map((code) => {
        const o = h('option', '', `${nativeName(code)} (${code})`)
        o.value = code
        return o
      }),
    )
    select.value = value
  }
  fill(
    $('#p-fallback'),
    codes.filter((c) => S.langs.has(c)),
    S.fallback,
  )
  // One language: a text field with the languages to pick from, filtered as one types
  $('#p-one-list').replaceChildren(...codes.map((code) => Object.assign(h('option'), { value: langOption(code) })))
  if (document.activeElement != $('#p-one')) $('#p-one').value = langOption(S.one)
  // Preview language: not for one language, which is fixed
  $('#p-plang-field').hidden = S.lmode == 'one'
  // Empty: the browser's languages
  $('#p-plang-list').replaceChildren(...codes.map((code) => Object.assign(h('option'), { value: langOption(code) })))
  if (document.activeElement != $('#p-plang')) $('#p-plang').value = S.plang ? langOption(S.plang) : ''
}

/** "日本語 (ja)": how the searchable language fields show a language. */
const langOption = (code) => `${nativeName(code)} (${code})`
/** The language a searchable field's text is ("日本語 (ja)", or just "ja"), if any. */
const langFromField = (value, codes = sortedCodes()) => {
  const v = value.trim().toLowerCase()
  return codes.find((c) => langOption(c).toLowerCase() == v || c == v)
}
/** Everything a language can be searched by: its names (native, in the site language, in English) and code. */
const langSearchText = (code) =>
  [nativeName(code), displayName(code), displayName(code, 'en'), code].join(' ').toLowerCase()
/** Show the language checkboxes that match the search. */
const filterPicks = () => {
  const q = $('#p-lsearch').value.trim().toLowerCase()
  for (const l of $$('#p-langs .pick')) l.hidden = q && !l.dataset.search.includes(q)
}
$('#p-lsearch').addEventListener('input', filterPicks)
$('#p-one').addEventListener('focus', (e) => e.target.select())
$('#p-plang').addEventListener('focus', (e) => e.target.select())
$('#p-plang').addEventListener('change', (e) => {
  // Empty: the browser's languages; otherwise a language, if it is one
  const v = e.target.value.trim()
  S.plang = v ? langFromField(v) || S.plang : ''
  e.target.value = S.plang ? langOption(S.plang) : ''
})
$('#p-one').addEventListener('change', (e) => {
  const code = langFromField(e.target.value)
  if (code) S.one = code
  e.target.value = langOption(S.one)
  renderPlayground()
})

/* ---- UI text overrides */

const renderStrings = () => {
  if (!S.strings[S.sedit]) S.sedit = '*'
  langTabs(
    $('#p-stabs'),
    S.strings,
    S.sedit,
    (code) => (S.sedit = code),
    () => ({}),
  )
  // Placeholders: the strings the sheet would show in that language
  const lang = S.sedit != '*' ? S.sedit : S.lmode == 'one' ? S.one : S.fallback
  const current = sheetStrings(lang)
  const box = $('#p-strings')
  if (!box.children.length) {
    for (const k of KEYS) {
      const f = h('label', 'field')
      const input = h('input')
      input.type = 'text'
      input.id = 'p-str-' + k
      input.oninput = () => {
        S.strings[S.sedit][k] = input.value
        renderCode()
      }
      f.append(h('span', 'mono', k), input)
      box.append(f)
    }
  }
  for (const k of KEYS) {
    const input = $('#p-str-' + k)
    input.placeholder = current[k]
    input.value = S.strings[S.sedit][k] || ''
    input.lang = htmlLang(lang)
  }
}

/** The UI text overrides filled in: one set when only "All languages" has some, sets by language otherwise. */
const stringSets = () =>
  Object.entries(S.strings)
    .map(([code, set]) => [code, Object.fromEntries(Object.entries(set).filter(([, v]) => v))])
    .filter(([, set]) => Object.keys(set).length)

/* ---- Code */

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const varName = (id) => {
  const v = id.replace(/[^A-Za-z0-9_$]+(.)?/g, (_, c = '') => c.toUpperCase()).replace(/^[^A-Za-z_$]+/, '')
  return v || 'custom'
}
let meta = { version: '' }

/** `import { a, b } from 'x'`, wrapped when long. */
const importLine = (names, from) => {
  const line = `import { ${names.join(', ')} } from '${from}'`
  if (line.length <= 100) return line
  const rows = ['']
  for (const n of names) {
    if (rows.at(-1).length + n.length > 90) rows.push('')
    rows[rows.length - 1] += n + ', '
  }
  return `import {\n${rows.map((r) => '  ' + r.trim()).join('\n')}\n} from '${from}'`
}

/** What the code imports: a ready-made entry ('common', 'all', 'simple'), 'small' (tree-shaken) or 'script'. */
let entry = ''

const genCode = () => {
  const npm = S.install == 'npm'
  const call = S.api == 'call'
  const lib = npm ? '' : 'WebSharePolyfill.' // script tag: everything is on window.WebSharePolyfill
  // Settings that are exactly a ready-made entry: one line; otherwise, only what is picked
  const ready = npm ? readyEntry() : undefined
  const treeShaken = npm && !ready
  const ids = allIds()
  const msg = `${lib}messenger(${q(S.appId || 'YOUR_FACEBOOK_APP_ID')})`
  const o = ownOn() ? own() : null
  const ownVar = o && varName(o.id)

  // targets: imported objects with npm, ids with the script tag (which has the defaults built in)
  let targets = null
  if (treeShaken || o || !isDefault()) {
    const list = (ids) =>
      `[${[...ids.map((id) => (id == 'messenger' ? msg : treeShaken ? id : q(id))), ...(o ? [ownVar] : [])].join(', ')}]`
    const lists = Object.entries(S.targets)
    targets =
      lists.length == 1
        ? list(lists[0][1])
        : `{\n${lists.map(([code, ids]) => `    ${/^[a-z]+$/.test(code) ? code : q(code)}: ${list(ids)},`).join('\n')}\n  }`
  }

  // languages
  const codes = sortedCodes()
  const all = S.lmode == 'viewer' && codes.every((c) => c == 'en' || S.langs.has(c))
  const picked = langList().filter((c) => c != 'en')
  let locales = null
  let localeImport = null
  if (treeShaken) {
    if (all) {
      localeImport = `import * as locales from 'web-share-polyfill/locales'`
      locales = 'Object.values(locales)'
    } else if (picked.length) {
      const names = picked.map(localeExport)
      localeImport = importLine(names, 'web-share-polyfill/locales')
      locales = `[${names.join(', ')}]`
    }
  } else if (!all) locales = `[${picked.map(q).join(', ')}]`

  const opts = [] // [code, comment]
  if (targets) opts.push([`targets: ${targets}`])
  if (locales) opts.push([`locales: ${locales}`, treeShaken && !all && '// English is built in'])
  if (S.lmode == 'one') opts.push([`lang: ${q(S.one)}`])
  else if (S.fallback != 'en') opts.push([`fallback: ${q(S.fallback)}`, '// when no viewer language is available'])
  if (S.look) opts.push([`look: ${q(S.look)}`])
  if (S.theme) opts.push([`theme: ${q(S.theme)}`])
  if (!S.native) opts.push(['native: false', '// always show this sheet'])
  const sets = stringSets()
  const set = (o) =>
    `{ ${Object.entries(o)
      .map(([k, v]) => `${k}: ${q(v)}`)
      .join(', ')} }`
  if (sets.length == 1 && sets[0][0] == '*') opts.push([`strings: ${set(sets[0][1])}`])
  else if (sets.length) {
    const key = (code) => (/^[a-z]+$/.test(code) ? code : q(code))
    opts.push([`strings: {\n${sets.map(([code, o]) => `    ${key(code)}: ${set(o)},`).join('\n')}\n  }`])
  }
  // A ready-made entry is these settings already: no options
  const optBlock =
    !ready && opts.length
      ? `{\n${opts.map(([code, comment]) => `  ${code},${comment ? ' ' + comment : ''}`).join('\n')}\n}`
      : ''

  const data = [
    `title: ${$('#p-title').value ? q($('#p-title').value) : 'document.title'}`,
    ...($('#p-text').value ? [`text: ${q($('#p-text').value)}`] : []),
    `url: ${$('#p-url').value ? q($('#p-url').value) : 'location.href'}`,
  ]
  const dataStr = `{ ${data.join(', ')} }`

  const body = []
  if (o) {
    const tpl = o.tpl
      .replace(/[`\\]|\$\{/g, (m) => '\\' + m)
      .replace(/\{(url|title|text)\}/g, '${encodeURIComponent(d.$1)}')
    body.push(
      `const ${ownVar} = {`,
      `  id: ${q(o.id)},`,
      `  name: ${q(o.name)},`,
      `  color: ${q(o.color)},`,
      `  icon: ${q(o.icon)},`,
      ...(o.stroke ? ['  stroke: true,'] : []),
      `  url: (d) => \`${tpl}\`,`,
      '}',
      '',
    )
  }
  const button = npm ? `document.querySelector('#share')` : `document.getElementById('share')`
  if (call) {
    if (optBlock) body.push(`const options = ${optBlock}`, '')
    body.push(
      `${button}.addEventListener('click', async () => {`,
      '  try {',
      `    const id = await ${lib}share(${dataStr}${optBlock ? ', options' : ''})`,
      `    console.log('Shared with', id) // 'native', 'copy', 'x'…`,
      '  } catch {',
      '    // Closed without sharing (AbortError)',
      '  }',
      '})',
    )
  } else {
    // The script tag and the ready-made entries install the polyfill: call polyfill() only to configure it
    if (treeShaken || optBlock) body.push(`${lib}polyfill(${optBlock})`, '')
    body.push(`${button}.addEventListener('click', () => {`, `  navigator.share(${dataStr}).catch(() => {})`, '})')
  }

  const css = [S.accent && `  --wsp-accent: ${S.accent};`, S.radius && `  --wsp-radius: ${S.radius};`].filter(Boolean)
  const blocks = []
  if (npm) {
    const fn = call ? 'share' : 'polyfill'
    let head
    if (treeShaken) {
      entry = 'small'
      head = [`import { ${fn} } from 'web-share-polyfill'`]
      if (ids.length) head.push(importLine(ids, 'web-share-polyfill/targets'))
      if (localeImport) head.push(localeImport)
    } else {
      // A ready-made entry installs the polyfill, and exports share() with the same defaults
      entry = ready
      head = [call ? `import { share } from 'web-share-polyfill/${ready}'` : `import 'web-share-polyfill/${ready}'`]
    }
    if (S.legacy) head.push(`import 'web-share-polyfill/legacy' // older browsers`)
    blocks.push(['Terminal', installCmd()])
    blocks.push(['JavaScript', [...head, '', ...body].join('\n')])
    blocks.push(['HTML', '<button id="share" type="button">Share</button>'])
    if (css.length) blocks.push(['CSS', ['web-share-polyfill {', ...css, '}'].join('\n')])
  } else {
    entry = 'script'
    const v = meta.version && meta.version != '0.0.0' ? '@' + meta.version : ''
    const html = ['<button id="share" type="button">Share</button>', '']
    if (css.length) html.push('<style>', '  web-share-polyfill {', ...css.map((x) => '  ' + x), '  }', '</style>')
    html.push(
      `<script src="https://cdn.jsdelivr.net/npm/web-share-polyfill${v}/dist/web-share-polyfill.js"></script>`,
      '<script>',
      ...body
        .join('\n')
        .split('\n')
        .map((x) => (x ? '  ' + x : x)),
      '</script>',
    )
    blocks.push(['HTML', html.join('\n')])
  }
  return blocks
}

const renderCode = () => {
  const box = $('#p-code')
  box.replaceChildren(
    ...genCode().map(([label, code], i) => {
      const wrap = h('div', 'code-block')
      const head = h('div', 'code-head')
      const pre = h('pre', 'code')
      pre.id = 'p-code-' + i
      pre.append(highlight(code))
      const copy = h('button', 'copy', t('copy'))
      copy.type = 'button'
      copy.dataset.copy = pre.id
      // The install command gets the package manager picker in place of its label
      head.append(label == 'Terminal' ? pmPicker('pm-play') : h('span', '', label), copy)
      wrap.append(head, pre)
      return wrap
    }),
  )
  renderSize()
}

/* ---- Size estimate */

/** The gzip size of the tree-shaken code, in bytes, and whether the build measured it (or it is estimated). */
const smallestSize = () => {
  const P = sizes.parts
  const ids = allIds()
  // Setups the build measured: no need to estimate them
  const minimal = ['copy', 'save', 'qr', 'email', 'sms', 'more']
  if (!ownOn() && langList().length == 1 && ids.length == minimal.length && minimal.every((id) => ids.includes(id)))
    return [sizes.minimal.gzip, true]
  const q = !ownOn() && quick()
  if (q) return [(sizes.quick[q] || sizes[{ default: 'common', all: 'all', en: 'simple' }[q]]).gzip, true]
  let add = ids.reduce((a, id) => a + (P.targets[id] || 0), 0)
  if (ids.includes('qr') && ids.includes('wechat')) add -= P.qrShared
  if (ownOn()) add += 180
  // Parts compress better together, the more of them there are: the build measured the gain for the
  // typical targets, all targets and all languages; interpolate on a log scale, where most of the gain
  // comes with the first few
  const between = (n, n0, s0, n1, s1) => (n <= n0 ? s0 : s0 + ((s1 - s0) * Math.log(n / n0)) / Math.log(n1 / n0))
  add *= between(ids.length, 8, P.scale, Object.keys(P.targets).length, P.targetScale)
  const langs = langList().filter((c) => P.locales[c])
  const langScale = between(langs.length, 1, 1, Object.keys(P.locales).length, P.localeScale)
  add += langs.reduce((a, c) => a + P.locales[c], 0) * langScale
  return [sizes.core.gzip + add, false]
}

const renderSize = () => {
  if (!sizes) return
  const kb = (n) => (n / 1024).toFixed(1) + ' KB'
  // /legacy on top of an npm setup: what it adds to the core
  const extra = S.legacy && entry != 'script' ? sizes.legacy.gzip - sizes.core.gzip : 0
  if (entry == 'small' || extra) {
    const [bytes, measured] = entry == 'small' ? smallestSize() : [sizes[entry].gzip, true]
    $('#p-size').textContent = (measured && !extra ? '' : '≈ ') + kb(bytes + extra)
    $('#p-size-note').textContent = t(measured && !extra ? 'size_measured_note' : 'size_npm_note')
    return
  }
  $('#p-size').textContent = kb((entry == 'script' ? sizes.script : sizes[entry]).gzip)
  $('#p-size-note').textContent = entry == 'script' ? t('size_html') : fmt(t('size_ready_note'), { name: entry })
}

const renderPlayground = () => {
  S.install = radio('p-install')
  S.api = radio('p-api')
  S.lmode = radio('p-lmode')
  $('#p-legacy-row').hidden = S.install != 'npm'
  $('#p-api-hint').textContent = t(S.api == 'call' ? 'api_call_hint' : 'api_polyfill_hint')
  renderTargets()
  renderLangPicks()
  renderStrings()
  applyStyle()
  renderCode()
}

const setResult = (cls, label, value) => {
  const out = $('#p-result')
  out.classList.remove('muted')
  out.replaceChildren(h('span', cls, label), value ? ' ' : '', value ? h('code', '', value) : '')
}

$('#p-open').addEventListener('click', async () => {
  try {
    const id = await W.share(sample(), liveOptions())
    setResult('ok', t('result_ok'), `'${id}'`)
  } catch (e) {
    if (e.name == 'AbortError') setResult('no', t('result_abort'))
    else setResult('no', `${t('result_error')}: ${e.name}`, e.message)
  }
})

// Wiring
for (const name of ['p-install', 'p-api', 'p-lmode']) {
  for (const r of $$(`input[name="${name}"]`)) r.addEventListener('change', renderPlayground)
}
for (const [id, key] of [
  ['p-look', 'look'],
  ['p-theme', 'theme'],
  ['p-radius', 'radius'],
  ['p-fallback', 'fallback'],
]) {
  $('#' + id).addEventListener('change', (e) => {
    S[key] = e.target.value
    renderPlayground()
  })
}
$('#p-native').addEventListener('change', (e) => {
  S.native = e.target.checked
  renderCode()
})
$('#p-legacy').addEventListener('change', (e) => {
  S.legacy = e.target.checked
  renderCode()
})
for (const r of $$('input[name="p-preset"]')) {
  r.addEventListener('change', () => {
    S.targets = PRESETS[r.value]()
    S.edit = '*'
    renderPlayground()
  })
}
$('#p-appid').addEventListener('input', (e) => {
  S.appId = e.target.value.trim()
  renderCode()
})
const accentChanged = () => {
  $('#p-accent').disabled = !$('#p-accent-on').checked
  S.accent = $('#p-accent-on').checked ? $('#p-accent').value : ''
  applyStyle()
  renderCode()
}
$('#p-accent-on').addEventListener('change', accentChanged)
$('#p-accent').addEventListener('input', accentChanged)
for (const id of ['p-own-on', 'p-own-id', 'p-own-name', 'p-own-color', 'p-own-icon', 'p-own-url']) {
  $('#' + id).addEventListener('input', renderCode)
}
// The test data decides which targets show up
for (const id of ['p-title', 'p-text', 'p-url', 'p-files']) $('#' + id).addEventListener('input', renderPlayground)
for (const r of $$('input[name="p-quick"]')) {
  r.addEventListener('change', () => {
    S.langs = quickLangs(r.value)
    S.targets = quickTargets(r.value)
    S.edit = '*'
    S.fallback = 'en'
    $('input[name="p-lmode"][value="viewer"]').checked = true
    renderPlayground()
  })
}
for (const b of $$('[data-preset]')) {
  b.addEventListener('click', () => {
    const p = b.dataset.preset
    S.langs = new Set(p == 'all' ? Object.keys(LOCALES) : p == 'common' ? COMMON : ['en'])
    if (!S.langs.has(S.fallback)) S.fallback = 'en'
    renderPlayground()
  })
}

/* ------------------------------------------------------ Reference sections */

const tryTarget = (target) =>
  W.share(sample(), { targets: [target.id], native: false, lang: L, theme: theme() }).catch(() => {})

const renderGallery = () => {
  const make = (ids, el) =>
    el.replaceChildren(
      ...ids.map((id) => {
        const target = W.targets[id]
        // Try the target, or copy its id
        const g = h('div', 'g')
        const b = h('button', 'g-try')
        b.type = 'button'
        b.append(tile(target), h('span', '', targetName(target)))
        b.onclick = () => tryTarget(target)
        const idButton = copyButton(id)
        idButton.classList.add('id')
        g.append(b, idButton)
        return g
      }),
    )
  const ids = Object.keys(W.targets)
  make(ACTIONS, $('#g-actions'))
  make(
    ids.filter((id) => !ACTIONS.includes(id)),
    $('#g-apps'),
  )
}

const renderDefaults = () => {
  $('#defaults-body').replaceChildren(
    ...Object.entries(W.defaults)
      .sort(([a], [b]) => (a == '*') - (b == '*'))
      .map(([code, ids]) => {
        const tr = h('tr')
        const name = code == '*' ? t('defaults_other') : displayName(code)
        const cell = h('td')
        for (const id of ids) {
          const s = h('span', 'dflt')
          s.append(tile(W.targets[id]), targetName(W.targets[id], code))
          cell.append(s)
        }
        tr.append(h('td', '', name), cell)
        return tr
      }),
  )
}

const sortedCodes = () => Object.keys(LOCALES).sort((a, b) => nativeName(a).localeCompare(nativeName(b), 'en'))

/** Show the languages whose name (native or in the site language) or code contain the search. */
const filterLangs = () => {
  const q = $('#langs-search').value.trim().toLowerCase()
  for (const item of $$('#langs .lang')) item.hidden = q && !item.dataset.search.includes(q)
}
$('#langs-search').addEventListener('input', filterLangs)

const renderLangs = () => {
  $('#langs-search').placeholder = t('langs_search')
  $('#langs-search').setAttribute('aria-label', t('langs_search'))
  const codes = sortedCodes()
  $('#langs').replaceChildren(
    ...codes.map((code) => {
      // Open the sheet in this language, or copy its code
      const item = h('div', 'lang')
      const b = h('button', 'lang-try', nativeName(code))
      b.type = 'button'
      b.lang = htmlLang(code)
      b.title = displayName(code)
      b.onclick = () => W.share(sample(), { lang: code, native: false, theme: theme() }).catch(() => {})
      item.append(b, copyButton(code, h('code', '', code)))
      item.dataset.search = langSearchText(code)
      return item
    }),
  )
}

let sizes
const renderSizes = async () => {
  try {
    sizes ??= await (await fetch('lib/sizes.json')).json()
  } catch {
    return
  }
  const kb = (n) => (n / 1024).toFixed(1) + ' KB'
  renderSize()
  $('#sizes-body').replaceChildren(
    ...[
      ['core', 'size_core'],
      ['minimal', 'size_minimal'],
      ['typical', 'size_typical'],
      ['simple', 'size_simple'],
      ['common', 'size_common'],
      ['all', 'size_all'],
      ['full', 'size_full'],
      ['legacy', 'size_legacy'],
      ['script', 'size_script'],
    ].map(([k, label]) => {
      const tr = h('tr')
      tr.append(
        h('td', '', t(label)),
        h('td', '', kb(sizes[k].min)),
        h('td', '', kb(sizes[k].gzip)),
        h('td', '', kb(sizes[k].brotli)),
      )
      return tr
    }),
  )
}

/* ------------------------------------------------------- Browser support */

let compat
const OSES = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }
// Short in the table, to keep it narrow; the full names are in the title and for screen readers
const OS_SHORT = { windows: 'Win', macos: 'Mac', linux: 'Linux' }
const fmt = (s, values) => s.replace(/\{(\w+)\}/g, (_, k) => values[k])

/** A cell: what the browser does alone (front), and what it does with the polyfill (back), if that differs. */
const compatCell = (front, back, i) => {
  const td = h('td', 'cc')
  const inner = h('div', 'cc-in')
  const face = ({ kind, text, note }, cls) => {
    const f = h('div', `cc-face ${cls} ${kind}`)
    f.append(
      kind.startsWith('poly') ? logo() : W.icon(kind == 'no' ? 'M6 6l12 12M18 6 6 18' : 'M5 12.5l4.5 4.5L19 7.5', true),
      h('span', '', text),
    )
    if (note) f.append(h('sup', '', note))
    return f
  }
  inner.append(face(front, 'cc-f'))
  if (back) {
    td.classList.add('flips')
    td.style.setProperty('--d', i * 30 + 'ms')
    inner.append(face(back, 'cc-b'))
  }
  td.append(inner)
  return td
}

/** Show the polyfill's side or the native one, and keep the hidden faces away from screen readers. */
const applyCompat = () => {
  const on = $('#compat-on').checked
  $('#browser').classList.toggle('poly', on)
  for (const td of $$('#browser .flips')) {
    td.querySelector('.cc-f').setAttribute('aria-hidden', on)
    td.querySelector('.cc-b').setAttribute('aria-hidden', !on)
  }
}

const renderCompat = async () => {
  try {
    compat ??= await (await fetch('lib/compat.json')).json()
  } catch {
    return
  }
  const { groups, names, features, sheet, core, noLinux } = compat
  const columns = [...groups.desktop, ...groups.mobile]
  const notes = []
  // Footnote number for a text, numbering new ones as they come
  const note = (text) => String(notes.indexOf(text) + 1 || notes.push(text))
  // "Chrome and Edge", "Chrome 和 Edge"…
  const browserList = new Intl.ListFormat(L).format(noLinux.map((b) => names[b]))
  const linuxNote = noLinux.length && fmt(t('compat_linux'), { browsers: browserList })
  // The sheet's versions are with /legacy: the newer ones without it
  const legacyNote = fmt(t('compat_legacy'), {
    browsers: new Intl.ListFormat(L).format([...new Set(Object.entries(core).map(([b, v]) => `${names[b]} ${v}`))]),
  })

  // Three header rows: desktop or mobile; the browser; the OS, for the browsers that get one column per OS
  const th = (text, cls, scope) => {
    const e = h('th', cls, text)
    e.scope = scope
    return e
  }
  const rows = [h('tr'), h('tr'), h('tr')]
  const corner = h('td')
  corner.rowSpan = 3
  rows[0].append(corner)
  // The last desktop column: a line between desktop and mobile
  const split = groups.desktop.length - 1
  // A line after each browser with one column per OS, and before it (after Firefox, before Opera)
  const line = (i) => columns[i].os == 'linux' || (!columns[i].os && columns[i + 1]?.os)
  for (const g of ['desktop', 'mobile']) {
    const e = th(t('compat_' + g), g == 'desktop' ? 'grp end split' : 'grp', 'colgroup')
    e.colSpan = groups[g].length
    rows[0].append(e)
  }
  for (const [i, c] of columns.entries()) {
    if (c.os) {
      if (columns[i - 1]?.b != c.b) {
        const e = th(names[c.b], 'br end', 'colgroup')
        e.colSpan = columns.filter((d) => d.b == c.b).length
        rows[1].append(e)
      }
      const e = th(OS_SHORT[c.os], c.os == 'linux' ? 'os end' : 'os', 'col')
      if (OS_SHORT[c.os] != OSES[c.os]) {
        e.title = OSES[c.os]
        e.setAttribute('aria-label', OSES[c.os])
      }
      if (c.os == 'linux' && noLinux.includes(c.b)) e.append(h('sup', '', note(linuxNote)))
      rows[2].append(e)
    } else {
      const e = th(names[c.b], i == split ? 'br end split' : line(i) ? 'br end' : 'br', 'col')
      e.rowSpan = 2
      rows[1].append(e)
    }
  }
  const head = h('thead')
  head.append(...rows)

  const body = h('tbody')
  let i = 0
  for (const [feature, support] of Object.entries(features)) {
    const files = feature == 'data.files'
    const tr = h('tr')
    const rowHead = th('', '', 'row')
    rowHead.append(h('code', '', feature))
    if (files) rowHead.append(h('sup', '', note(t('compat_files'))))
    tr.append(rowHead)
    for (const [j, c] of columns.entries()) {
      const s = support[c.os ? `${c.b}:${c.os}` : c.b]
      const front = !s.v
        ? { kind: 'no', text: t('compat_no') }
        : s.flag
          ? { kind: 'no', text: t('compat_flag') }
          : { kind: 'yes', text: s.v }
      // The polyfill fills the gaps with its sheet; files, it saves or copies
      const back =
        front.kind == 'yes'
          ? null
          : files
            ? { kind: 'polyf', text: t('compat_save') }
            : { kind: 'poly', text: sheet[c.b], note: core[c.b] && note(legacyNote) }
      const td = compatCell(front, back, i++)
      if (line(j)) td.classList.add('end')
      if (j == split) td.classList.add('end', 'split')
      tr.append(td)
    }
    body.append(tr)
  }
  $('#compat').replaceChildren(head, body)

  $('#compat-legend').replaceChildren(
    ...[
      ['yes', 'compat_native'],
      ['no', 'compat_none'],
      ['poly', 'compat_poly'],
      ['polyf', 'compat_poly_files'],
    ].map(([kind, key]) => {
      const li = h('li')
      const swatch = h('span', `cc-face ${kind}`)
      swatch.append(
        kind.startsWith('poly')
          ? logo()
          : W.icon(kind == 'no' ? 'M6 6l12 12M18 6 6 18' : 'M5 12.5l4.5 4.5L19 7.5', true),
      )
      li.append(swatch, t(key))
      return li
    }),
  )
  $('#compat-notes').replaceChildren(...notes.map((n) => h('li', '', n)))
  $('#compat-src').textContent = fmt(t('compat_source'), {
    date: compat.tested,
    browsers: compat.testedWith,
    version: compat.bcd,
  })
  applyCompat()
}

const setCompat = (on) => {
  $('#compat-on').checked = on
  applyCompat()
}
// A switch flipped by hand stays that way until the tables leave the screen
let manual = false
$('#compat-on').addEventListener('change', () => {
  manual = true
  applyCompat()
})
// Show what the polyfill does: flip to its side whenever a table comes into view (scrolling up or down),
// and back once both tables have left it, so it plays again next time
const seen = new Map()
let flipTimer = 0
const compatObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) seen.set(e.target, e.intersectionRatio >= 0.6 ? 2 : e.isIntersecting ? 1 : 0)
    const states = [...seen.values()]
    if (states.includes(2)) {
      if (!manual && !flipTimer && !$('#compat-on').checked) {
        flipTimer = setTimeout(() => {
          flipTimer = 0
          setCompat(true)
        }, 600)
      }
    } else if (!states.some(Boolean)) {
      clearTimeout(flipTimer)
      flipTimer = 0
      manual = false
      setCompat(false)
    }
  },
  { threshold: [0, 0.6] },
)
for (const wrap of $$('.compat-wrap')) compatObserver.observe(wrap)

/* -------------------------------------------------------------- Language */

const applyLanguage = () => {
  document.documentElement.lang = htmlLang(L)
  for (const el of $$('[data-t]')) el.textContent = t(el.dataset.t)
  // Trusted strings from i18n.js only
  for (const el of $$('[data-th]')) el.innerHTML = t(el.dataset.th)
  document.title = t('title')
  renderSiteLangs()
  renderTheme()
  $('meta[name=description]').content = t('description')
  renderInstall()
  renderGallery()
  renderDefaults()
  renderLangs()
  filterLangs()
  renderCopyables()
  renderSizes()
  renderCompat()
  renderPlayground()
}

/* Theme button: light or dark; the sun shows in the light theme, the moon in the dark one */

const renderTheme = () => {
  const btn = $('#theme-btn')
  btn.setAttribute('aria-pressed', theme() == 'dark')
  btn.setAttribute('aria-label', t('site_dark'))
  btn.title = t('site_dark')
  // navigator.share() on this page opens a sheet in the same theme
  W.polyfill({ theme: theme() })
}
$('#theme-btn').addEventListener('click', () => {
  const next = theme() == 'dark' ? 'light' : 'dark'
  // Choosing what the system uses goes back to following the system
  const system = darkQuery.matches ? 'dark' : 'light'
  if (next == system) delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = next
  try {
    if (next == system) localStorage.removeItem('wsp-site-theme')
    else localStorage.setItem('wsp-site-theme', next)
  } catch {}
  renderTheme()
})
darkQuery.addEventListener('change', renderTheme)

/* Site language menu: opens on hover, on keyboard focus, or on a tap */

const menu = $('#lang-menu')
const menuBtn = $('#lang-btn')
const setOpen = (open) => {
  menu.classList.toggle('open', open)
  menuBtn.setAttribute('aria-expanded', open)
}
const keyboardInside = () => menu.contains(document.activeElement) && document.activeElement.matches(':focus-visible')
let pointer = ''
menu.addEventListener('pointerenter', (e) => e.pointerType == 'mouse' && setOpen(true))
menu.addEventListener('pointerleave', (e) => e.pointerType == 'mouse' && !keyboardInside() && setOpen(false))
menu.addEventListener('pointerdown', (e) => (pointer = e.pointerType))
menu.addEventListener('focusin', () => keyboardInside() && setOpen(true))
menu.addEventListener('focusout', (e) => !menu.contains(e.relatedTarget) && setOpen(false))
menu.addEventListener('keydown', (e) => {
  if (e.key == 'Escape' && menu.classList.contains('open')) {
    // Focus first: focusing the button by keyboard opens the menu
    menuBtn.focus()
    setOpen(false)
  }
})
// A mouse click keeps the menu that hovering opened; a tap or Enter toggles it
menuBtn.addEventListener('click', () => {
  setOpen(pointer == 'mouse' || !menu.classList.contains('open'))
  pointer = ''
})
// pointerdown, not click: iOS sends no click for taps on plain content
document.addEventListener('pointerdown', (e) => !menu.contains(e.target) && setOpen(false))

const renderSiteLangs = () => {
  menuBtn.setAttribute('aria-label', t('site_lang'))
  menuBtn.title = t('site_lang')
  $('#site-lang').replaceChildren(
    ...Object.entries(SITE_LANGS).map(([code, name]) => {
      const b = h('button', '', name)
      b.type = 'button'
      b.lang = htmlLang(code)
      if (code == L) b.setAttribute('aria-current', 'true')
      b.onclick = () => {
        const kbd = keyboardInside()
        L = code
        try {
          localStorage.setItem('wsp-site-lang', L)
        } catch {}
        applyLanguage()
        if (kbd) menuBtn.focus()
        setOpen(false)
      }
      const li = h('li')
      li.append(b)
      return li
    }),
  )
}

fetch('lib/meta.json')
  .then((r) => r.json())
  .then((m) => {
    meta = m
    renderCode()
  })
  .catch(() => {})
$('#fact-targets').textContent = Object.keys(W.targets).length + 1 // + messenger(appId)
$('#fact-langs').textContent = W.locales.length

applyLanguage()
