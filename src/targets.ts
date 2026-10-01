/**
 * Share targets. Import only the ones you use; the rest is tree-shaken.
 *
 * Apps (targets with a brand color) open the service's own share page in a new tab.
 * Actions (copy, QR code, email, SMS, print, more) are handled in the page.
 */
import * as I from './icons.js'
import { icon, nativeShare, type ShareData, type ShareInput, type Sheet, type ShareTarget } from './index.js'
import { qr as encode, qrPath } from './qr.js'

/** Build `base?key=value&…`, skipping empty values. */
export function query(base: string, params: Record<string, string | undefined>): string {
  let s = ''
  for (const k in params) if (params[k]) s += (s ? '&' : '?') + k + '=' + encodeURIComponent(params[k]!)
  return base + s
}

/** Message for chat-like targets: the text (or title) followed by the link. */
export function message(d: ShareInput): string {
  return [d.text || d.title, d.url].filter(Boolean).join('\n')
}

/** Email-style body: the text followed by the link. */
function body(d: ShareInput): string {
  return [d.text, d.url].filter(Boolean).join('\n\n')
}

const B = 72

/* ------------------------------------------------------------------ Actions */

const COPY = 'M9 9h10v10H9zM15 9V5H5v10h4'
const CHECK = 'M5 12.5l4.5 4.5L19 7.5'

/** An image as PNG, the image type every clipboard takes. */
const png = async (file: Blob): Promise<Blob> => {
  if (file.type == 'image/png') return file
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject()), 'image/png'))
}

/** A text file's contents (FileReader where there is no Blob.text(): Safari before 14, Chrome before 76). */
const fileText = (file: Blob): Promise<string> =>
  typeof file.text == 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
      })

/**
 * Copy the link (or the text when there is no link). With nothing but files: copy one image, or the
 * contents of one text file.
 */
export const copy: ShareTarget = {
  id: 'copy',
  name: (d, t) => (d.url ? t.copyLink : t.copy),
  icon: COPY,
  stroke: true,
  // Images only where they can be copied
  files: (f) =>
    f.length == 1 &&
    (/^text\//.test(f[0].type) ||
      (/^image\//.test(f[0].type) &&
        !!navigator.clipboard?.write &&
        typeof ClipboardItem != 'undefined' &&
        (f[0].type == 'image/png' || typeof createImageBitmap == 'function'))),
  run(d, s) {
    const value = d.url || d.text || d.title
    const done = () => {
      s.ok()
      s.item.querySelector('.l')!.textContent = s.strings.copied
      const c = s.item.querySelector('.c')!
      c.textContent = ''
      c.appendChild(icon(CHECK, true))
      setTimeout(s.close, 800)
    }
    const legacy = (text: string) => {
      const doc = s.item.ownerDocument
      const ta = doc.createElement('textarea')
      ta.className = 'o'
      ta.value = text
      s.item.appendChild(ta)
      ta.select()
      const ok = doc.execCommand('copy')
      ta.remove()
      if (ok) done()
    }
    const write = (text: string) => {
      try {
        navigator.clipboard.writeText(text).then(done, () => legacy(text))
      } catch {
        legacy(text)
      }
    }
    const file = !value && d.files[0]
    if (!file) return write(value)
    if (file.type.startsWith('text/')) return fileText(file).then(write, () => {})
    // Start the write right away (Safari wants it within the click): the item waits for the PNG
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png(file) })]).then(done, () => {})
  },
}

/**
 * Save the shared files to the device, to pass them on from there. Only shown with files: the apps in
 * the sheet take links and text, not files. Labelled with the file name.
 */
export const save: ShareTarget = {
  id: 'save',
  name: (d) => (d.files.length ? d.files[0].name + (d.files.length > 1 ? ` +${d.files.length - 1}` : '') : ''),
  icon: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  stroke: true,
  when: (d) => d.files.length,
  files: (f) => f.length,
  run(d, s) {
    for (const f of d.files) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(f)
      a.download = f.name
      // In the page, so that every browser follows it
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    }
    s.ok()
    s.close()
  },
}

