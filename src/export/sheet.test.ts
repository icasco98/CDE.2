import { describe, expect, it } from 'vitest'
import { rectangleToPolygon, type Polygon } from '../geometry'
import { PROJECT_VERSION, type Project, type Room } from '../model'
import { startingHousehold, startingPlot, startingSite } from '../model/project'
import { contentStreamOf, type Page } from './pdf'
import { sheetPages } from './sheet'

const on = new Date('2026-09-11T09:00:00Z')

function project(extra: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Al Rai villa',
    storeys: 1,
    heights: [3.5],
    plot: startingPlot,
    site: startingSite,
    household: startingHousehold,
    rooms: [],
    edges: [],
    weights: {},
    actors: [],
    version: PROJECT_VERSION,
    ...extra,
  }
}

function room(id: string, polygon: Polygon, storey = 0): Room {
  return {
    id,
    name: id,
    type: 'bedroom',
    storey,
    storeysSpanned: 1,
    targetArea: 20,
    pinned: false,
    footprint: { polygon, rotation: 0 },
  }
}

function streamOf(pages: readonly Page[], index: number): string {
  const page = pages[index]
  if (!page) throw new Error(`there is no page ${index}`)
  return contentStreamOf(page)
}

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

/** The plot on a sheet: the one long path 20 wide for every 25 deep, as the starting plot is. */
function plotRun(stream: string): Run {
  const run = pathRuns(stream).find(
    (each) =>
      each.width > 100 && each.height > 0 && Math.abs(each.width / each.height - 0.8) < 1e-3,
  )
  if (!run) throw new Error('the plot is not on the sheet')
  return run
}

describe('the plan measures true at the scale it states', () => {
  it('draws the starting 20 × 25 m plot 566.93 by 708.66 pt at 1:100', () => {
    const stream = streamOf(sheetPages(project(), on), 0)
    const plot = plotRun(stream)
    expect(twoDecimals(plot.width)).toBe(566.93)
    expect(twoDecimals(plot.height)).toBe(708.66)
    expect(stream).toContain('(Ground floor plan \\267 1:100 \\267 2026-09-11) Tj')
  })

  it('halves both to 283.46 by 354.33 pt when the drawing falls to 1:200', () => {
    // A room 5 m south of the plot makes the drawing 30 m deep, which 1:100 has no paper for.
    const outside = room('South wing', rectangleToPolygon({ left: 0, top: 26, width: 6, depth: 4 }))
    const stream = streamOf(sheetPages(project({ rooms: [outside] }), on), 0)
    const plot = plotRun(stream)
    expect(twoDecimals(plot.width * 2)).toBe(566.93)
    expect(twoDecimals(plot.height * 2)).toBe(708.66)
    expect(plot.width).toBeCloseTo(283.465, 3)
    expect(plot.height).toBeCloseTo(354.33, 2)
    expect(stream).toContain('1:200')
  })
})

describe('the set of sheets', () => {
  it('gives every storey a page and adds one for the envelope numbers', () => {
    const pages = sheetPages(project({ storeys: 3, heights: [3.5, 3.5, 3] }), on)
    expect(pages).toHaveLength(4)
    expect(streamOf(pages, 3)).toContain('(Envelope numbers')
    expect(pages.every((page) => twoDecimals(page.width) === 1190.55)).toBe(true)
    expect(pages.every((page) => twoDecimals(page.height) === 841.89)).toBe(true)
  })

  it('says so in the drawing area when no room is placed', () => {
    expect(streamOf(sheetPages(project(), on), 0)).toContain('(No rooms placed) Tj')
  })

  it('letters a placed room with its name and its area, and stops saying there are none', () => {
    const kitchen = room('Kitchen', rectangleToPolygon({ left: 2, top: 3, width: 5, depth: 4 }))
    const stream = streamOf(sheetPages(project({ rooms: [kitchen] }), on), 0)
    expect(stream).toContain('(Kitchen) Tj')
    expect(stream).toContain('(20 m\\262) Tj')
    expect(stream).not.toContain('(No rooms placed) Tj')
  })

  it('carries the envelope numbers for the whole house in the title block', () => {
    const kitchen = room('Kitchen', rectangleToPolygon({ left: 2, top: 3, width: 5, depth: 4 }))
    const stream = streamOf(sheetPages(project({ rooms: [kitchen] }), on), 0)
    expect(stream).toContain('Gross floor 20 m\\262')
    expect(stream).toContain('ratio 4%')
    expect(stream).toContain('(Al Rai villa) Tj')
  })
})
