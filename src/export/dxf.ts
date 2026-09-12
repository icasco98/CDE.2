import {
  arcRun,
  boundingBox,
  centroid,
  exactArea,
  sheetArcs,
  type Arc,
  type Footprint,
  type Point,
  type Polygon,
} from '../geometry'
import type { Project } from '../model'
import { contentBounds, doorsOn, openingMetres, round1, standingOn } from './plan'

/** AutoCAD R12, the last release with a plain, wholly documented ASCII form. */
const ACAD_VERSION = 'AC1009'

/** `$INSUNITS` 6: the drawing is in metres, so a room measures true when it is opened. */
const INSUNITS_METRES = 6

/** Room names and areas are lettered at 0.3 m, which reads at 1:100 and does not fill a small room. */
const TEXT_HEIGHT_M = 0.3

/** Where the north arrow stands: this far clear of the drawing's east side, and this long. */
const NORTH_CLEAR_M = 2
const NORTH_REACH_M = 3

type Layer = { readonly name: string; readonly colour: number }

export type Entity =
  | {
      readonly kind: 'polyline'
      readonly layer: string
      readonly points: readonly Point[]
      readonly closed: boolean
    }
  | { readonly kind: 'line'; readonly layer: string; readonly from: Point; readonly to: Point }
  | {
      readonly kind: 'text'
      readonly layer: string
      readonly at: Point
      readonly text: string
      readonly height: number
    }
  | {
      readonly kind: 'arc'
      readonly layer: string
      readonly centre: Point
      readonly radius: number
      readonly fromDegrees: number
      readonly toDegrees: number
    }

/** A group code and its value on their own lines, which is the whole of the ASCII DXF form. */
function group(code: number, value: string | number): string {
  return `${code}\n${typeof value === 'number' ? value.toFixed(6) : value}\n`
}

function tag(code: number, value: string): string {
  return `${code}\n${value}\n`
}

function point(codes: readonly [number, number, number], at: Point): string {
  return group(codes[0], at[0]) + group(codes[1], at[1]) + group(codes[2], 0)
}

function entityText(entity: Entity): string {
  switch (entity.kind) {
    case 'polyline': {
      // R12 has no LWPOLYLINE: a polyline is an opening entity, a VERTEX each, and a SEQEND.
      const head =
        tag(0, 'POLYLINE') +
        tag(8, entity.layer) +
        tag(66, '1') +
        tag(70, entity.closed ? '1' : '0') +
        point([10, 20, 30], [0, 0])
      const vertices = entity.points
        .map((at) => tag(0, 'VERTEX') + tag(8, entity.layer) + point([10, 20, 30], at))
        .join('')
      return head + vertices + tag(0, 'SEQEND') + tag(8, entity.layer)
    }
    case 'line':
      return (
        tag(0, 'LINE') +
        tag(8, entity.layer) +
        point([10, 20, 30], entity.from) +
        point([11, 21, 31], entity.to)
      )
    case 'text':
      return (
        tag(0, 'TEXT') +
        tag(8, entity.layer) +
        point([10, 20, 30], entity.at) +
        group(40, entity.height) +
        tag(1, entity.text)
      )
    case 'arc':
      return (
        tag(0, 'ARC') +
        tag(8, entity.layer) +
        point([10, 20, 30], entity.centre) +
        group(40, entity.radius) +
        group(50, entity.fromDegrees) +
        group(51, entity.toDegrees)
      )
  }
}

function pointsOf(entity: Entity): readonly Point[] {
  switch (entity.kind) {
    case 'polyline':
      return entity.points
    case 'line':
      return [entity.from, entity.to]
    case 'text':
      return [entity.at]
    case 'arc':
      return [
        [entity.centre[0] - entity.radius, entity.centre[1] - entity.radius],
        [entity.centre[0] + entity.radius, entity.centre[1] + entity.radius],
      ]
  }
}

function extentsOf(entities: readonly Entity[]): { readonly min: Point; readonly max: Point } {
  const all = entities.flatMap(pointsOf)
  if (all.length === 0) return { min: [0, 0], max: [0, 0] }
  const bounds = boundingBox(all)
  return {
    min: [bounds.left, bounds.top],
    max: [bounds.left + bounds.width, bounds.top + bounds.depth],
  }
}