/** QR code sub-view for `text`. */
export function qrView(text: string, s: Sheet, title = s.label): void {
  const m = encode(text)
  const svg = icon(qrPath(m), false, m.length + 4)
  svg.setAttribute('class', 'qr')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', s.strings.qr)
  const p = document.createElement('p')
  p.className = 'u'
  p.textContent = text
  const f = document.createDocumentFragment()
  f.appendChild(svg)
  f.appendChild(p)
  s.ok()
  s.view(title, f)
}

/** Show a QR code of the link, to open it on a phone. */
export const qr: ShareTarget = {
  id: 'qr',
  name: (_, t) => t.qr,
  icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z',
  stroke: true,
  when: (d) => d.url || d.text,
  run: (d, s) => qrView(d.url || d.text, s),
}

/** Default email app (`mailto:`). */
export const email: ShareTarget = {
  id: 'email',
  name: (_, t) => t.email,
  icon: 'M3 6h18v12H3zM3.5 6.5l8.5 6.5 8.5-6.5',
  stroke: true,
  url: (d) => query('mailto:', { subject: d.title, body: body(d) }),
}

/** Default messaging app (`sms:`). Only shown on touch screens. */
export const sms: ShareTarget = {
  id: 'sms',
  name: (_, t) => t.sms,
  icon: 'M4 5h16v11H9l-5 4z',
  stroke: true,
  when: () => matchMedia('(pointer:coarse)').matches,
  url: (d) => 'sms:?&body=' + encodeURIComponent(message(d)),
}

/** Print the current page. Only shown when sharing the current page. */
export const print: ShareTarget = {
  id: 'print',
  name: (_, t) => t.print,
  icon: 'M7 8V4h10v4M7 17H4V9h16v8h-3M7 14h10v6H7z',
  stroke: true,
  when: (d) => !d.url || d.url.split('#')[0] == location.href.split('#')[0],
  run(_, s) {
    s.ok()
    s.close()
    setTimeout(() => window.print(), 300)
  },
}

/** The browser's own share sheet. Only shown when it exists (i.e. with `native: false`). */
export const more: ShareTarget = {
  id: 'more',
  name: (_, t) => t.more,
  icon: 'M5 11a1 1 0 110 2 1 1 0 010-2zm7 0a1 1 0 110 2 1 1 0 010-2zm7 0a1 1 0 110 2 1 1 0 010-2z',
  stroke: true,
  when: () => nativeShare,
  run(d, s) {
    const data: ShareData = {}
    if (d.title) data.title = d.title
    if (d.text) data.text = d.text
    if (d.url) data.url = d.url
    if (d.files.length) data.files = d.files
    s.ok(nativeShare!(data).then(() => 'native'))
    s.close()
  },
}

/* --------------------------------------------------------------------- Apps */

export const x: ShareTarget = {
  id: 'x',
  name: 'X',
  color: '#000',
  icon: I.x,
  box: B,
  url: (d) => query('https://x.com/intent/post', { text: d.text || d.title, url: d.url }),
}

export const facebook: ShareTarget = {
  id: 'facebook',
  name: 'Facebook',
  color: '#0866ff',
  icon: I.facebook,
  box: B,
  url: (d) => d.url && query('https://www.facebook.com/sharer/sharer.php', { u: d.url }),
}

/**
 * Facebook Messenger. Needs a Facebook app id on desktop.
 * @param appId Your Facebook app id.
 */
export const messenger = (appId: string): ShareTarget => ({
  id: 'messenger',
  name: 'Messenger',
  color: '#0866ff',
  icon: I.messenger,
  box: B,
  url: (d) =>
    d.url &&
    (/Android|iPhone|iPad/.test(navigator.userAgent)
      ? 'fb-messenger://share/?link=' + encodeURIComponent(d.url)
      : query('https://www.facebook.com/dialog/send', { app_id: appId, link: d.url, redirect_uri: d.url })),
})

