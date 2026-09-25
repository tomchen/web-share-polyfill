/**
 * Minimal QR Code encoder: byte mode (UTF-8), error correction level M,
 * versions 1-40, automatic mask selection.
 *
 * Written for size. The algorithm follows ISO/IEC 18004 as described in
 * Project Nayuki's "QR Code generator library" (MIT), which was used as a reference.
 */

// Per version 1..40 (index 0 unused), level M:
// error correction codewords per block, and number of blocks.
// Stored as char codes offset by 48 to keep the tables tiny.
const ECC_PER_BLOCK = '0:@JBH@BFFJNFFHHLLJJJJLLLLLLLLLLLLLLLLLLL'
const BLOCKS = '011122444555899::;=>@AABDEGIJLMOQSUVX[]_a'

/** GF(256) multiply with the QR polynomial 0x11D. */
const mul = (x: number, y: number): number => {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

/** Reed-Solomon ECC bytes for `data` with a generator of `degree`. */
const reedSolomon = (data: number[], degree: number): number[] => {
  const gen: number[] = Array(degree).fill(0)
  gen[degree - 1] = 1
  for (let i = 0, root = 1; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      gen[j] = mul(gen[j], root) ^ (gen[j + 1] || 0)
    }
    root = mul(root, 2)
  }
  const res: number[] = Array(degree).fill(0)
  for (const b of data) {
    const f = b ^ res.shift()!
    res.push(0)
    gen.forEach((g, i) => (res[i] ^= mul(g, f)))
  }
  return res
}

const rawModules = (v: number): number => {
  let r = (16 * v + 128) * v + 64
  if (v > 1) {
    const n = ((v / 7) | 0) + 2
    r -= (25 * n - 10) * n - 55
    if (v > 6) r -= 36
  }
  return r
}

/**
 * Encode `text` and return the module matrix (true = dark), without quiet zone.
 * Throws a RangeError if the text does not fit in version 40.
 */
