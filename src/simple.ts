/**
 * Side-effect entry: installs `navigator.share()` with one list of targets for everyone (the default one
 * for most languages) and English only: the smallest ready-made setup. Also exports `share()` with the
 * same defaults, which resolves with the id of the target used.
 */
import { defaults } from './defaults.js'
import type { ShareTarget } from './index.js'
import { install, type Share } from './preset.js'
import { copy, email, facebook, linkedin, more, qr, reddit, save, sms, telegram, whatsapp, x } from './targets.js'

const T: Record<string, ShareTarget> = {
  copy,
  email,
  facebook,
  linkedin,
  more,
  qr,
  reddit,
  save,
  sms,
  telegram,
  whatsapp,
  x,
}

/** Like the core `share()`, with one list of targets for everyone, in English. */
export const share: Share = install({ targets: defaults['*'].map((id) => T[id]) })
