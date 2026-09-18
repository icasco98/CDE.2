/**
 * The printed sheet: one A3 page per storey, drawn to scale from the zoning sheet, with the plot,
 * the setback line, the rooms and their areas, the doors as gaps, north, a scale bar and a title.
 */

import {
  NORTH,
  RATIO,
  fmt,
  report,
  storeyCountOf,
  storeyNameOf,
  type Point,
  type Sheet,
} from '../sheet'
import { mm, writePdf, type Draw, type Page } from './pdf'
import {
  contentBounds,
  openingsOn,
  plotCorners,
  setbackCorners,
  standingOn,
  streetSides,
  type Opening,
  type Placed,
} from './plan'

/** A3 landscape, the sheet a house at 1:100 is printed on. */
const PAGE_W_MM = 420
const PAGE_H_MM = 297

/** The frame the drawing sits in, and the band of the title block along the bottom of it. */
const MARGIN_MM = 15
const TITLE_BLOCK_MM = 15

/**
 * The scales offered, largest first. A3 with a 15 mm margin and a 15 mm title block leaves
 * 390 × 252 mm of drawing, which holds the 20 × 25 m plot at 1:100 with 2 mm to spare; anything
 * that does not fit that rectangle is drawn at 1:200.
 */
const SMALLEST_SCALE = 200
const SCALES: readonly number[] = [100, SMALLEST_SCALE]

const TITLE_PT = 14
const LABEL_PT = 8
const NUMBER_PT = 9

/** How thick the white mask over a wall is, in points: enough to cut both lines of a shared wall. */
const GAP_PT = 2.4

const PLOT_STROKE = { width: 1 }
const STREET_STROKE = { width: 2.4 }
const SETBACK_STROKE = { width: 0.6, dash: [5, 3], grey: 0.45 }
const ROOM_STROKE = { width: 0.8 }
const FRAME_STROKE = { width: 1 }
const RULE_STROKE = { width: 0.5 }
const MARK_STROKE = { width: 0.7 }

/** What is left of the sheet for the plan: inside the frame, above the title block. */
const drawingArea = {
  left: mm(MARGIN_MM),
  right: mm(PAGE_W_MM - MARGIN_MM),
  bottom: mm(MARGIN_MM + TITLE_BLOCK_MM),
  top: mm(PAGE_H_MM - MARGIN_MM),
}

const drawingWidth = drawingArea.right - drawingArea.left
const drawingHeight = drawingArea.top - drawingArea.bottom

/** Sheet metres to points on the paper: the plan, centred in the drawing area and turned y up. */
type Placement = {
  readonly denominator: number
  readonly pointsPerMetre: number
  readonly at: (point: Point) => Point
}

function placementFor(bounds: { x: number; y: number; w: number; h: number }): Placement {
  const denominator =
    SCALES.find((scale) => {
      const perMetre = mm(1000 / scale)
      return bounds.w * perMetre <= drawingWidth && bounds.h * perMetre <= drawingHeight
    }) ?? SMALLEST_SCALE
  const pointsPerMetre = mm(1000 / denominator)
  const originX = drawingArea.left + (drawingWidth - bounds.w * pointsPerMetre) / 2
  const originY = drawingArea.bottom + (drawingHeight - bounds.h * pointsPerMetre) / 2
  const foot = bounds.y + bounds.h
  return {
    denominator,
    pointsPerMetre,
    at: (point) => [
      originX + (point[0] - bounds.x) * pointsPerMetre,
      originY + (foot - point[1]) * pointsPerMetre,
    ],
  }
}

type Stroke = { readonly width: number; readonly dash?: readonly number[]; readonly grey?: number }

function path(points: readonly Point[], closed: boolean, stroke: Stroke): Draw {
  return { kind: 'path', points, closed, stroke }
}

function line(from: Point, to: Point, stroke: Stroke): Draw {
  return path([from, to], false, stroke)
}

