// Build: minified per-module ESM (so bundlers can tree-shake), a script-tag bundle,
// type declarations, and a size report.
import { build, transform } from 'esbuild'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { minify } from 'terser'

const ENTRIES = [
  'index',
  'targets',
  'locales',
  'defaults',
  'lists',
  'preset',
  'qr',
  'icons',
  'style',
  'full',
  'common',
  'all',
  'simple',
]
const TARGET = ['chrome100', 'firefox100', 'safari15']
// Keep non-ASCII text (the translations) as UTF-8 instead of \u escapes: much smaller before compression.
// Module scripts are always UTF-8, and CDNs serve the script-tag file as UTF-8.
const COMMON = { minify: true, target: TARGET, legalComments: 'none', charset: 'utf8' }

// 1. Minified CSS as a module
// esbuild keeps custom property values verbatim, so squeeze the spaces it leaves there
const css = (await transform(readFileSync('src/style.css', 'utf8'), { loader: 'css', minify: true })).code
  .trim()
  .replace(/([:,(])\s+/g, '$1')
  .replace(/\s+\)/g, ')')
const styleModule = `// Generated from style.css by scripts/build.mjs. Do not edit.\nconst css: string = ${JSON.stringify(css)}\nexport default css\n`
if (readFileSync('src/style.ts', 'utf8') !== styleModule) writeFileSync('src/style.ts', styleModule)

rmSync('dist', { recursive: true, force: true })

// 2. One minified ESM file per source module; imports between them are kept
await build({
  entryPoints: ENTRIES.map((e) => `src/${e}.ts`),
  outdir: 'dist',
  format: 'esm',
  bundle: false,
  ...COMMON,
})

// 3. Script-tag bundle: everything, installs itself, exposes window.WebSharePolyfill
await build({
  entryPoints: ['src/global.ts'],
  outfile: 'dist/web-share-polyfill.js',
  format: 'iife',
  globalName: 'WebSharePolyfill',
  bundle: true,
  ...COMMON,
})

// A second pass with terser, which finds a few percent more than esbuild. Pure annotations are kept
// so that bundlers can still drop unused targets.
for (const f of readdirSync('dist')) {
  const file = `dist/${f}`
  const { code } = await minify(readFileSync(file, 'utf8'), {
    module: f != 'web-share-polyfill.js',
    ecma: 2020,
    compress: { passes: 3 },
    format: { ascii_only: false, comments: false, preserve_annotations: true },
  })
  writeFileSync(file, code)
}

// 4. Types
execSync('bunx tsc -p tsconfig.build.json', { stdio: 'inherit' })

// 5. Sizes of typical bundles (minified + tree-shaken by esbuild)
const scenarios = {
  core: `import { polyfill } from './dist/index.js'; polyfill()`,
  // The smallest useful setup: the Minimal preset, actions only, in English
  minimal: `import { polyfill } from './dist/index.js'
    import { copy, save, qr, email, sms, more } from './dist/targets.js'
    polyfill({ targets: [copy, save, qr, email, sms, more] })`,
  typical: `import { polyfill } from './dist/index.js'
    import { copy, qr, email, whatsapp, facebook, x, telegram, linkedin } from './dist/targets.js'
    polyfill({ targets: [copy, qr, email, whatsapp, facebook, x, telegram, linkedin] })`,
  // The ready-made entries: default targets with the common languages or all of them; one list, English
  common: `import './dist/common.js'`,
  all: `import './dist/all.js'`,
  simple: `import './dist/simple.js'`,
  // /full (and the script tag): every target too
  full: `import { polyfill } from './dist/full.js'; polyfill()`,
}
const measure = async (contents) => {
  const out = await build({
    stdin: { contents, resolveDir: '.', loader: 'js' },
    bundle: true,
    write: false,
    format: 'esm',
    ...COMMON,
  })
  const code = out.outputFiles[0].contents
  return { min: code.length, gzip: gzipSync(code, { level: 9 }).length, brotli: brotliCompressSync(code).length }
}
const sizes = {}
for (const [name, contents] of Object.entries(scenarios)) sizes[name] = await measure(contents)
console.table(sizes)

