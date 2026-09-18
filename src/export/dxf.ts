/**
 * The DXF: the same plan as the printed sheet, in metres, with a layer per storey, written by hand
 * as ASCII R12 so AutoCAD opens it without a translator.
 */

import { NORTH, fmt, storeyCountOf, type Point, type Sheet } from '../sheet'
import { contentBounds, openingsOn, plotCorners, setbackCorners, standingOn } from './plan'

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
  }
}

function extentsOf(entities: readonly Entity[]): { readonly min: Point; readonly max: Point } {
  const all = entities.flatMap(pointsOf)
  if (all.length === 0) return { min: [0, 0], max: [0, 0] }
  const xs = all.map((at) => at[0])
  const ys = all.map((at) => at[1])
  return {
    min: [Math.min(...xs), Math.min(...ys)],
    max: [Math.max(...xs), Math.max(...ys)],
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
const SETBACK_LAYER = 'SETBACK'
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
  return [
    { name: PLOT_LAYER, colour: 7 },
    { name: SETBACK_LAYER, colour: 5 },
    ...perStorey,
    { name: NORTH_LAYER, colour: 7 },
  ]
}

/**
 * The sheet runs y down in metres and DXF runs y up, so a sheet point `(x, y)` is written
 * `(x - left, foot - y)`: the drawing's bounding box lands with its south-west corner on the origin
 * and the plan reads the way it does on screen, with north pointing as it is drawn.
 */
function transformFor(sheet: Sheet) {
  const bounds = contentBounds(sheet)
  const foot = bounds.y + bounds.h
  return {
    bounds,
    at: (p: Point): Point => [p[0] - bounds.x, foot - p[1]],
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

function entitiesOf(sheet: Sheet): readonly Entity[] {
  const transform = transformFor(sheet)
  const entities: Entity[] = [
    { kind: 'polyline', layer: PLOT_LAYER, points: plotCorners.map(transform.at), closed: true },
    {
      kind: 'polyline',
      layer: SETBACK_LAYER,
      points: setbackCorners.map(transform.at),
      closed: true,
    },
  ]
  for (let storey = 0; storey < storeyCountOf(sheet); storey += 1) {
    const standing = standingOn(sheet, storey)
    for (const { loops } of standing) {
      for (const loop of loops) {
        entities.push({
          kind: 'polyline',
          layer: roomsLayer(storey),
          points: loop.map(transform.at),
          closed: true,
        })
      }
    }
    for (const { room, labelAt, area } of standing) {
      entities.push({
        kind: 'text',
        layer: textLayer(storey),
        at: transform.at(labelAt),
        // ASCII only, so the file reads the same in every CAD program: "m2", not "m²".
        text: `${room.name} ${fmt(area)} m2`,
        height: TEXT_HEIGHT_M,
      })
    }
    for (const opening of openingsOn(sheet, storey)) {
      const run = opening.width / 2
      entities.push({
        kind: 'line',
        layer: doorsLayer(storey),
        from: transform.at([
          opening.at[0] - opening.along[0] * run,
          opening.at[1] - opening.along[1] * run,
        ]),
        to: transform.at([
          opening.at[0] + opening.along[0] * run,
          opening.at[1] + opening.along[1] * run,
        ]),
      })
    }
  }
  const { bounds } = transform
  entities.push(...northEntities([bounds.w + NORTH_CLEAR_M, bounds.h - NORTH_REACH_M], NORTH))
  return entities
}

export function dxfOf(sheet: Sheet): string {
  return writeDxf({ layers: layersFor(storeyCountOf(sheet)), entities: entitiesOf(sheet) })
}
