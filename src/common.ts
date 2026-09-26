/**
 * Side-effect entry: installs `navigator.share()` with the default targets for each viewer language and
 * the 20 most common languages (other viewers get English). Also exports `share()` with the same
 * defaults, which resolves with the id of the target used.
 */
import { ar, de, es, fr, hi, id, it, ja, ko, nl, pl, pt, ru, th, tr, uk, vi, zh, zhHant } from './locales.js'
import { lists } from './lists.js'
import { install, type Share } from './preset.js'

/** Like the core `share()`, with the default targets and the common languages. */
export const share: Share = install({
  targets: lists,
  // English is built in
  locales: [zh, zhHant, ja, ko, es, fr, de, pt, it, nl, ru, uk, pl, tr, ar, hi, id, vi, th],
})
