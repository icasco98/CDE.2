import { describe, expect, it } from 'vitest'
import { sheetOf, type Room, type Sheet } from '../sheet'
import { contentStreamOf, type Page } from './pdf'
import { sheetPages } from './sheet'

const on = new Date('2026-09-11T09:00:00Z')
const title = 'Al Rai villa'

function room(name: string, box: { x: number; y: number; w: number; h: number }): Room {
  return {
    id: name,
    name,
    kind: 'room',
    cat: 'private',
    target: 20,
    angle: 0,
    pieces: null,
    placed: true,
    ...box,
  }
}

function streamOf(pages: readonly Page[], index: number): string {
  const page = pages[index]
  if (!page) throw new Error(`there is no page ${index}`)
  return contentStreamOf(page)
}

const pagesOf = (sheet: Sheet): readonly Page[] => sheetPages(sheet, title, on)

type Run = { readonly width: number; readonly height: number }

/** Every path in a content stream, as the width and height of the box its coordinates span. */
function pathRuns(stream: string): readonly Run[] {
  const runs: Run[] = []
  let xs: number[] = []
  let ys: number[] = []
  const close = (): void => {
    if (xs.length > 1) {
      runs.push({
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      })
    }
    xs = []
    ys = []
  }
  for (const line of stream.split('\n')) {
    const move = /^(-?[\d.]+) (-?[\d.]+) (m|l)$/.exec(line)
    if (!move) continue
    if (move[3] === 'm') close()
    xs.push(Number(move[1]))
    ys.push(Number(move[2]))
  }
  close()
  return runs
}

function twoDecimals(value: number): number {
  return Number(value.toFixed(2))
}

/** The plot on a sheet: the one long path 20 wide for every 25 deep, as the plot is. */
function plotRun(stream: string): Run {
  const run = pathRuns(stream).find(
    (each) =>
      each.width > 100 && each.height > 0 && Math.abs(each.width / each.height - 0.8) < 1e-3,
  )
  if (!run) throw new Error('the plot is not on the sheet')
  return run
}

describe('the plan measures true at the scale it states', () => {
  it('draws the 20 × 25 m plot 566.93 by 708.66 pt at 1:100', () => {
    const stream = streamOf(pagesOf(sheetOf([], {}, 1)), 0)
    const plot = plotRun(stream)
    expect(twoDecimals(plot.width)).toBe(566.93)
    expect(twoDecimals(plot.height)).toBe(708.66)
    expect(stream).toContain('(Ground floor plan \\267 1:100 \\267 2026-09-11) Tj')
  })

  it('halves both to 283.46 by 354.33 pt when the drawing falls to 1:200', () => {
    // A room 1 m south of the plot makes the drawing 30 m deep, which 1:100 has no paper for.
    const outside = room('South wing', { x: 0, y: 26, w: 6, h: 4 })
    const stream = streamOf(pagesOf(sheetOf([outside], {}, 1)), 0)
    const plot = plotRun(stream)
    expect(twoDecimals(plot.width * 2)).toBe(566.93)
    expect(twoDecimals(plot.height * 2)).toBe(708.66)
    expect(plot.width).toBeCloseTo(283.465, 3)
    expect(plot.height).toBeCloseTo(354.33, 2)
    expect(stream).toContain('1:200')
  })
})

describe('the set of sheets', () => {
  it('gives every storey a page and no more', () => {
    const pages = pagesOf(sheetOf([], {}, 3))
    expect(pages).toHaveLength(3)
    expect(streamOf(pages, 2)).toContain('(Second floor plan')
    expect(pages.every((page) => twoDecimals(page.width) === 1190.55)).toBe(true)
    expect(pages.every((page) => twoDecimals(page.height) === 841.89)).toBe(true)
  })

  it('says so in the drawing area when no room is placed', () => {
    expect(streamOf(pagesOf(sheetOf([], {}, 1)), 0)).toContain('(No rooms placed) Tj')
  })

  it('letters a placed room with its name and its area, and stops saying there are none', () => {
    const stream = streamOf(
      pagesOf(sheetOf([room('Kitchen', { x: 2, y: 3, w: 5, h: 4 })], {}, 1)),
      0,
    )
    expect(stream).toContain('(Kitchen) Tj')
    expect(stream).toContain('(20 m\\262) Tj')
    expect(stream).not.toContain('(No rooms placed) Tj')
  })

  it('carries the storey’s figures and the whole house against the ratio in the title block', () => {
    const stream = streamOf(
      pagesOf(sheetOf([room('Kitchen', { x: 2, y: 3, w: 5, h: 4 })], {}, 1)),
      0,
    )
    expect(stream).toContain('(Al Rai villa) Tj')
    expect(stream).toContain(
      '(Placed 20 m\\262 of 20 m\\262 asked \\267 buildable 365.5 m\\262) Tj',
    )
    expect(stream).toContain('(All storeys 20 m\\262 of 1050 m\\262 allowed at 210%) Tj')
  })

  it('draws the setback line dashed, inside the plot and clear of it', () => {
    const stream = streamOf(pagesOf(sheetOf([], {}, 1)), 0)
    expect(stream).toContain('[5.000 3.000] 0 d')
    const setback = pathRuns(stream).find((run) => Math.abs(run.width - 17 * (566.929 / 20)) < 0.01)
    expect(setback?.height).toBeCloseTo(21.5 * (708.661 / 25), 1)
  })
})
