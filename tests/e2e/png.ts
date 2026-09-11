import { inflateSync } from 'node:zlib'

type Raster = {
  readonly width: number
  readonly height: number
  /** How dark the pixel is, 0 white to 255 black, from the green channel. */
  readonly darkness: (x: number, y: number) => number
}

/**
 * Enough of PNG to read a screenshot back: eight-bit colour, no interlace, which is what the
 * browser writes. Decoding it here keeps the measurement free of a dependency.
 */
export function decodePng(file: Buffer): Raster {
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error('that is not a PNG')
  let width = 0
  let height = 0
  let channels = 4
  const parts: Buffer[] = []
  let at = 8
  while (at < file.length) {
    const length = file.readUInt32BE(at)
    const kind = file.toString('ascii', at + 4, at + 8)
    const body = file.subarray(at + 8, at + 8 + length)
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      if (body[8] !== 8) throw new Error('only eight-bit PNGs are read here')
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 1
      if (body[12] !== 0) throw new Error('an interlaced PNG is not read here')
    }
    if (kind === 'IDAT') parts.push(body)
    if (kind === 'IEND') break
    at += length + 12
  }
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)]
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1))
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? (pixels[row * stride + index - channels] ?? 0) : 0
      const up = row > 0 ? (pixels[(row - 1) * stride + index] ?? 0) : 0
      const upLeft =
        row > 0 && index >= channels ? (pixels[(row - 1) * stride + index - channels] ?? 0) : 0
      const value = line[index] ?? 0
      let out = value
      if (filter === 1) out = value + left
      else if (filter === 2) out = value + up
      else if (filter === 3) out = value + ((left + up) >> 1)
      else if (filter === 4) {
        const guess = left + up - upLeft
        const dl = Math.abs(guess - left)
        const du = Math.abs(guess - up)
        const dul = Math.abs(guess - upLeft)
        out = value + (dl <= du && dl <= dul ? left : du <= dul ? up : upLeft)
      }
      pixels[row * stride + index] = out & 0xff
    }
  }
  const green = channels >= 3 ? 1 : 0
  return {
    width,
    height,
    darkness: (x, y) => 255 - (pixels[y * stride + x * channels + green] ?? 255),
  }
}

/**
 * The middle of every long vertical line in the image, left to right: a column counts as a line
 * where it is dark down more than `share` of the image's height.
 */
export function verticalLines(raster: Raster, share: number): readonly number[] {
  const wanted = raster.height * share
  const lines: number[] = []
  let run: number[] = []
  for (let x = 0; x < raster.width; x += 1) {
    let dark = 0
    for (let y = 0; y < raster.height; y += 1) if (raster.darkness(x, y) > 96) dark += 1
    if (dark >= wanted) run.push(x)
    else if (run.length > 0) {
      lines.push(run.reduce((sum, each) => sum + each, 0) / run.length)
      run = []
    }
  }
  if (run.length > 0) lines.push(run.reduce((sum, each) => sum + each, 0) / run.length)
  return lines
}
