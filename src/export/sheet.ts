import { storeyLabel } from '../bubbles'
import { area, boundingBox, exactArea, type Point, type Rect } from '../geometry'
import { envelopeOf, type Envelope } from '../massing/numbers'
import type { Project } from '../model'
import { streetSides, type DoorMark } from '../views/zoning/doors'
import { mm, writePdf, type Draw, type Page } from './pdf'
import { contentBounds, doorsOn, openingMetres, round1, standingOn, type Placed } from './plan'

/** A3 landscape, the sheet a house at 1:100 is printed on. */
const PAGE_W_MM = 420
const PAGE_H_MM = 297

/** The frame the drawing sits in, and the band of the title block along the bottom of it. */
const MARGIN_MM = 15
const TITLE_BLOCK_MM = 15

/**
 * The scales offered, largest first. A3 with a 15 mm margin and a 15 mm title block leaves
 * 390 × 252 mm of drawing, which holds the starting 20 × 25 m plot at 1:100 with 2 mm to spare;
 * anything that does not fit that rectangle is drawn at 1:200.
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

function placementFor(bounds: Rect) {
  const denominator =
    SCALES.find((scale) => {
      const perMetre = mm(1000 / scale)
      return bounds.width * perMetre <= drawingWidth && bounds.depth * perMetre <= drawingHeight
    }) ?? SMALLEST_SCALE
  const pointsPerMetre = mm(1000 / denominator)
  const originX = drawingArea.left + (drawingWidth - bounds.width * pointsPerMetre) / 2
  const originY = drawingArea.bottom + (drawingHeight - bounds.depth * pointsPerMetre) / 2
  const foot = bounds.top + bounds.depth
  const placement: Placement = {
    denominator,
    pointsPerMetre,
    at: (point) => [
      originX + (point[0] - bounds.left) * pointsPerMetre,
      originY + (foot - point[1]) * pointsPerMetre,
    ],
  }
  return placement
}

function path(points: readonly Point[], closed: boolean, stroke: { width: number }): Draw {
  return { kind: 'path', points, closed, stroke }
}

function line(from: Point, to: Point, stroke: { width: number }): Draw {
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
 * starting plot fills the drawing area to within a millimetre, so a mark on the plan would land on
 * a room.
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

/** One line each: what the whole house comes to, for the reader who has only this sheet in hand. */
function envelopeLines(envelope: Envelope, plotArea: number): readonly string[] {
  return [
    `Gross floor ${round1(envelope.grossFloorArea)} m² · plot ${round1(plotArea)} m² · ratio ${Math.round(envelope.plotRatioPercent)}%`,
    `Walls ${round1(envelope.wallArea)} m² · roof ${round1(envelope.roofArea)} m² · volume ${round1(envelope.volume)} m³ · height ${round1(envelope.buildingHeight)} m`,
  ]
}

function titleBlock(input: {
  readonly name: string
  readonly subtitle: string
  readonly placement: Placement
  readonly date: string
  readonly envelope: Envelope
  readonly plotArea: number
  readonly north: number
}): readonly Draw[] {
  const left = mm(MARGIN_MM) + mm(4)
  const upper = mm(MARGIN_MM) + mm(9.5)
  const lower = mm(MARGIN_MM) + mm(3.5)
  const numbersRight = mm(PAGE_W_MM - MARGIN_MM) - mm(88)
  const [first, second] = envelopeLines(input.envelope, input.plotArea)
  return [
    label([left, upper], input.name, TITLE_PT, 'left'),
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
    ...northArrow(
      [mm(PAGE_W_MM - MARGIN_MM) - mm(7), mm(MARGIN_MM + TITLE_BLOCK_MM / 2)],
      input.north,
    ),
  ]
}

