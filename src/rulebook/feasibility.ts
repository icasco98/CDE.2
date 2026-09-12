import { EXTERIOR, type Endpoint } from '../model'
import { storeyLabel } from './fit'
import { kerbFor } from './kerb'
import { isPlanar, type Pair } from './planarity'
import { sidesOf } from './sides'
import type { PlotShape } from './setbacks'
import { roomTypeById } from './sizes'
import { freeProportion } from './types'
import { inWords, metresIn } from './words'

/*
 * The brief checked before a bubble moves, under decision 21: a link can fail because the program
 * asked for what geometry cannot give, and that is knowable from the graph and the plot alone. A
 * finding says which of the three it is and what to do about it. A finding never stops a settle.
 */

/** A room as the check reads one: what it is, what it is called and how much of it there is. */
export type BriefRoom = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
}

export type BriefEdge = { readonly a: Endpoint; readonly b: Endpoint; readonly storey: number }

export type Finding = {
  readonly code: 'crossing' | 'wall' | 'kerb'
  readonly storey: number
  /** What is wrong and what to do about it, in one sentence. */
  readonly sentence: string
}

/** How much wall one link needs, in metres, and the area under which a room counts as small. */
const PER_LINK = 1
const SMALL_LINK = 0.9

/** The Municipality's smallest room; under it a door may take a little less wall. */
const SMALL_ROOM_M2 = 10

/** A corridor with no width of its own is read at the Municipality's clear minimum, in metres. */
const CORRIDOR_WIDTH = 1.2

/** The overlap two bubbles on one kerb may take of each other, as a share of the smaller radius. */
const LIE_OVER = 0.6

function standsOn(room: BriefRoom, storey: number): boolean {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return storey >= room.storey && storey < room.storey + span
}

/**
 * How many links a room's wall can hold at its target aspect. A link needs a metre of wall, and it
 * has to be a metre of one wall rather than a metre taken round a corner, so what a room can give
 * is read off the wall it has: the mean of the four at the most generous aspect its kind admits.
 *
 * A corridor is the exception, and it is the reason a corridor exists: it is served down both of
 * its long sides, so what it can hold is read off its length twice over. Its own row leaves the
 * proportion free, so the length is the one its area gives at the Municipality's clear width.
 */
export function linksHeld(room: BriefRoom): number | undefined {
  const kind = roomTypeById(room.type)
  if (!kind) return undefined
  const per = room.targetArea < SMALL_ROOM_M2 ? SMALL_LINK : PER_LINK
  if (kind.proportion === freeProportion) {
    const width = kind.legalFloor?.width ?? CORRIDOR_WIDTH
    return Math.floor((2 * Math.max(room.targetArea, 0)) / width / per)
  }
  const ratio = Math.max(1, kind.proportion.max)
  const short = Math.sqrt(Math.max(room.targetArea, 0) / ratio)
  const long = short * ratio
  return Math.floor((short + long) / 2 / per)
}

function radiusOf(area: number): number {
  return Math.sqrt(Math.max(area, 0) / Math.PI)
}

/** The rooms of a storey and the links between two of them, as the planarity test reads them. */
function graphOn(
  rooms: readonly BriefRoom[],
  edges: readonly BriefEdge[],
  storey: number,
): { readonly nodes: string[]; readonly pairs: Pair[] } {
  const here = rooms.filter((room) => standsOn(room, storey))
  const known = new Set(here.map((room) => room.id))
  const pairs: Pair[] = []
  for (const edge of edges) {
    if (edge.storey !== storey) continue
    if (!known.has(edge.a) || !known.has(edge.b)) continue
    pairs.push([edge.a, edge.b])
  }
  return { nodes: here.map((room) => room.id), pairs }
}

/**
 * Every finding this program carries on this plot, storey by storey: the links that cannot be
 * drawn without one crossing another, the rooms asked to touch more than their wall can hold, and
 * the kerb asked to hold more frontage than it has.
 */
export function feasibility(
  rooms: readonly BriefRoom[],
  edges: readonly BriefEdge[],
  plot: PlotShape,
  storeys: number,
): readonly Finding[] {
  const levels = Math.max(1, Math.trunc(storeys))
  const found: Finding[] = []
  const sides = sidesOf(plot)

  for (let storey = 0; storey < levels; storey++) {
    const { nodes, pairs } = graphOn(rooms, edges, storey)
    if (nodes.length > 0 && !isPlanar(nodes, pairs))
      found.push({
        code: 'crossing',
        storey,
        sentence: `${storeyLabel(storey)}: these links cannot all be drawn without one crossing another, so one pair can never share a wall. Remove a link between two rooms that do not need a door.`,
      })

    for (const room of rooms) {
      if (!standsOn(room, storey) || room.storey !== storey) continue
      const held = linksHeld(room)
      if (held === undefined) continue
      const links = edges.filter(
        (edge) =>
          (edge.a === room.id || edge.b === room.id) &&
          (edge.a === EXTERIOR || edge.b === EXTERIOR || edge.storey === storey),
      ).length
      if (links <= held) continue
      found.push({
        code: 'wall',
        storey,
        sentence: `${room.name} is linked to ${inWords(links)} rooms; at ${metresIn(room.targetArea)} m² it can touch ${inWords(held)}. Remove a link.`,
      })
    }

    // The kerb, one boundary at a time: two rooms walled onto the same street cannot both have the
    // frontage. The bubbles may lie over one another by the quarter the model allows, so the run
    // they really need is that much less than the sum of their widths.
    const onKerb = new Map<number, BriefRoom[]>()
    for (const room of rooms) {
      if (!standsOn(room, storey) || room.storey !== storey) continue
      const side = kerbFor(room.type, sides)
      if (!side) continue
      onKerb.set(side.index, [...(onKerb.get(side.index) ?? []), room])
    }
    for (const [index, standing] of onKerb) {
      const side = sides.every.find((each) => each.index === index)
      if (!side || standing.length === 0) continue
      const radii = standing.map((room) => radiusOf(room.targetArea))
      let needed = radii.reduce((total, radius) => total + 2 * radius, 0)
      for (let i = 0; i + 1 < radii.length; i++)
        needed -= LIE_OVER * Math.min(radii[i] as number, radii[i + 1] as number)
      if (needed <= side.length) continue
      found.push({
        code: 'kerb',
        storey,
        sentence: `The kerb is ${metresIn(side.length)} m and ${listOf(standing)} need ${metresIn(needed)} m of it. Move one to another storey, or give it less area.`,
      })
    }
  }
  return found
}

/** The rooms standing on a kerb, by the names the program gave them. */
function listOf(rooms: readonly BriefRoom[]): string {
  const said = rooms.map((room) => room.name)
  if (said.length <= 1) return said[0] ?? 'nothing'
  return `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`
}