export const whatsapp: ShareTarget = {
  id: 'whatsapp',
  name: 'WhatsApp',
  color: '#25d366',
  icon: I.whatsapp,
  box: B,
  url: (d) => query('https://wa.me/', { text: message(d) }),
}

export const telegram: ShareTarget = {
  id: 'telegram',
  name: 'Telegram',
  color: '#26a5e4',
  icon: I.telegram,
  box: B,
  url: (d) =>
    query('https://t.me/share/url', d.url ? { url: d.url, text: d.text || d.title } : { url: d.text || d.title }),
}

export const linkedin: ShareTarget = {
  id: 'linkedin',
  name: 'LinkedIn',
  color: '#0a66c2',
  icon: I.linkedin,
  box: B,
  url: (d) => d.url && query('https://www.linkedin.com/sharing/share-offsite/', { url: d.url }),
}

export const reddit: ShareTarget = {
  id: 'reddit',
  name: 'Reddit',
  color: '#ff4500',
  icon: I.reddit,
  box: B,
  url: (d) => d.url && query('https://www.reddit.com/submit', { url: d.url, title: d.title || d.text }),
}

export const pinterest: ShareTarget = {
  id: 'pinterest',
  name: 'Pinterest',
  color: '#bd081c',
  icon: I.pinterest,
  box: B,
  url: (d) =>
    d.url &&
    query('https://www.pinterest.com/pin/create/button/', {
      url: d.url,
      description: d.text || d.title,
      media: (document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null)?.content,
    }),
}

export const tumblr: ShareTarget = {
  id: 'tumblr',
  name: 'Tumblr',
  color: '#36465d',
  icon: I.tumblr,
  box: B,
  url: (d) =>
    d.url &&
    query('https://www.tumblr.com/widgets/share/tool', { canonicalUrl: d.url, title: d.title, caption: d.text }),
}

export const bluesky: ShareTarget = {
  id: 'bluesky',
  name: 'Bluesky',
  color: '#1185fe',
  icon: I.bluesky,
  box: B,
  url: (d) => query('https://bsky.app/intent/compose', { text: message(d) }),
}

/** Mastodon and other Fediverse servers, through Share₂Fedi (asks for the server). */
export const mastodon: ShareTarget = {
  id: 'mastodon',
  name: 'Mastodon',
  color: '#6364ff',
  icon: I.mastodon,
  box: B,
  url: (d) => query('https://s2f.kytta.dev/', { text: message(d) }),
}

export const threads: ShareTarget = {
  id: 'threads',
  name: 'Threads',
  color: '#000',
  icon: I.threads,
  box: B,
  url: (d) => query('https://www.threads.com/intent/post', { text: d.text || d.title, url: d.url }),
}

export const hackernews: ShareTarget = {
  id: 'hackernews',
  name: 'Hacker News',
  color: '#f0652f',
  icon: I.hackernews,
  box: B,
  url: (d) => d.url && query('https://news.ycombinator.com/submitlink', { u: d.url, t: d.title || d.text }),
}

export const vk: ShareTarget = {
  id: 'vk',
  name: 'VK',
  color: '#07f',
  icon: I.vk,
  box: B,
  url: (d) => d.url && query('https://vk.com/share.php', { url: d.url, title: d.title }),
}

/** Odnoklassniki (OK.ru). */
export const ok: ShareTarget = {
  id: 'ok',
  name: 'OK',
  names: { ru: 'Одноклассники' },
  color: '#ee8208',
  icon: I.ok,
  box: B,
  url: (d) => d.url && query('https://connect.ok.ru/offer', { url: d.url, title: d.title }),
}

