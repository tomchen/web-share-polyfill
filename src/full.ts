/**
 * Everything included: all targets, all locales, and default targets chosen from the
 * viewer's language. Use this (or `web-share-polyfill/common` or `/all`) when bundle size matters less
 * than convenience; import from the main entry, `/targets` and `/locales` to tree-shake.
 */
import * as T from './targets.js'
import * as L from './locales.js'
import { defaults } from './defaults.js'
import {
  polyfill as installPolyfill,
  share as coreShare,
  type Options,
  type ShareData,
  type ShareTarget,
} from './index.js'

export * from './index.js'

/** Every built-in target by id (except `messenger`, which needs an app id: use `messenger(appId)`). */
export const targets: Record<string, ShareTarget> = {}
for (const t of Object.values(T)) if (typeof t == 'object' && t.id) targets[t.id] = t

export { messenger } from './targets.js'

/** Every built-in locale. */
export const locales: string[] = Object.values(L)

const byCode: Record<string, string> = {}
for (const l of locales) byCode[l.slice(0, l.indexOf('|'))] = l

export { defaults }

type List = (string | ShareTarget)[]

export interface FullOptions extends Omit<Options, 'targets'> {
  /** Languages the sheet may use, as codes (`'fr'`, `'zh-hant'`, …) or locale strings. Default: all of them. */
  locales?: string[]
  /**
   * Targets in display order, as ids or objects. Or lists by viewer language, with `'*'` for everyone
   * else: `{ '*': ['copy', 'x'], zh: ['copy', 'wechat'] }`. Default: `defaults`.
   */
  targets?: List | Record<string, List>
}

/** Resolve ids, and drop unknown ones and duplicates. */
const resolveList = (list: List): ShareTarget[] =>
  list
    .map((t) => (typeof t == 'string' ? targets[t] : t))
    .filter((t, i, all) => t && all.findIndex((u) => u?.id == t.id) == i)

/** Turn `FullOptions` into core `Options`. */
export const resolve = (o: FullOptions = {}): Options => {
  const t = o.targets || defaults
  return {
    ...o,
    locales: o.locales ? o.locales.map((l) => byCode[l.toLowerCase()] || l).filter((l) => l.includes('|')) : locales,
    targets: Array.isArray(t)
      ? resolveList(t)
      : Object.fromEntries(Object.entries(t).map(([lang, list]) => [lang, resolveList(list)])),
  }
}

/** Like the core `share()`, with ids allowed in `targets` and language-based defaults. */
export const share = (data?: ShareData, o?: FullOptions): Promise<string> => coreShare(data, resolve(o))

/** Like the core `polyfill()`, with ids allowed in `targets` and language-based defaults. */
export const polyfill = (o?: FullOptions): void => installPolyfill(resolve(o))