function label(at: Point, text: string, size: number, align: 'left' | 'centre' | 'right'): Draw {
  return { kind: 'text', at, text, size, align }
}

function frameDraws(): readonly Draw[] {
  const { left, right, top } = drawingArea
  const bottom = mm(MARGIN_MM)
  return [
    path(
      [
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
      ],
      true,
      FRAME_STROKE,
    ),
    line([left, drawingArea.bottom], [right, drawingArea.bottom], RULE_STROKE),
  ]
}

/**
 * The north arrow and the scale bar sit in the title block rather than on the plan: at 1:100 the
 * plot fills the drawing area to within a millimetre, so a mark on the plan would land on a room.
 */
function northArrow(at: Point, north: number): readonly Draw[] {
  const radians = (north * Math.PI) / 180
  const along = (forward: number, across: number): Point => [
    at[0] + Math.sin(radians) * forward + Math.cos(radians) * across,
    at[1] + Math.cos(radians) * forward - Math.sin(radians) * across,
  ]
  const reach = mm(5)
  const head = mm(1.6)
  return [
    line(along(-reach, 0), along(reach, 0), MARK_STROKE),
    path([along(reach, 0), along(reach - head * 2, head), along(reach - head * 2, -head)], true, {
      width: 0.5,
    }),
    label([at[0] - mm(7), at[1] - mm(1.5)], 'N', LABEL_PT, 'centre'),
  ]
}

function scaleBar(at: Point, placement: Placement): readonly Draw[] {
  const run = 5
  const across = run * placement.pointsPerMetre
  const tick = mm(1.2)
  const draws: Draw[] = [line(at, [at[0] + across, at[1]], MARK_STROKE)]
  for (let step = 0; step <= run; step += 1) {
    const x = at[0] + (step * across) / run
    draws.push(line([x, at[1] - tick], [x, at[1] + tick], MARK_STROKE))
  }
  draws.push(label([at[0], at[1] - mm(4)], '0', LABEL_PT, 'centre'))
  draws.push(label([at[0] + across, at[1] - mm(4)], `${run} m`, LABEL_PT, 'centre'))
  return draws
}

/** Two lines of figures: what stands on this storey, and what the whole house comes to. */
function figureLines(sheet: Sheet, storey: number): readonly string[] {
  const read = report(sheet, storey)
  return [
    `Placed ${fmt(read.placedArea)} m² of ${fmt(read.askedArea)} m² asked · buildable ${fmt(read.buildableArea)} m²`,
    `All storeys ${fmt(read.total)} m² of ${fmt(read.allowed)} m² allowed at ${Math.round(RATIO * 100)}%`,
  ]
}

function titleBlock(input: {
  readonly title: string
  readonly subtitle: string
  readonly placement: Placement
  readonly date: string
  readonly figures: readonly string[]
}): readonly Draw[] {
  const left = mm(MARGIN_MM) + mm(4)
  const upper = mm(MARGIN_MM) + mm(9.5)
  const lower = mm(MARGIN_MM) + mm(3.5)
  const numbersRight = mm(PAGE_W_MM - MARGIN_MM) - mm(88)
  const [first, second] = input.figures
  return [
    label([left, upper], input.title, TITLE_PT, 'left'),
    label(
      [left, lower],
      `${input.subtitle} · 1:${input.placement.denominator} · ${input.date}`,
      NUMBER_PT,
      'left',
    ),
    label([numbersRight, upper], first ?? '', NUMBER_PT, 'right'),
    label([numbersRight, lower], second ?? '', NUMBER_PT, 'right'),
    line(
      [numbersRight + mm(4), mm(MARGIN_MM)],
      [numbersRight + mm(4), drawingArea.bottom],
      RULE_STROKE,
    ),
    ...scaleBar([numbersRight + mm(8), mm(MARGIN_MM) + mm(9)], input.placement),
    line(
      [mm(PAGE_W_MM - MARGIN_MM) - mm(20), mm(MARGIN_MM)],
      [mm(PAGE_W_MM - MARGIN_MM) - mm(20), drawingArea.bottom],
      RULE_STROKE,
    ),
    ...northArrow([mm(PAGE_W_MM - MARGIN_MM) - mm(7), mm(MARGIN_MM + TITLE_BLOCK_MM / 2)], NORTH),
  ]
}

