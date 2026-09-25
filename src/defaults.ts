// The default target ids by viewer language, shared by /full and /auto.
const RU = 'copy qr email sms telegram whatsapp vk ok more'

/**
 * Default targets: `'*'` for most languages, and lists for languages with their own popular apps.
 * Actions (copy, qr, email, sms, more) are shown apart from apps; `sms` only appears on touch screens
 * and `more` only when the browser has its own share sheet.
 */
export const defaults: Record<string, string[]> = {}
for (const [lang, ids] of Object.entries({
  '*': 'copy qr email sms whatsapp facebook x telegram linkedin reddit more',
  zh: 'copy qr email sms wechat weibo qzone douban more',
  'zh-hant': 'copy qr email sms line facebook whatsapp threads x more',
  ja: 'copy qr email sms line x facebook hatena more',
  ko: 'copy qr email sms kakaotalk band naver facebook x more',
  ru: RU,
  be: RU,
  kk: RU,
  uk: 'copy qr email sms telegram viber facebook whatsapp x more',
  de: 'copy qr email sms whatsapp facebook x linkedin xing more',
  th: 'copy qr email sms line facebook x more',
  vi: 'copy qr email sms facebook telegram x more',
  fa: 'copy qr email sms telegram whatsapp x more',
}))
  // `save` only shows up when sharing files
  defaults[lang] = ids.replace('copy', 'copy save').split(' ')
