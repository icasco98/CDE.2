import type { Point } from '../geometry'

/** 1 pt = 1/72 inch = 0.3528 mm. Points are the unit of everything in a PDF. */
const POINTS_PER_MM = 72 / 25.4

export function mm(millimetres: number): number {
  return millimetres * POINTS_PER_MM
}

/** How a line is drawn: its width in points, an optional dash in points, and its grey (0 black, 1 white). */
type Stroke = {
  readonly width: number
  readonly dash?: readonly number[]
  readonly grey?: number
}

/** Where a string sits against its point: by its start, its middle, or its end. */
type Align = 'left' | 'centre' | 'right'

/** One mark on a page. Coordinates are points, y up from the bottom-left corner of the sheet. */
export type Draw =
  | {
      readonly kind: 'path'
      readonly points: readonly Point[]
      readonly closed: boolean
      readonly stroke?: Stroke
      /** Filled with this grey before it is stroked; a white fill is how a gap is cut in a wall. */
      readonly fillGrey?: number
    }
  | {
      readonly kind: 'text'
      readonly at: Point
      readonly text: string
      readonly size: number
      readonly align: Align
      readonly grey?: number
    }

export type Page = {
  readonly width: number
  readonly height: number
  readonly draws: readonly Draw[]
}

/**
 * Helvetica's own widths, in thousandths of the point size, for the characters this tool prints.
 * A name is centred here rather than by the reader, which never tells us what it measured.
 */
const asciiWidths = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

/** The few marks outside ASCII the sheet prints, as WinAnsi codes with Helvetica's width. */
const beyondAscii: ReadonlyArray<readonly [string, number, number]> = [
  ['’', 0x92, 191],
  ['–', 0x96, 556],
  ['°', 0xb0, 400],
  ['²', 0xb2, 365],
  ['³', 0xb3, 365],
  ['·', 0xb7, 278],
  ['×', 0xd7, 584],
]

const winAnsiOf = new Map(beyondAscii.map(([mark, code]) => [mark, code]))
const widthOfCode = new Map<number, number>([
  ...asciiWidths.map((width, index): [number, number] => [index + 32, width]),
  ...beyondAscii.map(([, code, width]): [number, number] => [code, width]),
])

/** WinAnsi is a byte encoding, so a mark it has no room for is printed as a question mark. */
function codesOf(text: string): readonly number[] {
  return [...text].map((mark) => {
    const code = mark.codePointAt(0) ?? 63
    if (winAnsiOf.has(mark)) return winAnsiOf.get(mark) as number
    return code >= 32 && code <= 126 ? code : 63
  })
}

export function textWidth(text: string, size: number): number {
  let thousandths = 0
  for (const code of codesOf(text)) thousandths += widthOfCode.get(code) ?? 556
  return (thousandths * size) / 1000
}

function pdfString(text: string): string {
  let out = '('
  for (const code of codesOf(text)) {
    const mark = String.fromCharCode(code)
    if (mark === '(' || mark === ')' || mark === '\\') out += `\\${mark}`
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`
    else out += mark
  }
  return `${out})`
}

/** Three decimals everywhere: a thousandth of a point is under half a micron, and rounding a
 * coordinate no further keeps the difference between two of them true to the hundredth. */
function num(value: number): string {
  const fixed = value.toFixed(3)
  return fixed === '-0.000' ? '0.000' : fixed
}

function pathOps(draw: Extract<Draw, { kind: 'path' }>): string {
  const [first, ...rest] = draw.points
  if (!first) return ''
  const stroke = draw.stroke
  const lines: string[] = []
  if (draw.fillGrey !== undefined) lines.push(`${num(draw.fillGrey)} g`)
  if (stroke) {
    lines.push(`${num(stroke.width)} w`)
    lines.push(stroke.dash ? `[${stroke.dash.map(num).join(' ')}] 0 d` : '[] 0 d')
    lines.push(`${num(stroke.grey ?? 0)} G`)
  }
  lines.push(`${num(first[0])} ${num(first[1])} m`)
  for (const point of rest) lines.push(`${num(point[0])} ${num(point[1])} l`)
  if (draw.closed) lines.push('h')
  const fill = draw.fillGrey !== undefined
  lines.push(fill && stroke ? 'B' : fill ? 'f' : 'S')
  return lines.join('\n')
}

function textOps(draw: Extract<Draw, { kind: 'text' }>): string {
  const width = textWidth(draw.text, draw.size)
  const shift = draw.align === 'centre' ? width / 2 : draw.align === 'right' ? width : 0
  return [
    'BT',
    `${num(draw.grey ?? 0)} g`,
    `/F1 ${num(draw.size)} Tf`,
    `${num(draw.at[0] - shift)} ${num(draw.at[1])} Td`,
    `${pdfString(draw.text)} Tj`,
    'ET',
  ].join('\n')
}

export function contentStreamOf(page: Page): string {
  const ops = page.draws.map((draw) => (draw.kind === 'path' ? pathOps(draw) : textOps(draw)))
  return `${ops.filter((op) => op !== '').join('\n')}\n`
}

/** Every byte of the file is Latin-1, so a character's index in the text is its offset in the file. */
function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length)
  for (let at = 0; at < text.length; at += 1) bytes[at] = text.charCodeAt(at) & 0xff
  return bytes
}

/**
 * One document: a catalog, a page tree, the Helvetica the sheet is lettered in, and a page and a
 * content stream for each sheet, closed by a cross-reference table of the offset of every object.
 */
export function writePdf(pages: readonly Page[]): Uint8Array<ArrayBuffer> {
  const objects: string[] = []
  const add = (body: string): number => objects.push(body)

  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')

  const kids: string[] = []
  pages.forEach((page) => {
    const content = contentStreamOf(page)
    const contentNumber = objects.length + 2
    const pageNumber = add(
      [
        '<< /Type /Page /Parent 2 0 R',
        `/MediaBox [0 0 ${num(page.width)} ${num(page.height)}]`,
        '/Resources << /Font << /F1 3 0 R >> >>',
        `/Contents ${contentNumber} 0 R >>`,
      ].join('\n'),
    )
    add(`<< /Length ${content.length} >>\nstream\n${content}endstream`)
    kids.push(`${pageNumber} 0 R`)
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`

  let file = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(file.length)
    file += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const startxref = file.length
  const size = objects.length + 1
  file += `xref\n0 ${size}\n0000000000 65535 f \n`
  for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`
  file += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`
  return bytesOf(file)
}
