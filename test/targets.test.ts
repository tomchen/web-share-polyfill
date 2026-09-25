// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import * as T from '../src/targets.js'
import { defaults, resolve, share, targets, type FullOptions } from '../src/full.js'
import type { ShareInput, ShareTarget } from '../src/index.js'

const full: ShareInput = { title: 'Title & more', text: 'Some text', url: 'https://example.com/a?b=1', files: [] }
const urlOnly: ShareInput = { title: '', text: '', url: 'https://example.com/', files: [] }
const textOnly: ShareInput = { title: '', text: 'Hello world', url: '', files: [] }

describe('targets', () => {
  it('build share links', () => {
    const links: Record<string, unknown> = {}
    for (const [id, t] of Object.entries(targets)) if (t.url) links[id] = t.url(full)
    expect(links).toMatchSnapshot()
  })

  it('have valid ids, names and icons', () => {
    for (const [id, t] of Object.entries(targets)) {
      expect(t.id).toBe(id)
      expect(t.name).toBeTruthy()
      expect(t.icon).toMatch(/^[Mm][\d\s.,a-zA-Z-]+$/)
      if (t.color) expect(t.color).toMatch(/^#([\da-f]{3}|[\da-f]{6})$/)
      expect(t.url || t.run, id).toBeTruthy()
    }
  })

  it('hide link-only targets when there is no link', () => {
    for (const id of ['facebook', 'linkedin', 'reddit', 'pinterest', 'vk', 'ok', 'weibo', 'hackernews', 'snapchat']) {
      expect(targets[id].url!(textOnly), id).toBeFalsy()
    }
    for (const id of ['x', 'whatsapp', 'telegram', 'bluesky', 'mastodon', 'line', 'email', 'sms', 'gmail']) {
      expect(targets[id].url!(textOnly), id).toBeTruthy()
    }
  })

  it('encode text for chat apps', () => {
    expect(T.whatsapp.url!(full)).toBe('https://wa.me/?text=Some%20text%0Ahttps%3A%2F%2Fexample.com%2Fa%3Fb%3D1')
    expect(T.telegram.url!(textOnly)).toBe('https://t.me/share/url?url=Hello%20world')
    expect(T.email.url!(urlOnly)).toBe('mailto:?body=https%3A%2F%2Fexample.com%2F')
    expect(T.sms.url!(full)).toBe('sms:?&body=Some%20text%0Ahttps%3A%2F%2Fexample.com%2Fa%3Fb%3D1')
  })

  it('messenger needs an app id on desktop', () => {
    const m = T.messenger('123')
    expect(m.url!(urlOnly)).toBe(
      'https://www.facebook.com/dialog/send?app_id=123&link=https%3A%2F%2Fexample.com%2F&redirect_uri=https%3A%2F%2Fexample.com%2F',
    )
  })

  it('kakaotalk only appears with the Kakao SDK', () => {
    expect(T.kakaotalk.when!(urlOnly)).toBeFalsy()
    ;(window as any).Kakao = { Share: { sendScrap() {} } }
    expect(T.kakaotalk.when!(urlOnly)).toBeTruthy()
    delete (window as any).Kakao
  })
})

describe('full', () => {
  /** Ids shown by the sheet, apps first, as in the DOM. */
  const shown = async (o: FullOptions) => {
    const p = share({ url: 'https://example.com' }, { native: false, ...o })
    const root = document.querySelector('web-share-polyfill')!.shadowRoot!
    const ids = [...root.querySelectorAll<HTMLElement>('[data-id]')].map((e) => e.dataset.id)
    ;(root.querySelector('.x') as HTMLElement).click()
    await p.catch(() => {})
    return ids
  }

  it('defaults reference existing targets', () => {
    expect(defaults['*']).toContain('copy')
    for (const [lang, ids] of Object.entries(defaults)) {
      for (const id of ids) expect(targets[id], `${lang}: ${id}`).toBeDefined()
    }
  })

  it('picks the defaults for the viewer language', async () => {
    expect(await shown({ lang: 'zh-CN' })).toEqual(['wechat', 'weibo', 'qzone', 'douban', 'copy', 'qr', 'email'])
    expect(await shown({ lang: 'zh-TW' })).toContain('line')
    expect(await shown({ lang: 'ja-JP' })).toContain('hatena')
    expect(await shown({ lang: 'fr-FR' })).toEqual(await shown({ lang: 'en' }))
    // No touch screen and no native share sheet in the test environment: no SMS, no "more"
    expect(await shown({ lang: 'en' })).toEqual([
      'whatsapp',
      'facebook',
      'x',
      'telegram',
      'linkedin',
      'reddit',
      'copy',
      'qr',
      'email',
    ])
  })

  it('accepts ids and objects, as one list or by language', async () => {
    const custom = { id: 'mine', name: 'Mine', icon: 'M0 0h24v24H0z', url: () => 'https://example.com' }
    const ids = (list: unknown) => (list as ShareTarget[]).map((t) => t.id)
    expect(ids(resolve({ targets: ['x', custom, 'nope', 'x'] }).targets)).toEqual(['x', 'mine'])
    const byLang = resolve({ targets: { '*': ['x', 'x'], ja: ['line', 'nope', custom] } }).targets as Record<
      string,
      unknown
    >
    expect(Object.keys(byLang)).toEqual(['*', 'ja'])
    expect(ids(byLang['*'])).toEqual(['x'])
    expect(ids(byLang.ja)).toEqual(['line', 'mine'])
    expect(await shown({ lang: 'ja', targets: { '*': ['x'], ja: ['line', 'copy'] } })).toEqual(['line', 'copy'])
    expect(await shown({ lang: 'de', targets: { '*': ['x'], ja: ['line'] } })).toEqual(['x'])

    expect(resolve({}).locales!.length).toBeGreaterThan(60)
    const L = resolve({ locales: ['fr', 'zh-Hant', 'nope'], fallback: 'fr' })
    expect(L.locales!.map((l) => l.split('|')[0])).toEqual(['fr', 'zh-hant'])
    expect(L.fallback).toBe('fr')
  })
})
