/**
 * Minimal PNG decoder + vertical luminance scan.
 *
 * Puppeteer screenshots are non-interlaced 8-bit RGBA/RGB PNGs, which is a
 * small enough subset to decode with zlib alone — avoids adding an image
 * dependency just to answer "is there a hard horizontal edge here".
 */
import { inflateSync } from 'node:zlib'

function readChunks(buf) {
  const chunks = []
  let off = 8 // skip signature
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    chunks.push({ type, data })
    off += 12 + len
  }
  return chunks
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

export function decodePNG(buf) {
  const chunks = readChunks(buf)
  const ihdr = chunks.find((c) => c.type === 'IHDR').data
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const bitDepth = ihdr[8]
  const colorType = ihdr[9]
  const interlace = ihdr[12]
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth=${bitDepth} interlace=${interlace}`)
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported colorType ${colorType}`)

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))
  const raw = inflateSync(idat)

  const bpp = channels
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)

  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      switch (filter) {
        case 0: break
        case 1: v = v + a; break
        case 2: v = v + b; break
        case 3: v = v + ((a + b) >> 1); break
        case 4: v = v + paeth(a, b, c); break
        default: throw new Error(`bad filter ${filter}`)
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, channels, data: out }
}

/**
 * Scan the image top-to-bottom, averaging each row's luminance, and report the
 * largest row-to-row jump. A hard seam (an abrupt edge where one layer stops)
 * shows up as a single large spike; a smooth gradient does not.
 */
export async function loadImage(pngBuffer) {
  const { width, height, channels, data } = decodePNG(pngBuffer)
  const rowLuma = new Array(height).fill(0)
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = 0; x < width; x++) {
      const i = y * width * channels + x * channels
      const r = data[i]
      const g = channels >= 3 ? data[i + 1] : r
      const b = channels >= 3 ? data[i + 2] : r
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    rowLuma[y] = sum / width
  }

  let maxJump = 0
  let maxJumpY = 0
  let total = 0
  for (let y = 1; y < height; y++) {
    const d = Math.abs(rowLuma[y] - rowLuma[y - 1])
    total += d
    if (d > maxJump) {
      maxJump = d
      maxJumpY = y
    }
  }
  return {
    rows: height,
    width,
    maxJump,
    maxJumpY,
    meanJump: total / (height - 1),
    rowLuma,
  }
}

export const createCanvas = null // not needed; kept so the import shape matches
