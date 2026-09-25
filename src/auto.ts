/**
 * Side-effect entry: installs `navigator.share()` with the default targets for each viewer language and
 * every locale. Unlike `/full`, it bundles only the default targets, since it takes no options.
 */
import { polyfill, type ShareTarget } from './index.js'
import * as L from './locales.js'
import { defaults } from './defaults.js'
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

polyfill({
  targets: Object.fromEntries(Object.entries(defaults).map(([lang, ids]) => [lang, ids.map((id) => T[id])])),
  locales: Object.values(L),
})
