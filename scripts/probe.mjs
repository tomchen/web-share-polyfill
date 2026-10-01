// Checks which desktop browsers have a native navigator.share(), in the real browsers installed on this
// machine (not Playwright's builds): each one opens a local page that reports back. MDN's data has no
// per-OS detail (it lists Chrome as fully supported, yet Chrome on Linux has no navigator.share()).
//
// Usage: node scripts/probe.mjs > probe-linux.json       (one OS; run on each by .github/workflows/compat.yml)
//        node scripts/probe.mjs --merge probe-*.json     (writes site/probe.json)
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'site/probe.json'

if (process.argv[2] == '--merge') {
  const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
  // On top of the last results: a browser that couldn't be tested this time (it failed to install or
  // start) keeps them
  const results = structuredClone(old.results || {})
  for (const file of process.argv.slice(3)) {
    const { os, browsers } = JSON.parse(readFileSync(file, 'utf8'))
    for (const [b, r] of Object.entries(browsers)) (results[b] ??= {})[os] = r
  }
  // Keep the old date when nothing changed, so the file only changes with the results
  const same = JSON.stringify(old.results) == JSON.stringify(results)
  const tested = same ? old.tested : new Date().toISOString().slice(0, 10)
  writeFileSync(OUT, JSON.stringify({ tested, results }, null, 2) + '\n')
  console.log(same ? 'No changes' : `Updated ${OUT}`)
  process.exit()
}

const OS = { linux: 'linux', win32: 'windows', darwin: 'macos' }[platform()]
const PF = process.env.ProgramFiles || 'C:\\Program Files'
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
const LAD = process.env.LOCALAPPDATA || ''
const APPS = {
  chrome: {
    linux: ['/opt/google/chrome/chrome', '/usr/bin/google-chrome'],
    windows: [`${PF}\\Google\\Chrome\\Application\\chrome.exe`, `${PF86}\\Google\\Chrome\\Application\\chrome.exe`],
    macos: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  },
  edge: {
    linux: ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge'],
    windows: [`${PF86}\\Microsoft\\Edge\\Application\\msedge.exe`, `${PF}\\Microsoft\\Edge\\Application\\msedge.exe`],
    macos: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  },
  firefox: {
    linux: ['/usr/lib/firefox/firefox', '/usr/bin/firefox'],
    windows: [`${PF}\\Mozilla Firefox\\firefox.exe`, `${PF86}\\Mozilla Firefox\\firefox.exe`],
    macos: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
  },
  opera: {
    linux: ['/usr/lib/x86_64-linux-gnu/opera-stable/opera', '/usr/lib/x86_64-linux-gnu/opera/opera', '/snap/bin/opera'],
    windows: [`${LAD}\\Programs\\Opera\\opera.exe`, `${PF}\\Opera\\opera.exe`, `${PF86}\\Opera\\opera.exe`],
    macos: ['/Applications/Opera.app/Contents/MacOS/Opera'],
  },
  safari: { macos: ['/Applications/Safari.app'] },
}
const VERSION = {
  chrome: /Chrome\/(\d+)/,
  edge: /Edg\/(\d+)/,
  firefox: /Firefox\/(\d+)/,
  opera: /OPR\/(\d+)/,
  safari: /Version\/(\d+(?:\.\d+)?)/,
}

// The page each browser opens (localhost is a secure context, which navigator.share() needs)
const reports = {}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const b = url.searchParams.get('b')
  if (req.method == 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      reports[b]?.(JSON.parse(body))
      res.end()
    })
    return
  }
  res.setHeader('content-type', 'text/html')
  res.end(`<!doctype html><script>
    fetch('/report?b=${b}', { method: 'POST', body: JSON.stringify({
      ua: navigator.userAgent, share: 'share' in navigator, canShare: 'canShare' in navigator, secure: isSecureContext,
    }) })
  </script>`)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://localhost:${server.address().port}/probe`

const run = async (b, app) => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'))
  const url = `${base}?b=${b}`
  const args =
    b == 'firefox'
      ? ['--headless', '--no-remote', '--profile', dir, url]
      : [
          '--headless=new',
          '--no-first-run',
          '--no-default-browser-check',
          `--user-data-dir=${dir}`,
          // Ubuntu's AppArmor rules can keep the sandbox from starting; this only opens a local page
          ...(OS == 'linux' ? ['--no-sandbox'] : []),
          url,
        ]
  const child =
    b == 'safari' ? spawn('open', ['-a', app, url]) : spawn(app, args, { detached: OS != 'windows', stdio: 'pipe' })
  child.on('error', () => {})
  // Keep the end of the browser's output, to explain a failure
  let log = ''
  child.stderr?.on('data', (c) => (log = (log + c).slice(-2000)))
  child.stdout?.on('data', () => {})
  try {
    const report = await new Promise((resolve, reject) => {
      reports[b] = resolve
      setTimeout(() => reject(new Error(`no report within 60 s\n${log}`)), 60_000)
    })
    return { version: report.ua.match(VERSION[b])?.[1] ?? null, share: report.share, canShare: report.canShare }
  } finally {
    if (b == 'safari') execFileSync('osascript', ['-e', 'quit app "Safari"'])
    else if (OS == 'windows') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    else {
      try {
        process.kill(-child.pid)
      } catch {}
    }
    setTimeout(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }), 2000)
  }
}

const browsers = {}
for (const [b, paths] of Object.entries(APPS)) {
  const app = paths[OS]?.find((p) => existsSync(p))
  if (!app) continue
  try {
    browsers[b] = await run(b, app)
  } catch (e) {
    console.error(`${b}: ${e.message}`)
  }
}
console.log(JSON.stringify({ os: OS, browsers }, null, 2))
server.close()
setTimeout(() => process.exit(), 2500)