export const weibo: ShareTarget = {
  id: 'weibo',
  name: 'Weibo',
  names: { zh: '微博', 'zh-hant': '微博' },
  color: '#e6162d',
  icon: I.weibo,
  box: B,
  url: (d) => d.url && query('https://service.weibo.com/share/share.php', { url: d.url, title: d.text || d.title }),
}

export const qzone: ShareTarget = {
  id: 'qzone',
  name: 'Qzone',
  names: { zh: 'QQ空间', 'zh-hant': 'QQ空間' },
  color: '#fece00',
  icon: I.qzone,
  box: B,
  url: (d) =>
    d.url &&
    query('https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey', {
      url: d.url,
      title: d.title,
      summary: d.text,
    }),
}

export const douban: ShareTarget = {
  id: 'douban',
  name: 'Douban',
  names: { zh: '豆瓣', 'zh-hant': '豆瓣' },
  color: '#2d963d',
  icon: I.douban,
  box: B,
  url: (d) => d.url && query('https://www.douban.com/recommend/', { href: d.url, name: d.title, text: d.text }),
}

/** WeChat has no web share link: this shows a QR code to scan with the WeChat app. */
export const wechat: ShareTarget = {
  id: 'wechat',
  name: 'WeChat',
  names: { zh: '微信', 'zh-hant': '微信' },
  color: '#07c160',
  icon: I.wechat,
  box: B,
  when: (d) => d.url,
  run: (d, s) => qrView(d.url, s),
}

export const line: ShareTarget = {
  id: 'line',
  name: 'LINE',
  color: '#06c755',
  icon: I.line,
  box: B,
  url: (d) => query('https://line.me/R/share', { text: message(d) }),
}

/**
 * KakaoTalk. Kakao has no plain share link: this target appears only when the Kakao JavaScript SDK
 * is loaded and initialized on the page (`Kakao.init(appKey)`), and uses `Kakao.Share.sendScrap()`.
 */
export const kakaotalk: ShareTarget = {
  id: 'kakaotalk',
  name: 'KakaoTalk',
  names: { ko: '카카오톡' },
  color: '#ffcd00',
  icon: I.kakaotalk,
  box: B,
  when: (d) => d.url && (window as any).Kakao?.Share,
  run(d, s) {
    ;(window as any).Kakao.Share.sendScrap({ requestUrl: d.url })
    s.ok()
    s.close()
  },
}

export const naver: ShareTarget = {
  id: 'naver',
  name: 'NAVER',
  names: { ko: '네이버' },
  color: '#03c75a',
  icon: I.naver,
  box: B,
  url: (d) => d.url && query('https://share.naver.com/web/shareView', { url: d.url, title: d.title }),
}

/** NAVER BAND. */
export const band: ShareTarget = {
  id: 'band',
  name: 'BAND',
  names: { ko: '밴드' },
  color: '#1ec800',
  icon: 'M8.5 4v16h4a4.5 4.5 0 000-9h-4',
  stroke: true,
  url: (d) => query('https://band.us/plugin/share', { body: message(d), route: location.host }),
}

/** Hatena Bookmark. */
export const hatena: ShareTarget = {
  id: 'hatena',
  name: 'Hatena',
  names: { ja: 'はてブ' },
  color: '#00a4de',
  icon: I.hatena,
  box: B,
  url: (d) => d.url && query('https://b.hatena.ne.jp/add', { mode: 'confirm', url: d.url, title: d.title }),
}

export const xing: ShareTarget = {
  id: 'xing',
  name: 'XING',
  color: '#006567',
  icon: I.xing,
  box: B,
  url: (d) => d.url && query('https://www.xing.com/spi/shares/new', { url: d.url }),
}

export const snapchat: ShareTarget = {
  id: 'snapchat',
  name: 'Snapchat',
  color: '#fffc00',
  icon: I.snapchat,
  box: B,
  url: (d) => d.url && query('https://www.snapchat.com/share', { link: d.url }),
}

