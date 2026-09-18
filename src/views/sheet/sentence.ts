/**
 * The sentence under the sheet: the report turned into the parts the mock's line prints, in order.
 * Nothing here computes a number; every number comes from `report`.
 */

import { fmt, storeyNameOf, type Report, type Settings } from '../../sheet'

/** One clause of the sentence. `lead` is written bold, as the mock writes the storey and the walk. */
export type Part = { lead?: string; text: string; bad?: boolean }

/** What a drawn point caught, in the mock's words. */
export const snapWord = (kind: string): string =>
  kind === 'corner'
    ? 'on a corner'
    : kind === 'wall' || kind === 'line'
      ? 'on a wall line'
      : kind === 'meet'
        ? 'where two lines meet'
        : kind === 'square'
          ? 'square to the wall'
          : kind === 'angle'
            ? "along a neighbour's angle"
            : kind === 'grid'
              ? 'on the grid'
              : 'free'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export function sentenceOf(read: Report, settings: Settings): Part[] {
  const parts: Part[] = []
  parts.push(
    read.storey === 0
      ? {
          lead: read.storeyName,
          text: `${fmt(read.placedArea)} m² placed of ${fmt(read.askedArea)} m² asked, on ${fmt(read.buildableArea)} m² buildable`,
        }
      : {
          lead: read.storeyName,
          text: `${fmt(read.placedArea)} m² placed with the stair, on ${fmt(read.buildableArea)} m² inside the setback`,
        },
  )
  if (read.floors.some((area, k) => k > 0 && area > 0) || read.storey > 0) {
    const sum = read.floors
      .map((area, k) => `${storeyNameOf(k).toLowerCase()} ${fmt(area)}`)
      .join(' + ')
    const ratio = !read.ratioRead
      ? ''
      : read.overRatio
        ? ` over the ${fmt(read.allowed)} m² the ratio allows`
        : ` of ${fmt(read.allowed)} m² the ratio allows`
    parts.push({
      text: `${sum} = ${fmt(read.total)} m²${ratio}`,
      bad: read.ratioRead && read.overRatio,
    })
  }
  if (read.openToBelow.length) parts.push({ text: `open to below: ${read.openToBelow.join(', ')}` })
  if (read.overlaps.length)
    parts.push({
      text: `${read.overlaps.length} ${plural(read.overlaps.length, 'overlap', 'overlaps')} · right-click a room to settle by hand`,
      bad: true,
    })
  if (read.spills.length)
    parts.push({
      text: `${read.spills.join(', ')} past the ${settings.boundary === 'off' ? 'buildable line' : 'line the ground floor may reach'}`,
      bad: true,
    })
  for (const side of read.boundary) {
    if (!side.read) continue
    parts.push(
      side.over
        ? {
            text: `on the ${side.name} ${fmt(side.used)} of ${fmt(side.budget)} m, over by ${fmt(side.overBy)} m`,
            bad: true,
          }
        : { text: `on the ${side.name} ${fmt(side.used)} of ${fmt(side.budget)} m` },
    )
  }
  if (read.shortfalls.length)
    parts.push({
      text: read.shortfalls.map((s) => `${s.name} ${fmt(s.area)} of ${fmt(s.target)}`).join(', '),
    })
  if (read.courts.length)
    parts.push({ text: read.courts.map((c) => `courtyard ${fmt(c.area)} m²`).join(', ') })
  if (read.pockets.count)
    parts.push({
      text: `${read.pockets.count} enclosed ${plural(read.pockets.count, 'space', 'spaces')}, ${fmt(read.pockets.area)} m² together`,
    })
  const walk = read.walk
  if (walk) {
    parts.push({
      lead: 'Walk',
      text: `${walk.reached} of ${walk.all} reached from ${walk.from}`,
    })
    if (walk.unreached.length)
      parts.push({ text: `not reached: ${walk.unreached.join(', ')}`, bad: true })
    if (walk.entryWithoutOutsideDoor)
      parts.push({ text: `${walk.entryWithoutOutsideDoor} has no door from outside`, bad: true })
    if (walk.diwaniyaWithoutStreetDoor)
      parts.push({ text: `${walk.diwaniyaWithoutStreetDoor} has no street door`, bad: true })
    for (const hall of walk.hallways)
      parts.push({
        text: `${hall.name} serves ${hall.doors} ${plural(hall.doors, 'door', 'doors')}`,
      })
    if (walk.cannotOpen.length)
      parts.push({ text: `a door in ${walk.cannotOpen.join(', ')} cannot open`, bad: true })
  }
  return parts
}

/** While a measure is in hand, the sentence reads the measure instead. */
export function measuringSentence(m: {
  a: [number, number] | null
  b: [number, number] | null
  at: [number, number] | null
  kindA: string | null
  kindB: string | null
}): Part[] {
  const to = m.b ?? m.at
  const body = !m.a
    ? 'click the first point'
    : !m.b || !to
      ? `first point ${snapWord(m.kindA ?? 'free')} · click the second`
      : `${fmt(Math.hypot(to[0] - m.a[0], to[1] - m.a[1]))} m at ${Math.round(angleOf(m.a, to))}° · ${fmt(Math.abs(to[0] - m.a[0]))} across, ${fmt(Math.abs(to[1] - m.a[1]))} down · ${snapWord(m.kindA ?? 'free')} to ${snapWord(m.kindB ?? 'free')} · click again for the next`
  return [{ lead: 'Measuring', text: `${body} · nothing moves while measuring · Esc ends` }]
}

const angleOf = (a: [number, number], b: [number, number]) => {
  const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

/** While a shape is being drawn for a room, or a room reshaped. */
export function drawingSentence(state: {
  name: string
  target: number
  shape: 'rect' | 'circle' | 'poly'
  area: number | null
  snapKind: string | null
  reshaping: boolean
  roomArea?: number
}): Part[] {
  const how =
    state.shape === 'rect'
      ? state.reshaping
        ? 'drag corner to corner'
        : 'drag a corner to a corner'
      : state.shape === 'circle'
        ? 'drag from the centre out'
        : state.reshaping
          ? 'click the corners, then the first again'
          : 'click each corner, then the first corner again to close'
  const caught =
    state.snapKind && state.snapKind !== 'free' && state.snapKind !== 'grid'
      ? ` · ${snapWord(state.snapKind)}`
      : ''
  if (state.reshaping)
    return [
      {
        lead: `Reshaping ${state.name}`,
        text: `${fmt(state.roomArea ?? 0)} of ${fmt(state.target)} m² · draw a boundary, ${how}${state.area === null ? '' : ` · ${fmt(state.area)} m² in hand`}${caught} · what overlaps the room is taken away, a touching shape outside is added · Enter applies, Esc cancels`,
        bad: (state.roomArea ?? 0) < state.target - 0.05,
      },
    ]
  return [
    {
      lead: `Drawing ${state.name}`,
      text: `${how}${state.area === null ? '' : ` · ${fmt(state.area)} of ${fmt(state.target)} m²`}${caught} · Esc cancels`,
    },
  ]
}
