import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { qr, qrPath } from '../src/qr.js'

/** Rasterize a module matrix (with a 4-module quiet zone) and decode it with jsQR. */
const decode = (m: boolean[][]): string | undefined => {
  const scale = 3
  const quiet = 4
  const n = m.length + quiet * 2
  const w = n * scale
  const px = new Uint8ClampedArray(w * w * 4).fill(255)
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * w + (x + quiet) * scale + dx) * 4
          px[i] = px[i + 1] = px[i + 2] = 0
        }
      }
    }),
  )
  return jsQR(px, w, w, { inversionAttempts: 'dontInvert' })?.data
}

// Byte-mode capacity at level M for versions 1..40
const CAPACITY = [
  14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911,
  997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331,
]

const text = (len: number, seed: number) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~:/?#[]@!$&()*+,;=%'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[(i * 7 + seed * 13 + ((i * i) % 11)) % chars.length]
  return s
}

// Encoding and decoding all 40 versions is CPU-heavy: allow for slow CI runners and busy machines
describe('qr', { timeout: 30_000 }, () => {
  it('picks the smallest version for each capacity boundary', () => {
    CAPACITY.forEach((cap, i) => {
      expect(qr(text(cap, i)).length, `v${i + 1} at capacity`).toBe((i + 1) * 4 + 17)
      if (i < 39) expect(qr(text(cap + 1, i)).length, `v${i + 2} just over`).toBe((i + 2) * 4 + 17)
    })
  })

  it('round-trips through a decoder for every version', () => {
    CAPACITY.forEach((cap, i) => {
      const s = text(cap, i + 1)
      expect(decode(qr(s)), `version ${i + 1}`).toBe(s)
    })
  })

  it('round-trips short, mid and non-ASCII inputs', () => {
    for (const s of [
      'a',
      'https://example.com/',
      'https://github.com/tomchen/web-share-polyfill?utm_source=share&utm_medium=qr#readme',
      'https://例え.jp/パス?q=分享 🚀',
      text(300, 3),
    ]) {
      expect(decode(qr(s))).toBe(s)
    }
  })

  it('throws when the text is too long', () => {
    expect(() => qr(text(2332, 0))).toThrow(RangeError)
  })

  it('builds a compact path', () => {
    const d = qrPath([
      [true, true, false],
      [false, true, false],
    ])
    expect(d).toBe('M2 2h2v1h-2zM3 3h1v1h-1z')
  })
})