function layerTable(layers: readonly Layer[]): string {
  const rows = layers
    .map(
      (layer) =>
        tag(0, 'LAYER') +
        tag(2, layer.name) +
        tag(70, '0') +
        tag(62, String(layer.colour)) +
        tag(6, 'CONTINUOUS'),
    )
    .join('')
  return (
    tag(0, 'TABLE') + tag(2, 'LAYER') + tag(70, String(layers.length)) + rows + tag(0, 'ENDTAB')
  )
}

/** CONTINUOUS is named by every layer, so the file carries its definition rather than assume it. */
function lineTypeTable(): string {
  return (
    tag(0, 'TABLE') +
    tag(2, 'LTYPE') +
    tag(70, '1') +
    tag(0, 'LTYPE') +
    tag(2, 'CONTINUOUS') +
    tag(70, '0') +
    tag(3, 'Solid line') +
    tag(72, '65') +
    tag(73, '0') +
    group(40, 0) +
    tag(0, 'ENDTAB')
  )
}

export function writeDxf(input: {
  readonly layers: readonly Layer[]
  readonly entities: readonly Entity[]
}): string {
  const { min, max } = extentsOf(input.entities)
  const header =
    tag(0, 'SECTION') +
    tag(2, 'HEADER') +
    tag(9, '$ACADVER') +
    tag(1, ACAD_VERSION) +
    tag(9, '$INSUNITS') +
    tag(70, String(INSUNITS_METRES)) +
    tag(9, '$EXTMIN') +
    point([10, 20, 30], min) +
    tag(9, '$EXTMAX') +
    point([10, 20, 30], max) +
    tag(0, 'ENDSEC')
  const tables =
    tag(0, 'SECTION') +
    tag(2, 'TABLES') +
    lineTypeTable() +
    layerTable(input.layers) +
    tag(0, 'ENDSEC')
  const entities =
    tag(0, 'SECTION') +
    tag(2, 'ENTITIES') +
    input.entities.map(entityText).join('') +
    tag(0, 'ENDSEC')
  return header + tables + entities + tag(0, 'EOF')
}

const PLOT_LAYER = 'PLOT'
const NORTH_LAYER = 'NORTH'

function roomsLayer(storey: number): string {
  return `S${storey}-ROOMS`
}

function doorsLayer(storey: number): string {
  return `S${storey}-DOORS`
}

function textLayer(storey: number): string {
  return `S${storey}-TEXT`
}

function layersFor(storeys: number): readonly Layer[] {
  const perStorey = Array.from({ length: storeys }, (_unused, storey) => [
    { name: roomsLayer(storey), colour: 3 },
    { name: doorsLayer(storey), colour: 1 },
    { name: textLayer(storey), colour: 8 },
  ]).flat()
  return [{ name: PLOT_LAYER, colour: 7 }, ...perStorey, { name: NORTH_LAYER, colour: 7 }]
}

/**
 * The sheet runs y down in metres and DXF runs y up, so a sheet point `(x, y)` is written
 * `(x - left, foot - y)`: the plot's bounding box lands with its south-west corner on the origin
 * and the plan reads the way it does on screen, with north pointing as it is drawn.
 */
function transformFor(project: Project) {
  const bounds = contentBounds(project)
  const foot = bounds.top + bounds.depth
  return {
    bounds,
    at: (p: Point): Point => [p[0] - bounds.left, foot - p[1]],
  }
}

/** Two lines: the shaft from the tail to the point, and the barb across the head. */
function northEntities(at: Point, north: number): readonly Entity[] {
  const radians = (north * Math.PI) / 180
  const along = (forward: number, across: number): Point => [
    at[0] + Math.sin(radians) * forward + Math.cos(radians) * across,
    at[1] + Math.cos(radians) * forward - Math.sin(radians) * across,
  ]
  const barb = NORTH_REACH_M / 4
  return [
    { kind: 'line', layer: NORTH_LAYER, from: along(0, 0), to: along(NORTH_REACH_M, 0) },
    {
      kind: 'line',
      layer: NORTH_LAYER,
      from: along(NORTH_REACH_M - barb, barb / 2),
      to: along(NORTH_REACH_M - barb, -barb / 2),
    },
  ]
}

/** An angle in DXF's own space, in whole degrees of turn from east, never negative. */
function degreesAt(centre: Point, at: Point): number {
  const turn = (Math.atan2(at[1] - centre[1], at[0] - centre[0]) * 180) / Math.PI
  return turn < 0 ? turn + 360 : turn
}