/** Substack Notes. */
export const substack: ShareTarget = {
  id: 'substack',
  name: 'Substack',
  color: '#ff6719',
  icon: I.substack,
  box: B,
  url: (d) => query('https://substack.com/notes', { action: 'compose', message: message(d) }),
}

export const flipboard: ShareTarget = {
  id: 'flipboard',
  name: 'Flipboard',
  color: '#e12828',
  icon: I.flipboard,
  box: B,
  url: (d) => d.url && query('https://share.flipboard.com/bookmarklet/popout', { v: '2', title: d.title, url: d.url }),
}

export const instapaper: ShareTarget = {
  id: 'instapaper',
  name: 'Instapaper',
  color: '#1f1f1f',
  icon: I.instapaper,
  box: B,
  url: (d) => d.url && query('https://www.instapaper.com/hello2', { url: d.url, title: d.title, description: d.text }),
}

export const blogger: ShareTarget = {
  id: 'blogger',
  name: 'Blogger',
  color: '#ff5722',
  icon: I.blogger,
  box: B,
  url: (d) => d.url && query('https://www.blogger.com/blog-this.g', { u: d.url, n: d.title, t: d.text }),
}

export const livejournal: ShareTarget = {
  id: 'livejournal',
  name: 'LiveJournal',
  color: '#00b0ea',
  icon: I.livejournal,
  box: B,
  url: (d) => query('https://www.livejournal.com/update.bml', { subject: d.title, event: body(d) }),
}

/** Microsoft Teams. */
export const teams: ShareTarget = {
  id: 'teams',
  name: 'Teams',
  color: '#6264a7',
  icon: I.teams,
  box: B,
  url: (d) => d.url && query('https://teams.microsoft.com/share', { href: d.url, msgText: d.text || d.title }),
}

/** Viber (app link, needs Viber installed). */
export const viber: ShareTarget = {
  id: 'viber',
  name: 'Viber',
  color: '#7360f2',
  icon: I.viber,
  box: B,
  url: (d) => 'viber://forward?text=' + encodeURIComponent(message(d)),
}

export const buffer: ShareTarget = {
  id: 'buffer',
  name: 'Buffer',
  color: '#231f20',
  icon: I.buffer,
  box: B,
  url: (d) => d.url && query('https://buffer.com/add', { url: d.url, text: d.text || d.title }),
}

/** Raindrop.io bookmarks. */
export const raindrop: ShareTarget = {
  id: 'raindrop',
  name: 'Raindrop',
  color: '#1988e0',
  icon: 'M12 3c3.2 4 6.5 7.5 6.5 11a6.5 6.5 0 01-13 0c0-3.5 3.3-7 6.5-11z',
  url: (d) => d.url && query('https://app.raindrop.io/add', { link: d.url, title: d.title }),
}

/** Google Classroom. */
export const classroom: ShareTarget = {
  id: 'classroom',
  name: 'Classroom',
  color: '#0f9d58',
  icon: I.classroom,
  box: B,
  url: (d) => d.url && query('https://classroom.google.com/share', { url: d.url, title: d.title, body: d.text }),
}

export const gmail: ShareTarget = {
  id: 'gmail',
  name: 'Gmail',
  color: '#ea4335',
  icon: I.gmail,
  box: B,
  url: (d) => query('https://mail.google.com/mail/', { view: 'cm', su: d.title, body: body(d) }),
}

/** Outlook.com. */
export const outlook: ShareTarget = {
  id: 'outlook',
  name: 'Outlook',
  color: '#0078d4',
  icon: I.outlook,
  box: B,
  url: (d) => query('https://outlook.live.com/mail/0/deeplink/compose', { subject: d.title, body: body(d) }),
}

/** Yahoo Mail. */
export const yahoo: ShareTarget = {
  id: 'yahoo',
  name: 'Yahoo Mail',
  color: '#6001d2',
  icon: I.yahoo,
  box: B,
  url: (d) => query('https://compose.mail.yahoo.com/', { subject: d.title, body: body(d) }),
}
