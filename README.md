# web-share-polyfill

[![npm](https://img.shields.io/npm/v/web-share-polyfill)](https://www.npmjs.com/package/web-share-polyfill) [![CI](https://github.com/tomchen/web-share-polyfill/actions/workflows/ci.yml/badge.svg)](https://github.com/tomchen/web-share-polyfill/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

`navigator.share()` for every browser. When the browser has its own share sheet, it is used. When it doesn't (Chrome and Edge on Linux, Firefox on desktop, in-app browsers, iframes without permission), a small share sheet that looks like the native one opens instead: copy link, QR code, email, SMS, and 40+ apps, in 70 languages.

**[Docs and live demo](https://tomchen.github.io/web-share-polyfill/)**

<p>
  <img src="https://raw.githubusercontent.com/tomchen/web-share-polyfill/main/site/img/android-light.png" width="200" alt="Share sheet, Android look">
  <img src="https://raw.githubusercontent.com/tomchen/web-share-polyfill/main/site/img/ios-light.png" width="200" alt="Share sheet, iOS look">
  <img src="https://raw.githubusercontent.com/tomchen/web-share-polyfill/main/site/img/android-dark-zh.png" width="200" alt="Share sheet in Chinese, dark mode">
  <img src="https://raw.githubusercontent.com/tomchen/web-share-polyfill/main/site/img/ios-dark-ja.png" width="200" alt="Share sheet in Japanese, iOS look, dark mode">
</p>

- **Native first.** The browser's share sheet is always preferred. When it refuses a share, the fallback sheet opens instead: [the polyfill works where the native API says no](#beyond-the-native-api).
- **Looks native.** iOS style on Apple devices, Android/Chrome style elsewhere. Bottom sheet on phones, dialog on desktop, dark mode, right-to-left languages.
- **Small and tree-shakable.** The core is ~4.5 KB gzipped. Each target and each language is a separate export, so you only ship what you use.
- **70 languages**, chosen from the viewer's browser language. **Default targets depend on the language too**: WeChat, Weibo and QQ for Chinese, LINE for Japanese and Traditional Chinese, KakaoTalk and BAND for Korean, VK and Telegram for Russian, and so on.
- **Isolated.** The sheet lives in a shadow root under a `<web-share-polyfill>` element, so its ids, classes and styles can't collide with your page's. No inline styles or HTML strings, so it works under a strict Content Security Policy and Trusted Types.
- **Spec behavior.** `navigator.share()` resolves when something was shared and rejects with an `AbortError` when the sheet is dismissed. `navigator.canShare()` is polyfilled too. Apps open as real links (`<a target="_blank">`), so popup blockers don't get in the way.

## Install

```sh
npm i web-share-polyfill
```

Or with a script tag, which installs the polyfill with every target and language (about 21 KB gzipped):

<!-- vbt-version +2 -->
```html
<script src="https://cdn.jsdelivr.net/npm/web-share-polyfill@0.0.0/dist/web-share-polyfill.js"></script>
```

## Usage

### Everything, automatic

```js
import 'web-share-polyfill/auto'

button.addEventListener('click', () => {
  navigator.share({ title: document.title, url: location.href }).catch(() => {})
})
```

This installs `navigator.share()` and `navigator.canShare()` with every language and the [default targets](#default-targets-by-language), picked from the viewer's language. It bundles only those targets; use `/full` to pick any target by id.

### Choose targets (recommended)

Import only what you need. Everything else is tree-shaken.

```js
import { polyfill } from 'web-share-polyfill'
import { copy, qr, email, whatsapp, facebook, x, telegram, linkedin } from 'web-share-polyfill/targets'
import { fr, de, zh, zhHant, ja } from 'web-share-polyfill/locales'

polyfill({
  targets: [copy, qr, email, whatsapp, facebook, x, telegram, linkedin],
  locales: [fr, de, zh, zhHant, ja], // English is built in
})
```

### Call it directly

`share()` works without touching `navigator`, and resolves with the id of the target that was used, which is handy for analytics:

```js
import { share } from 'web-share-polyfill'
import { copy, qr, x } from 'web-share-polyfill/targets'

const id = await share({ url: location.href }, { targets: [copy, qr, x] })
// 'native' when the browser's own sheet was used, otherwise 'copy', 'qr', 'x', …
```

### Different targets by language

`targets` can also be one list per viewer language, with `'*'` for everyone else. The sheet uses the list that matches the viewer's language (`zh-TW` gets `zh-hant`, `pt-BR` gets `pt`):

```js
import { polyfill } from 'web-share-polyfill'
import { copy, qr, email, whatsapp, facebook, x, wechat, weibo, line } from 'web-share-polyfill/targets'

polyfill({
  targets: {
    '*': [copy, qr, email, whatsapp, facebook, x],
    zh: [copy, qr, email, wechat, weibo],
    ja: [copy, qr, email, line, x],
  },
})
```

### Everything, with ids

`web-share-polyfill/full` includes every target and language, accepts target ids, and uses the [default targets](#default-targets-by-language) unless you pass your own:

```js
import { polyfill } from 'web-share-polyfill/full'

polyfill() // the defaults for the viewer's language
polyfill({ targets: ['copy', 'qr', 'email', 'x', 'bluesky', 'mastodon'] })
polyfill({ targets: { '*': ['copy', 'qr', 'x'], zh: ['copy', 'qr', 'wechat', 'weibo'] } })
```

With the script tag, the same API is on `window.WebSharePolyfill`:

```html
<script>
  WebSharePolyfill.polyfill({ targets: { '*': ['copy', 'qr', 'x'], zh: ['copy', 'qr', 'wechat', 'weibo'] } })
</script>
```

The [playground](https://tomchen.github.io/web-share-polyfill/#playground) builds any of these setups for you (npm or script tag, targets, languages, fallback, look, text) and gives you the code to paste.

## Options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `targets` | `ShareTarget[]` or `Record<string, ShareTarget[]>` | `[]` in the core, `defaults` in `/full` | Buttons, in display order, or [one list per viewer language](#different-targets-by-language) with `'*'` for the rest. Targets with a brand color are shown as apps, the others (copy, QR code, email…) as actions. |
| `locales` | `string[]` | English only in the core, all in `/full` | Languages available to the sheet: imported locales in the core; with `/full` and the script tag, codes like `['fr', 'zh-hant']` also work. English is always available. |
| `lang` | `string \| string[]` | `navigator.languages` | Force a language, e.g. `'ja'` or `document.documentElement.lang`. |
| `fallback` | `string` | `'en'` | Locale code used when none of the viewer's languages is available, e.g. `'fr'`. |
| `strings` | `Partial<Strings>` or `Record<string, Partial<Strings>>` | | Override UI strings: `share`, `close`, `copy`, `copyLink`, `copied`, `qr`, `email`, `sms`, `print`, `more`, `back`. One set for every language (`{ copied: 'Done!' }`), or sets by the sheet's language, with `'*'` for all of them: `{ '*': { share: 'Send' }, zh: { copied: '好了' } }`. |
| `look` | `'apple' \| 'material'` | `apple` on Apple devices | Visual style. |
| `theme` | `'light' \| 'dark'` | system | Color scheme. |
| `native` | `boolean` | `true` | Use the browser's share sheet when there is one. Set to `false` to always show this sheet (add the `more` target to let people reach the native one). |

## Targets

Actions:

| id | | Shown when |
| --- | --- | --- |
| `copy` | Copy link (or text); with nothing but files, one image or text file | always |
| `save` | Save the shared files, to pass them on from there (labelled with the file name) | sharing files |
| `qr` | QR code of the link, to open it on a phone | always |
| `email` | Default mail app (`mailto:`) | always |
| `sms` | Default messaging app (`sms:`) | on touch screens |
| `print` | Print the page | sharing the current page |
| `more` | The browser's own share sheet | the browser has one and `native: false` |

Apps:

| id | | id | | id | |
| --- | --- | --- | --- | --- | --- |
| `whatsapp` | WhatsApp | `facebook` | Facebook | `x` | X |
| `telegram` | Telegram | `linkedin` | LinkedIn | `reddit` | Reddit |
| `threads` | Threads | `bluesky` | Bluesky | `mastodon` | Mastodon & Fediverse ¹ |
| `pinterest` | Pinterest | `tumblr` | Tumblr | `hackernews` | Hacker News |
| `line` | LINE | `wechat` | WeChat ² | `weibo` | Weibo |
| `qzone` | Qzone | `douban` | Douban | `kakaotalk` | KakaoTalk ³ |
| `naver` | NAVER | `band` | BAND | `hatena` | Hatena Bookmark |
| `vk` | VK | `ok` | Odnoklassniki | `viber` | Viber ⁴ |
| `teams` | Microsoft Teams | `xing` | XING | `snapchat` | Snapchat |
| `substack` | Substack Notes | `flipboard` | Flipboard | `buffer` | Buffer |
| `instapaper` | Instapaper | `raindrop` | Raindrop.io | `blogger` | Blogger |
| `livejournal` | LiveJournal | `classroom` | Google Classroom | `gmail` | Gmail |
| `outlook` | Outlook.com | `yahoo` | Yahoo Mail | `messenger(appId)` | Messenger ⁵ |

1. Through [Share₂Fedi](https://s2f.kytta.dev/), which asks for the server.
2. WeChat has no web share link; this shows a QR code to scan with WeChat.
3. Needs the [Kakao JavaScript SDK](https://developers.kakao.com/docs/latest/en/javascript/getting-started) loaded and initialized on the page; hidden otherwise.
4. App link (`viber://`), needs Viber installed.
5. A function: `messenger('your Facebook app id')`. Uses the Messenger app on phones.

Targets that need a link (most apps) are hidden when you share text only.

Not included: Skype, Pocket and Mix (shut down), the KakaoStory share link (discontinued by Kakao), and services without a web share link (Instagram, Signal, Discord, Slack).

### Default targets by language

With `/full`, `/auto` or the script tag, and exported as `defaults` (`'*'` for the other languages). Actions come first in the list and are shown apart from the apps.

| Language | Targets |
| --- | --- |
| Chinese (Simplified) | copy, qr, email, sms, WeChat, Weibo, Qzone, Douban, more |
| Chinese (Traditional) | copy, qr, email, sms, LINE, Facebook, WhatsApp, Threads, X, more |
| Japanese | copy, qr, email, sms, LINE, X, Facebook, Hatena, more |
| Korean | copy, qr, email, sms, KakaoTalk, BAND, NAVER, Facebook, X, more |
| Russian, Belarusian, Kazakh | copy, qr, email, sms, Telegram, WhatsApp, VK, OK, more |
| Ukrainian | copy, qr, email, sms, Telegram, Viber, Facebook, WhatsApp, X, more |
| German | copy, qr, email, sms, WhatsApp, Facebook, X, LinkedIn, XING, more |
| Thai | copy, qr, email, sms, LINE, Facebook, X, more |
| Vietnamese | copy, qr, email, sms, Facebook, Telegram, X, more |
| Persian | copy, qr, email, sms, Telegram, WhatsApp, X, more |
| Other languages | copy, qr, email, sms, WhatsApp, Facebook, X, Telegram, LinkedIn, Reddit, more |

`sms` only appears on touch screens, `more` only when the browser has a share sheet of its own, and `save` (after `copy` in every list) only when sharing files.

### Custom targets

```js
const mySite = {
  id: 'mysite',
  name: 'My Site',
  names: { fr: 'Mon site' }, // optional, by locale
  color: '#ff6600', // brand color: shown as an app
  icon: 'M4 4h16v16H4z', // SVG path, 24×24 box (Simple Icons paths work as is)
  url: (d) => d.url && `https://example.com/submit?u=${encodeURIComponent(d.url)}`,
}
```

`url(data)` returns the link to open, or an empty value to hide the target. For actions handled in the page, use `run(data, sheet)` instead; `sheet` has `ok()`, `close()`, `view(title, node)`, `item`, `label` and `strings`. `when(data)` hides the target when it returns a falsy value. `stroke: true` draws the icon as a 2 px outline, and `box` sets another viewBox size.

## Languages

af, am, ar, az, be, bg, bn, ca, cs, da, de, el, en, es, et, eu, fa, fi, fil, fr, gl, gu, he, hi, hr, hu, hy, id, is, it, ja, ka, kk, km, kn, ko, lt, lv, mk, ml, mn, mr, ms, my, nb, ne, nl, pa, pl, pt, pt-PT (`ptPT`), ro, ru, si, sk, sl, sq, sr, sv, sw, ta, te, th, tr, uk, ur, uz, vi, zh (Simplified), zh-Hant (`zhHant`, used for zh-TW, zh-HK and zh-MO).

The language is matched from `navigator.languages` (`pt-BR` → `pt`, `zh-TW` → `zh-Hant`, `no` → `nb`…). Arabic, Hebrew, Persian and Urdu are laid out right to left. Translation fixes are welcome.

## Styling

The sheet is in a shadow root, so page CSS doesn't reach it. Set these custom properties on the element (they inherit), or on `:root`:

```css
web-share-polyfill {
  --wsp-accent: #7c3aed; /* focus ring */
  --wsp-bg: #fff; /* sheet background */
  --wsp-fg: #111; /* text */
  --wsp-muted: #666; /* secondary text */
  --wsp-tile: #eee; /* action buttons */
  --wsp-line: #ddd; /* separators */
  --wsp-radius: 20px;
  --wsp-font: 'Inter', sans-serif;
  --wsp-backdrop: rgb(0 0 0 / 0.5);
}
```

For more, the parts are `sheet`, `close`, `target`, `icon` and `label`:

```css
web-share-polyfill::part(target) { border-radius: 8px; }
```

## Beyond the native API

The native `navigator.share()` has restrictions that the polyfill doesn't have. Where the native API says no, the fallback sheet opens instead:

| Native `navigator.share()` | With the polyfill |
| --- | --- |
| HTTPS pages only | Plain `http:` pages too |
| Must be called right from a click or a tap, or it throws `NotAllowedError` | Any time: after an `await`, in a timer… |
| In an iframe, only with `allow="web-share"`, or it throws `NotAllowedError` | Any iframe |
| `http:` and `https:` links only, or it throws `TypeError` | Any link: `mailto:`, `tel:`, app links… |
| Not in desktop Firefox, Chrome and Edge on Linux, Android WebView and many in-app browsers | Every browser |
| Files: some types only (Chrome), and none in desktop Firefox, Chrome and Edge on Linux or Android WebView | Any file: saved, or copied (one image or text file) |

## How it decides

1. `native` is not `false`, `navigator.share` exists and its `canShare()` accepts the data: the native sheet opens. If it throws `NotAllowedError` or `TypeError` (see [above](#beyond-the-native-api)), the fallback sheet opens instead; any other error, including `AbortError` when the person cancels, is passed on.
2. Otherwise the fallback sheet opens. It resolves with the chosen target's id and rejects with `AbortError` when closed without sharing. A second call while it is open rejects with `InvalidStateError`.
3. `files` go to the native API when it takes them. Otherwise the fallback sheet shows the targets that take files: `save`, and `copy` for one image or text file (the apps take links and text, not files; they show up too when there is also a title, text or link). With no such target, `share()` rejects with a `TypeError`.

   The polyfilled `canShare({ files })` tells the truth: `true` when the native API takes the files or one of the configured targets does, `false` otherwise. Sites use it to choose between sharing a file and sharing a link to it, so it never promises a sheet with nothing to do.

The polyfill keeps a reference to the browser's own `navigator.share()`, so it can be installed any number of times, or by two copies of the library, without wrapping itself.

## Size

Minified and gzipped, measured by the build (`dist/sizes.json`):

| | gzip | brotli |
| --- | --- | --- |
| Core (`polyfill()`, English, no targets) | 4.5 KB | 4.0 KB |
| Core + copy, qr, email and 5 apps | 7.9 KB | 7.1 KB |
| Default targets, every language (`/auto`) | 17.8 KB | 14.9 KB |
| Everything (`/full`, script tag) | 21.2 KB | 17.8 KB |

The QR code encoder (1.8 KB) is only included with the `qr` or `wechat` targets.

## Browser support

Browsers with `<dialog>`, shadow DOM and CSS `light-dark()`: Chrome and Edge 123+, Firefox 120+, Safari 17.5+. Older Safari versions have native Web Share and never need the sheet.

## Development

```sh
bun install
bunx playwright install chromium firefox webkit   # once, for the browser tests

bun run test           # unit tests (Vitest, happy-dom); test:coverage for a coverage report
bun run test:browser   # the sheet in real Chromium, Firefox and WebKit
bun run build          # dist/ and size report
bun run test:dist      # the built files, and size budgets
bun run lint:pkg       # package.json and types as published (publint, are-the-types-wrong)
bun run format         # Prettier
bun run check          # all of the above, as CI runs them
bun run dev            # build the docs site into _site/ and serve it
bun run icons          # regenerate src/icons.ts from Simple Icons
```

Use `bun run test`, not `bun test`: the latter is Bun's own test runner, and the tests are written for Vitest.

### Releasing

Releases are published to npm by GitHub Actions when a `v*` tag is pushed. [vbt](https://www.npmjs.com/package/vbt) bumps the version, updates the version in this README, commits, tags and pushes:

```sh
bun run release patch   # or minor, major, 1.2.3
```

It runs `bun run check` first. The tag then triggers [the release workflow](.github/workflows/release.yml), which runs CI again on the tagged commit and publishes only if it passes; see that file for the npm setup.

## Credits

Brand icons from [Simple Icons](https://simpleicons.org/) (CC0); brand names and logos are trademarks of their owners. The QR code encoder follows the algorithm of [Project Nayuki's QR Code generator](https://www.nayuki.io/page/qr-code-generator-library) (MIT).

## License

[MIT](LICENSE)