/** A door is a gap: the wall is drawn whole and then the opening is masked out in white. */
function doorGap(opening: Opening, placement: Placement): Draw {
  const run = (opening.width / 2) * placement.pointsPerMetre
  const centre = placement.at(opening.at)
  const along: Point = [opening.along[0], -opening.along[1]]
  const across: Point = [-along[1], along[0]]
  const corner = (forward: number, sideways: number): Point => [
    centre[0] + along[0] * forward + across[0] * sideways,
    centre[1] + along[1] * forward + across[1] * sideways,
  ]
  return {
    kind: 'path',
    points: [
      corner(-run, -GAP_PT),
      corner(run, -GAP_PT),
      corner(run, GAP_PT),
      corner(-run, GAP_PT),
    ],
    closed: true,
    fillGrey: 1,
  }
}

function plotDraws(placement: Placement): readonly Draw[] {
  return [
    path(plotCorners.map(placement.at), true, PLOT_STROKE),
    path(setbackCorners.map(placement.at), true, SETBACK_STROKE),
    ...streetSides.map(([from, to]) => line(placement.at(from), placement.at(to), STREET_STROKE)),
  ]
}

function roomDraws(standing: readonly Placed[], placement: Placement): readonly Draw[] {
  const draws: Draw[] = []
  for (const { loops } of standing)
    for (const loop of loops) draws.push(path(loop.map(placement.at), true, ROOM_STROKE))
  for (const { room, labelAt, area } of standing) {
    const centre = placement.at(labelAt)
    draws.push(label([centre[0], centre[1] + mm(0.6)], room.name, LABEL_PT, 'centre'))
    draws.push(label([centre[0], centre[1] - mm(2.8)], `${fmt(area)} m²`, NUMBER_PT, 'centre'))
  }
  return draws
}

function storeyPage(input: {
  readonly sheet: Sheet
  readonly storey: number
  readonly title: string
  readonly placement: Placement
  readonly date: string
}): Page {
  const { sheet, storey, placement } = input
  const standing = standingOn(sheet, storey)
  const drawing: Draw[] = [
    ...plotDraws(placement),
    ...roomDraws(standing, placement),
    ...openingsOn(sheet, storey).map((opening) => doorGap(opening, placement)),
  ]
  if (standing.length === 0) {
    drawing.push(
      label(
        [(drawingArea.left + drawingArea.right) / 2, (drawingArea.bottom + drawingArea.top) / 2],
        'No rooms placed',
        TITLE_PT,
        'centre',
      ),
    )
  }
  return {
    width: mm(PAGE_W_MM),
    height: mm(PAGE_H_MM),
    draws: [
      ...frameDraws(),
      ...drawing,
      ...titleBlock({
        title: input.title,
        subtitle: `${storeyNameOf(storey)} floor plan`,
        placement,
        date: input.date,
        figures: figureLines(sheet, storey),
      }),
    ],
  }
}

/** The date on the sheet, as the year, month and day, which reads the same in every country. */
function sheetDate(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/** One page per storey, every page at the one scale the plans share. */
export function sheetPages(sheet: Sheet, title: string, at: Date): readonly Page[] {
  const placement = placementFor(contentBounds(sheet))
  const date = sheetDate(at)
  return Array.from({ length: storeyCountOf(sheet) }, (_unused, storey) =>
    storeyPage({ sheet, storey, title, placement, date }),
  )
}

export function pdfOf(sheet: Sheet, title: string, at: Date): Uint8Array<ArrayBuffer> {
  return writePdf(sheetPages(sheet, title, at))
}