// 6. What each target and locale adds to the core (gzip), for the playground's size estimate
const core = `import { polyfill } from './dist/index.js';`
const add = async (imports, from, option) =>
  (await measure(`${core} import { ${imports} } from './dist/${from}.js'; polyfill({ ${option} })`)).gzip -
  sizes.core.gzip
const T = await import(new URL('../dist/targets.js', import.meta.url))
const L = await import(new URL('../dist/locales.js', import.meta.url))
const parts = { targets: {}, locales: {} }
for (const [name, value] of Object.entries(T)) {
  if (value?.id) parts.targets[value.id] = await add(name, 'targets', `targets: [${name}]`)
}
parts.targets.messenger = await add('messenger', 'targets', `targets: [messenger('1')]`)
for (const [name, value] of Object.entries(L)) {
  if (name != 'en') parts.locales[value.slice(0, value.indexOf('|'))] = await add(name, 'locales', `locales: [${name}]`)
}
// The QR encoder is shared by qr and wechat
parts.qrShared = parts.targets.qr + parts.targets.wechat - (await add('qr, wechat', 'targets', 'targets: [qr, wechat]'))
// Summing parts overestimates (they compress better together): scale from the typical bundle
const typicalIds = ['copy', 'qr', 'email', 'whatsapp', 'facebook', 'x', 'telegram', 'linkedin']
parts.scale = +(
  (sizes.typical.gzip - sizes.core.gzip) /
  typicalIds.reduce((a, id) => a + parts.targets[id], 0)
).toFixed(3)
// Many targets compress better together than the typical ones: a scale for all of them at once
const allTargets =
  (
    await measure(
      `${core} import * as T from './dist/targets.js'; polyfill({ targets: Object.values(T).filter((t) => t.id) })`,
    )
  ).gzip - sizes.core.gzip
parts.targetScale = +(
  allTargets / Object.entries(parts.targets).reduce((a, [id, n]) => a + (id == 'messenger' ? 0 : n), 0)
).toFixed(3)
// Languages compress much better together than one by one: their own scale, from all of them at once
// (the playground interpolates between 1 for one language and this for all of them)
const allLocales =
  (await measure(`${core} import * as L from './dist/locales.js'; polyfill({ locales: Object.values(L) })`)).gzip -
  sizes.core.gzip
parts.localeScale = +(allLocales / Object.values(parts.locales).reduce((a, b) => a + b, 0)).toFixed(3)
sizes.parts = parts

// The playground's quick presets that are not ready-made entries, measured like the code it shows for them:
// the default lists of their languages, and their locales (keep in sync with QUICK in site/app.js)
const { defaults } = await import(new URL('../dist/defaults.js', import.meta.url))
const exportName = (code) => code.replace(/-(\w)/, (_, c) => c.toUpperCase())
const quickPreset = (langs) => {
  const lists = Object.fromEntries(['*', ...langs.filter((l) => defaults[l])].map((l) => [l, defaults[l]]))
  const ids = [...new Set(Object.values(lists).flat())]
  const names = langs.map(exportName)
  return `import { polyfill } from './dist/index.js'
    import { ${ids.join(', ')} } from './dist/targets.js'
    import { ${names.join(', ')} } from './dist/locales.js'
    polyfill({
      targets: { ${Object.entries(lists)
        .map(([l, v]) => `'${l}': [${v.join(', ')}]`)
        .join(', ')} },
      locales: [${names.join(', ')}],
    })`
}
sizes.quick = {
  weea: await measure(quickPreset(['fr', 'de', 'it', 'es', 'pt', 'zh', 'zh-hant', 'ja', 'ko'])),
  efc: await measure(quickPreset(['fr', 'zh', 'zh-hant'])),
}

writeFileSync('dist/sizes.json', JSON.stringify(sizes, null, 2) + '\n')
console.log(
  `Per-part sizes: ${Object.keys(parts.targets).length} targets, ${Object.keys(parts.locales).length} locales, scale ${parts.scale}`,
)
