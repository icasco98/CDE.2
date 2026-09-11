import { describe, expect, it } from 'vitest'
import { contentStreamOf, mm, textWidth, writePdf, type Page } from './pdf'

/** Every byte of a PDF this writer makes is Latin-1, so a byte is a character and an offset an index. */
function read(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
}

const twoLines: Page = {
  width: mm(210),
  height: mm(297),
  draws: [
    {
      kind: 'path',
      points: [
        [50, 700],
        [550, 700],
      ],
      closed: false,
      stroke: { width: 1 },
    },
    {
      kind: 'path',
      points: [
        [50, 660],
        [550, 660],
      ],
      closed: false,
      stroke: { width: 0.5, dash: [3, 2] },
    },
    { kind: 'text', at: [50, 620], text: 'Two lines (and a label)', size: 9, align: 'left' },
  ],
}

type Xref = {
  readonly size: number
  readonly offsets: readonly number[]
  readonly trailerSize: number
}

function crossReference(file: string): Xref {
  const startxref = /startxref\n(\d+)\n%%EOF/.exec(file)
  if (!startxref?.[1]) throw new Error('there is no startxref')
  const at = Number(startxref[1])
  expect(file.slice(at, at + 4)).toBe('xref')
  const lines = file.slice(at).split('\n')
  const size = Number((lines[1] ?? '').split(' ')[1])
  const offsets = lines.slice(3, 2 + size).map((entry) => Number(entry.slice(0, 10)))
  const trailer = /\/Size (\d+)/.exec(file.slice(at))
  return { size, offsets, trailerSize: Number(trailer?.[1]) }
}

describe('a two-line document read back out of its own bytes', () => {
  const file = read(writePdf([twoLines]))

  it('opens as a PDF and closes with the end-of-file marker', () => {
    expect(file.startsWith('%PDF-1.4\n')).toBe(true)
    expect(file.endsWith('%%EOF\n')).toBe(true)
  })

  it('has an xref offset for every object, each landing on that object', () => {
    const { size, offsets } = crossReference(file)
    const objects = file.match(/^\d+ 0 obj$/gm) ?? []
    expect(offsets).toHaveLength(objects.length)
    offsets.forEach((offset, index) => {
      expect(file.startsWith(`${index + 1} 0 obj`, offset)).toBe(true)
    })
    expect(size).toBe(objects.length + 1)
  })

  it('says in the trailer how many entries the table has, the free one counted', () => {
    const { size, trailerSize } = crossReference(file)
    expect(trailerSize).toBe(size)
    // A catalog, the page tree, Helvetica, one page and one content stream.
    expect(size).toBe(6)
  })

  it('states the length of the content stream it wrote', () => {
    const stream = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/.exec(file)
    expect(Number(stream?.[1])).toBe(stream?.[2]?.length)
    expect(stream?.[2]).toBe(contentStreamOf(twoLines))
  })

  it('draws both lines, the dash and the label in the content stream', () => {
    const stream = contentStreamOf(twoLines)
    expect(stream).toContain('50.000 700.000 m')
    expect(stream).toContain('550.000 700.000 l')
    expect(stream).toContain('[3.000 2.000] 0 d')
    expect(stream).toContain('(Two lines \\(and a label\\)) Tj')
  })
})

it('measures a string in Helvetica from the font’s own widths', () => {
  // H 722 + i 222 + space 278 = 1222 thousandths of the point size.
  expect(textWidth('Hi ', 10)).toBeCloseTo(12.22, 9)
  expect(textWidth('m²', 9)).toBeCloseTo((833 + 365) * 0.009, 9)
})

it('turns millimetres into points at 72 to the inch', () => {
  expect(mm(25.4)).toBeCloseTo(72, 9)
  expect(mm(10)).toBeCloseTo(28.3464567, 6)
})