export const qr = (text: string): boolean[][] => {
  const bytes = [...new TextEncoder().encode(text)]
  let v = 0
  let ecc = 0
  let blocks = 0
  let capacity = 0
  // Pick the smallest version that fits
  do {
    if (++v > 40) throw new RangeError('Too long')
    ecc = ECC_PER_BLOCK.charCodeAt(v) - 48
    blocks = BLOCKS.charCodeAt(v) - 48
    capacity = ((rawModules(v) >> 3) - ecc * blocks) * 8
  } while (4 + (v < 10 ? 8 : 16) + bytes.length * 8 > capacity)

  // Bit stream: mode (0100), length, data, terminator, padding
  const bits: number[] = []
  const put = (val: number, len: number) => {
    while (len--) bits.push((val >>> len) & 1)
  }
  put(4, 4)
  put(bytes.length, v < 10 ? 8 : 16)
  bytes.forEach((b) => put(b, 8))
  put(0, Math.min(4, capacity - bits.length))
  put(0, -bits.length & 7)
  for (let p = 0xec; bits.length < capacity; p ^= 0xec ^ 0x11) put(p, 8)

  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    data.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  }

  // Split into blocks, add ECC, interleave
  const total = rawModules(v) >> 3
  const shortBlocks = blocks - (total % blocks)
  const shortLen = ((total / blocks) | 0) - ecc
  const dataBlocks: number[][] = []
  const eccBlocks: number[][] = []
  for (let i = 0, k = 0; i < blocks; i++) {
    const len = shortLen + (i < shortBlocks ? 0 : 1)
    const blk = data.slice(k, (k += len))
    dataBlocks.push(blk)
    eccBlocks.push(reedSolomon(blk, ecc))
  }
  const codewords: number[] = []
  for (let i = 0; i <= shortLen; i++) dataBlocks.forEach((b) => i < b.length && codewords.push(b[i]))
  for (let i = 0; i < ecc; i++) eccBlocks.forEach((b) => codewords.push(b[i]))

  // Matrix with function patterns
  const size = v * 4 + 17
  const m: boolean[][] = []
  const fn: boolean[][] = []
  for (let i = 0; i < size; i++) {
    m.push(Array(size).fill(false))
    fn.push(Array(size).fill(false))
  }
  const set = (x: number, y: number, dark: boolean | number) => {
    m[y][x] = !!dark
    fn[y][x] = true
  }

  // Timing patterns
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 == 0)
    set(i, 6, i % 2 == 0)
  }
  // Finder patterns with separators
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d != 2 && d != 4)
      }
    }
  }
  // Alignment patterns
  if (v > 1) {
    const n = ((v / 7) | 0) + 2
    const step = v == 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2
    const pos = [6]
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p)
    pos.forEach((y, i) =>
      pos.forEach((x, j) => {
        if ((i || j) && (i || j != n - 1) && (i != n - 1 || j)) {
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1)
            }
          }
        }
      }),
    )
  }

  // Format bits (level M = 00) and version bits
  const drawFormat = (mask: number) => {
    let r = mask
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
    const f = ((mask << 10) | r) ^ 0x5412
    const bit = (i: number) => (f >>> i) & 1
    for (let i = 0; i < 6; i++) set(8, i, bit(i))
    set(8, 7, bit(6))
    set(8, 8, bit(7))
    set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, 1)
  }
  drawFormat(0) // reserve the format areas
  if (v > 6) {
    let r = v
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    const b = (v << 12) | r
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const c = (i / 3) | 0
      set(a, c, (b >>> i) & 1)
      set(c, a, (b >>> i) & 1)
    }
  }

  // Data placement in the zigzag order
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right == 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) == 0
        const y = upward ? size - 1 - vert : vert
        if (!fn[y][x] && i < codewords.length * 8) {
          m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) == 1
          i++
        }
      }
    }
  }

  // Masks
  const masks = [
    (x: number, y: number) => (x + y) % 2,
    (_: number, y: number) => y % 2,
    (x: number) => x % 3,
    (x: number, y: number) => (x + y) % 3,
    (x: number, y: number) => (((x / 3) | 0) + ((y / 2) | 0)) % 2,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3),
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2,
  ]
  const applyMask = (k: number) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!fn[y][x] && !masks[k](x, y)) m[y][x] = !m[y][x]
      }
    }
  }

  let best = 0
  let bestScore = Infinity
  for (let k = 0; k < 8; k++) {
    applyMask(k)
    drawFormat(k)
    const s = penalty(m)
    if (s < bestScore) {
      best = k
      bestScore = s
    }
    applyMask(k) // undo (XOR)
  }
  applyMask(best)
  drawFormat(best)
  return m
}

/**
 * Penalty score (ISO/IEC 18004 section 7.8.3), used to choose a mask.
 * Rules: runs of 5+ same modules, 2x2 blocks, finder-like patterns, dark balance.
 */
const penalty = (m: boolean[][]): number => {
  const n = m.length
  let score = 0
  let dark = 0
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 0
      let prev: boolean | undefined
      let line = ''
      for (let b = 0; b < n; b++) {
        const c = pass ? m[b][a] : m[a][b]
        line += c ? 1 : 0
        if (c === prev) {
          if (++run == 5) score += 3
          else if (run > 5) score++
        } else {
          run = 1
          prev = c
        }
        if (!pass) {
          if (c) dark++
          if (a && b && c == m[a - 1][b] && c == m[a][b - 1] && c == m[a - 1][b - 1]) score += 3
        }
      }
      // 1:1:3:1:1 finder-like patterns with 4 light modules on either side
      line = '0000' + line + '0000'
      for (let k = line.indexOf('1011101'); k >= 0; k = line.indexOf('1011101', k + 1)) {
        if (line.slice(k - 4, k) == '0000' || line.slice(k + 7, k + 11) == '0000') score += 40
      }
    }
  }
  return score + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
}

/** Build SVG path data for the matrix, one subpath per horizontal run of dark modules. */
export const qrPath = (m: boolean[][], margin = 2): string => {
  let d = ''
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x]) {
        let w = 1
        while (row[x + w]) w++
        d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`
        x += w
      }
    }
  })
  return d
}
