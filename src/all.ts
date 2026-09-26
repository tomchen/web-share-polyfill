/**
 * Side-effect entry: installs `navigator.share()` with the default targets for each viewer language and
 * all 70 languages. Also exports `share()` with the same defaults, which resolves with the id of the
 * target used.
 */
import * as L from './locales.js'
import { lists } from './lists.js'
import { install, type Share } from './preset.js'

/** Like the core `share()`, with the default targets and every language. */
export const share: Share = install({ targets: lists, locales: Object.values(L) })
