// The default target lists (from defaults.ts) as objects, for /common and /all: they import only these
// targets, not all of them like /full.
import { defaults } from './defaults.js'
import type { ShareTarget } from './index.js'
import {
  band,
  copy,
  douban,
  email,
  facebook,
  hatena,
  kakaotalk,
  line,
  linkedin,
  more,
  naver,
  ok,
  qr,
  qzone,
  reddit,
  save,
  sms,
  snapchat,
  telegram,
  threads,
  viber,
  vk,
  wechat,
  weibo,
  whatsapp,
  x,
  xing,
} from './targets.js'

const T: Record<string, ShareTarget> = {
  band,
  copy,
  douban,
  email,
  facebook,
  hatena,
  kakaotalk,
  line,
  linkedin,
  more,
  naver,
  ok,
  qr,
  qzone,
  reddit,
  save,
  sms,
  snapchat,
  telegram,
  threads,
  viber,
  vk,
  wechat,
  weibo,
  whatsapp,
  x,
  xing,
}

/** Default targets by viewer language, `'*'` for the others. */
export const lists: Record<string, ShareTarget[]> = Object.fromEntries(
  Object.entries(defaults).map(([lang, ids]) => [lang, ids.map((id) => T[id])]),
)
