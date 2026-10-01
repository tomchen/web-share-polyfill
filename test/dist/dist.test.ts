// @vitest-environment happy-dom
// The built files in dist/, as published: each entry point exports what its source does and still works
// once minified, and the script-tag bundle installs itself. Run `bun run build` first.
import { afterEach, describe, expect, it } from 'vitest'
import pkgJson from '../../package.json?raw'
import bundle from '../../dist/web-share-polyfill.js?raw'
import sizesJson from '../../dist/sizes.json?raw'

/** Load a built module. Not resolved by the type checker, which runs before the build. */
const dist = (name: string): Promise<any> => import(`../../dist/${name}.js`)

const pkg = JSON.parse(pkgJson) as { exports: Record<string, string | { types: string; default: string }> }
const sheet = () => document.querySelector('web-share-polyfill')?.shadowRoot
const ids = () => [...(sheet()?.querySelectorAll('[data-id]') ?? [])].map((e) => (e as HTMLElement).dataset.id)
const dismiss = () => (sheet()!.querySelector('.x') as HTMLElement).click()

// Every "exports" entry except package.json, e.g. ['index', './dist/index.js']
const entries = Object.values(pkg.exports)
  .filter((e) => typeof e == 'object')
  .map((e) => [e.default.slice('./dist/'.length, -'.js'.length), e.default] as const)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('dist', () => {
  it.each(entries)('%s exports the same names as its source', async (name) => {
    const built = await dist(name)
    const source = await import(`../../src/${name}.ts`)
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort())
  })

  it('encodes QR codes like the source', async () => {
    const built: typeof import('../../src/qr.js') = await dist('qr')
    const source = await import('../../src/qr.js')
    for (const text of ['https://example.com/', 'Hello, 世界', 'x'.repeat(500)]) {
      expect(built.qr(text), text).toEqual(source.qr(text))
    }
  })

  it('shows the sheet with the default targets', async () => {
    const { share }: typeof import('../../src/full.js') = await dist('full')
    const p = share({ url: 'https://example.com' }, { native: false, lang: 'en' })
    expect(ids()).toEqual(expect.arrayContaining(['copy', 'qr', 'email', 'whatsapp', 'facebook', 'x']))
    dismiss()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('script-tag bundle exposes WebSharePolyfill and installs navigator.share', async () => {
    // Run it and read the global it declares (it is strict code, so an eval would keep the var to itself)
    const W = new Function(bundle + '\nreturn WebSharePolyfill')() as Record<string, unknown>
    expect(Object.keys(W).sort()).toEqual(Object.keys(await import('../../src/global.js')).sort())
    expect(navigator.canShare({ url: 'https://example.com' })).toBe(true)
    const p = navigator.share({ url: 'https://example.com' })
    expect(ids()).toContain('copy')
    dismiss()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('script-tag bundle installs without Object.fromEntries (Safari before 12.1)', () => {
    // Mask only the bundle's Object, leaving the test runner's alone
    const oldObject = new Proxy(Object, {
      get: (target, key) => (key == 'fromEntries' ? undefined : Reflect.get(target, key)),
    })
    const W = new Function('Object', bundle + '\nreturn WebSharePolyfill')(oldObject)
    expect(W.resolve({ targets: { '*': ['copy', 'x'] } }).targets['*'].map((t: { id: string }) => t.id)).toEqual([
      'copy',
      'x',
    ])
    expect(navigator.canShare({ url: 'https://example.com' })).toBe(true)
  })
})

// Size budgets (gzip bytes, from dist/sizes.json). A failure means the library grew:
// raise a budget only on purpose, and update the sizes in the README with it.
describe('size', () => {
  const sizes = JSON.parse(sizesJson) as Record<
    'core' | 'legacy' | 'minimal' | 'typical' | 'simple' | 'common' | 'all' | 'full',
    { gzip: number }
  >
  it.each([
    ['core', 5300],
    ['legacy', 7000],
    ['minimal', 8300],
    ['typical', 9000],
    ['simple', 10000],
    ['common', 15400],
    ['all', 19800],
    ['full', 23000],
  ] as const)('%s stays under %i bytes gzipped', (name, budget) => {
    expect(sizes[name].gzip).toBeLessThanOrEqual(budget)
  })
})