/**
 * One remembered arc as an ARC entity. DXF sweeps an arc counterclockwise in its own y-up space,
 * and the sheet's y runs down, so a wall drawn clockwise on the plan arrives the other way round
 * and its two ends are written swapped. An arc that runs the whole way round is a closed circle.
 */
function arcEntity(arc: Arc, outline: Polygon, layer: string, at: (p: Point) => Point): Entity {
  const centre = at(arc.centre)
  const run = arcRun(arc, outline.length)
  const first = run[0] ?? 0
  const last = run[run.length - 1] ?? 0
  const start = at(outline[first] ?? arc.centre)
  const end = at(outline[last] ?? arc.centre)
  const whole = first === last
  return {
    kind: 'arc',
    layer,
    centre,
    radius: arc.radius,
    fromDegrees: whole ? 0 : degreesAt(centre, arc.clockwise ? end : start),
    toDegrees: whole ? 360 : degreesAt(centre, arc.clockwise ? start : end),
  }
}

/**
 * A room's outline split at the ends of its arcs: every remembered curve is written as one ARC
 * and what is left between them as open polylines, all on the room's own layer, so AutoCAD shows
 * a true curve rather than the fifty short chords the tool calculates with.
 */
function roomEntities(
  footprint: Footprint,
  outline: Polygon,
  layer: string,
  at: (p: Point) => Point,
): readonly Entity[] {
  const arcs = sheetArcs(footprint)
  const corners = outline.length
  if (arcs.length === 0 || corners < 3)
    return [{ kind: 'polyline', layer, points: outline.map(at), closed: true }]
  const curved = new Array<boolean>(corners).fill(false)
  for (const arc of arcs) {
    const run = arcRun(arc, corners)
    for (let step = 0; step + 1 < run.length; step += 1) curved[run[step] ?? 0] = true
  }
  const entities: Entity[] = arcs.map((arc) => arcEntity(arc, outline, layer, at))
  // The walk starts at the first straight wall whose neighbour behind it is curved, so a run that
  // would otherwise be split by the end of the list is written as the one polyline it is.
  const opens = curved.findIndex((wall, index) => !wall && curved[(index - 1 + corners) % corners])
  if (opens < 0) return entities
  const runs: number[][] = []
  let run: number[] | null = null
  for (let step = 0; step < corners; step += 1) {
    const wall = (opens + step) % corners
    if (curved[wall]) {
      run = null
      continue
    }
    if (!run) {
      run = [wall]
      runs.push(run)
    }
    run.push((wall + 1) % corners)
  }
  for (const straight of runs) {
    entities.push({
      kind: 'polyline',
      layer,
      points: straight.map((corner) => at(outline[corner] ?? [0, 0])),
      closed: false,
    })
  }
  return entities
}

function entitiesOf(project: Project): readonly Entity[] {
  const transform = transformFor(project)
  const entities: Entity[] = []
  if (project.plot.polygon.length >= 3) {
    entities.push({
      kind: 'polyline',
      layer: PLOT_LAYER,
      points: project.plot.polygon.map(transform.at),
      closed: true,
    })
  }
  for (let storey = 0; storey < Math.max(1, project.storeys); storey += 1) {
    const standing = standingOn(project.rooms, storey)
    for (const { outline, footprint } of standing) {
      entities.push(...roomEntities(footprint, outline, roomsLayer(storey), transform.at))
    }
    for (const { outline, room, footprint } of standing) {
      entities.push({
        kind: 'text',
        layer: textLayer(storey),
        at: transform.at(centroid(outline)),
        // ASCII only, so the file reads the same in every CAD program: "m2", not "m²".
        text: `${room.name} ${round1(exactArea(footprint))} m2`,
        height: TEXT_HEIGHT_M,
      })
    }
    for (const mark of doorsOn(project, storey, standing)) {
      const run = openingMetres(mark.kind) / 2
      entities.push({
        kind: 'line',
        layer: doorsLayer(storey),
        from: transform.at([mark.at[0] - mark.along[0] * run, mark.at[1] - mark.along[1] * run]),
        to: transform.at([mark.at[0] + mark.along[0] * run, mark.at[1] + mark.along[1] * run]),
      })
    }
  }
  const { bounds } = transform
  entities.push(
    ...northEntities(
      [bounds.width + NORTH_CLEAR_M, bounds.depth - NORTH_REACH_M],
      project.plot.north,
    ),
  )
  return entities
}

export function dxfOf(project: Project): string {
  return writeDxf({
    layers: layersFor(Math.max(1, project.storeys)),
    entities: entitiesOf(project),
  })
}