/** A door is a gap: the wall is drawn whole and then the opening is masked out in white. */
function doorGap(mark: DoorMark, placement: Placement): Draw {
  const run = (openingMetres(mark.kind) / 2) * placement.pointsPerMetre
  const centre = placement.at(mark.at)
  const along: Point = [mark.along[0], -mark.along[1]]
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

function plotDraws(project: Project, placement: Placement): readonly Draw[] {
  const polygon = project.plot.polygon
  if (polygon.length < 3) return []
  const draws: Draw[] = [path(polygon.map(placement.at), true, PLOT_STROKE)]
  for (const [from, to] of streetSides(project.plot)) {
    draws.push(line(placement.at(from), placement.at(to), STREET_STROKE))
  }
  return draws
}

function roomDraws(standing: readonly Placed[], placement: Placement): readonly Draw[] {
  const draws: Draw[] = []
  for (const { outline } of standing) draws.push(path(outline.map(placement.at), true, ROOM_STROKE))
  for (const { outline, room, footprint } of standing) {
    const bounds = boundingBox(outline)
    const centre = placement.at([bounds.left + bounds.width / 2, bounds.top + bounds.depth / 2])
    draws.push(label([centre[0], centre[1] + mm(0.6)], room.name, LABEL_PT, 'centre'))
    draws.push(
      label(
        [centre[0], centre[1] - mm(2.8)],
        `${round1(exactArea(footprint))} m²`,
        NUMBER_PT,
        'centre',
      ),
    )
  }
  return draws
}

function storeyPage(input: {
  readonly project: Project
  readonly storey: number
  readonly placement: Placement
  readonly date: string
  readonly envelope: Envelope
  readonly plotArea: number
}): Page {
  const { project, storey, placement } = input
  const standing = standingOn(project.rooms, storey)
  const doors = doorsOn(project, storey, standing)
  const drawing: Draw[] = [
    ...plotDraws(project, placement),
    ...roomDraws(standing, placement),
    ...doors.map((mark) => doorGap(mark, placement)),
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
        name: project.name,
        subtitle: `${storeyLabel(storey)} floor plan`,
        placement,
        date: input.date,
        envelope: input.envelope,
        plotArea: input.plotArea,
        north: project.plot.north,
      }),
    ],
  }
}

/** The envelope numbers on their own sheet, so the plans are read against one table of figures. */
function numbersPage(input: {
  readonly project: Project
  readonly placement: Placement
  readonly date: string
  readonly envelope: Envelope
  readonly plotArea: number
}): Page {
  const { envelope } = input
  const left = drawingArea.left + mm(10)
  const columns = [0, 60, 110, 165, 225].map((offset) => left + mm(offset))
  let y = drawingArea.top - mm(14)
  const draws: Draw[] = [label([left, y], 'Envelope', TITLE_PT, 'left')]
  y -= mm(12)
  const row = (cells: readonly string[], size: number): void => {
    cells.forEach((text, index) => {
      const x = columns[index] ?? left
      draws.push(label([x, y], text, size, index === 0 ? 'left' : 'right'))
    })
    y -= mm(7)
  }
  row(['Storey', 'Height m', 'Floor area m²', 'Outline area m²', 'Perimeter m'], LABEL_PT)
  draws.push(line([left, y + mm(4)], [columns[4] ?? left, y + mm(4)], RULE_STROKE))
  for (const numbers of envelope.perStorey) {
    row(
      [
        storeyLabel(numbers.storey),
        round1(numbers.height),
        round1(numbers.floorArea),
        round1(numbers.outlineArea),
        round1(numbers.outlinePerimeter),
      ],
      NUMBER_PT,
    )
  }
  y -= mm(6)
  const whole: readonly (readonly [string, string])[] = [
    ['Gross floor area', `${round1(envelope.grossFloorArea)} m²`],
    ['Plot area', `${round1(input.plotArea)} m²`],
    ['Plot ratio', `${Math.round(envelope.plotRatioPercent)}%`],
    ['Wall area', `${round1(envelope.wallArea)} m²`],
    ['Roof area', `${round1(envelope.roofArea)} m²`],
    ['Volume', `${round1(envelope.volume)} m³`],
    ['Surface to volume', envelope.surfaceToVolume.toFixed(4)],
    ['Building height', `${round1(envelope.buildingHeight)} m`],
  ]
  for (const [name, value] of whole) row([name, value], NUMBER_PT)
  return {
    width: mm(PAGE_W_MM),
    height: mm(PAGE_H_MM),
    draws: [
      ...frameDraws(),
      ...draws,
      ...titleBlock({
        name: input.project.name,
        subtitle: 'Envelope numbers',
        placement: input.placement,
        date: input.date,
        envelope,
        plotArea: input.plotArea,
        north: input.project.plot.north,
      }),
    ],
  }
}

/** The date on the sheet, as the year, month and day, which reads the same in every country. */
function sheetDate(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/** One page per storey, then the envelope numbers; every page at the one scale the plans share. */
export function sheetPages(project: Project, at: Date): readonly Page[] {
  const placement = placementFor(contentBounds(project))
  const plotArea = area(project.plot.polygon)
  const envelope = envelopeOf({
    rooms: project.rooms,
    storeys: project.storeys,
    heights: project.heights,
    plotArea,
  })
  const date = sheetDate(at)
  const shared = { project, placement, date, envelope, plotArea }
  const storeys = Array.from({ length: Math.max(1, project.storeys) }, (_unused, storey) =>
    storeyPage({ ...shared, storey }),
  )
  return [...storeys, numbersPage(shared)]
}

export function pdfOf(project: Project, at: Date): Uint8Array<ArrayBuffer> {
  return writePdf(sheetPages(project, at))
}
