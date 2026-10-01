// Assembles the docs site into _site/: the pages from site/, the built library in _site/lib/.
// Run `bun run build` first (`bun run site` does both).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import bcd from '@mdn/browser-compat-data' with { type: 'json' }

if (!existsSync('dist/full.js')) throw new Error('Run `bun run build` first')
rmSync('_site', { recursive: true, force: true })
cpSync('site', '_site', { recursive: true })
mkdirSync('_site/lib')
cpSync('dist', '_site/lib', { recursive: true, filter: (f) => !f.endsWith('.d.ts') })
// Version for the CDN links shown by the playground
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
writeFileSync('_site/lib/meta.json', JSON.stringify({ version }) + '\n')

// Browser support table: MDN's data, our own tests in real browsers on each OS (site/probe.json), and what
// the sheet needs. Chrome and Edge get a column per OS, since that is where they differ.
const SPLIT = ['chrome', 'edge']
const OSES = ['windows', 'macos', 'linux']
const col = (b) => (SPLIT.includes(b) ? OSES.map((os) => ({ b, os })) : [{ b }])
const GROUPS = {
  desktop: ['chrome', 'edge', 'firefox', 'opera', 'safari'].flatMap(col),
  mobile: [
    'chrome_android',
    'firefox_android',
    'opera_android',
    'safari_ios',
    'samsunginternet_android',
    'webview_android',
    'webview_ios',
  ].flatMap(col),
}
const COLUMNS = [...GROUPS.desktop, ...GROUPS.mobile]
const BROWSERS = [...new Set(COLUMNS.map((c) => c.b))]
const statements = (feature, b) => [].concat(feature.__compat.support[b])
const statement = (feature, b) => statements(feature, b)[0]
const num = (v) => parseFloat(String(v).replace('≤', ''))
const newest = (versions) => versions.sort((x, y) => num(y) - num(x))[0]
const N = bcd.api.Navigator
const FEATURES = {
  'navigator.share()': N.share,
  'navigator.canShare()': N.canShare,
  'data.text': N.share.data_text_parameter,
  'data.files': N.share.data_files_parameter,
}
// What the sheet needs with /legacy (in the script tag): ES modules and CSS custom properties, from the
// build's targets on (scripts/build.mjs: Chromium-based Edge, Safari 11)
const SHEET = [bcd.javascript.statements.import, bcd.css.properties['custom-property']]
const FLOOR = { edge: '79', safari: '11', safari_ios: '11', webview_ios: '11' }
// Without /legacy, also <dialog> and Shadow DOM
const CORE = [bcd.html.elements.dialog, bcd.api.Element.attachShadow]
const probe = JSON.parse(readFileSync('site/probe.json', 'utf8'))
/**
 * Support of a feature in one column. MDN has no per-OS data: for Chrome and Edge it lists an early
 * version for Windows (and ChromeOS), then every platform from a later one; our tests show Linux never
 * had it. A sub-feature can't come before navigator.share() on the same OS.
 */
const support = (f, { b, os }) => {
  if (!os) {
    const s = statement(f, b)
    return s?.version_added && !s.version_removed ? { v: s.version_added, flag: !!s.flags || undefined } : {}
  }
  if (probe.results[b]?.[os]?.share === false) return {}
  const [all, ...older] = statements(f, b)
  const windows = older.find((s) => s.partial_implementation && /Windows/.test(s.notes || ''))
  if (os == 'windows') return { v: windows?.version_added ?? all.version_added }
  return { v: newest([all.version_added, statement(N.share, b).version_added]) }
}
const key = ({ b, os }) => (os ? `${b}:${os}` : b)
const range = (versions) => {
  const v = [...new Set(versions)].sort((x, y) => num(x) - num(y))
  return v.length > 1 ? `${v[0]}–${v.at(-1)}` : v[0]
}
const compat = {
  bcd: bcd.__meta.version,
  tested: probe.tested,
  testedWith: Object.entries(probe.results)
    .map(([b, byOs]) => `${bcd.browsers[b].name} ${range(Object.values(byOs).map((r) => r.version))}`)
    .join(', '),
  // Desktop browsers without navigator.share() on Linux in our tests, although MDN lists them
  noLinux: SPLIT.filter((b) => probe.results[b]?.linux?.share === false),
  groups: GROUPS,
  names: Object.fromEntries(BROWSERS.map((b) => [b, bcd.browsers[b].name])),
  features: Object.fromEntries(
    Object.entries(FEATURES).map(([name, f]) => [
      name,
      Object.fromEntries(COLUMNS.map((c) => [key(c), support(f, c)])),
    ]),
  ),
  sheet: {},
  // The versions the sheet needs without /legacy, where they differ
  core: {},
}
for (const b of BROWSERS) {
  const v = (compat.sheet[b] = newest([...SHEET.map((f) => statement(f, b).version_added), FLOOR[b]].filter(Boolean)))
  const core = newest([v, ...CORE.map((f) => statement(f, b).version_added)])
  if (core != v) compat.core[b] = core
}
writeFileSync('_site/lib/compat.json', JSON.stringify(compat) + '\n')
// GitHub Pages: serve files as is
writeFileSync('_site/.nojekyll', '')
// Custom domain: SITE_CNAME is set in the Pages workflow
if (process.env.SITE_CNAME) writeFileSync('_site/CNAME', process.env.SITE_CNAME + '\n')
console.log('Site ready in _site/')
