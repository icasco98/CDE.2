/**
 * The tools the architect is given: it reads the whole house and changes it through the same actions
 * as the hand, so the geometry is the tool's and the intent is the architect's. Nothing here renders
 * and nothing here talks to the model.
 */

import { carveBelow, move, place, pushOthers, setSize, turn } from './actions'
import { alongNamed, standAgainst, wallNamed, type Standing } from './against'
import { changesBetween, type Changed } from './changes'
import { roomNamed, storeyNamed, type Desk } from './desk'
import { doDeed, type Deed } from './verbs'
import { areaOf, r2 } from './geometry'
import { meetingsOf, type Apart, type Sharing } from './meetings'
import {
  allPlaced,
  doorsOf,
  heightOf,
  rank,
  storeyCountOf,
  storeyNameOf,
  storeyOf,
  type LandingRule,
  type Room,
  type Sheet,
} from './model'
import { report, type Report } from './report'
import { SIDES, type PlotSpec, type Side } from './plot'
import { allowedBox, outsideBuildable, overlapsOf } from './settle'

/** One page function offered to the architect, in the shape the artifact runtime asks for. */
export type AgentTool = {
  name: string
  description: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
  execute: (input: Record<string, unknown>) => unknown
}

export const MOVES_PER_CALL = 40

const SAY_CAP = 80

const short = (text: string) => (text.length > SAY_CAP ? `${text.slice(0, SAY_CAP - 1)}…` : text)

type PlacedRead = {
  name: string
  kind: string
  storey: string
  x: number
  y: number
  w: number
  h: number
  angle: number
  area: number
  target: number
  height: number
  doors: number
  locked?: boolean
  outsideLine?: boolean
}

type WaitingRead = { name: string; kind: string; target: number; w: number; h: number }

/** One storey of the house: what stands on it, how it stands, and its report. */
export type StoreyRead = {
  storey: string
  lineTheGroundFloorMayReach: { x0: number; y0: number; x1: number; y1: number }
  placed: PlacedRead[]
  /** Every pair that shares a run of wall, and how long that run is in metres. */
  sharing: Sharing[]
  /** Every pair that does not share a wall but meets at a corner or stands a sliver apart. */
  allButTouching: Apart[]
  report: Report
}

export type SheetRead = {
  plot: {
    w: number
    h: number
    serviceStreet: string
    sideStreet: string
    neighbours: string
    northArrowTurnedClockwise: string
  }
  setbackLine: { x0: number; y0: number; x1: number; y1: number }
  /** The storey the owner is looking at; a command works wherever it is told to. */
  onScreen: string
  landingRule: LandingRule
  importanceOrder: string[]
  storeys: StoreyRead[]
  waiting: WaitingRead[]
  /** The floor area of each storey and of the house, against what the ratio allows. */
  totals: { floorAreas: number[]; total: number; allowed: number; overRatio: boolean }
}

/** Which way a side of the plot faces, in the words the sheet's own frame uses. */
const sideWord = (side: Side) => (side === 'street' ? 'south' : side)

/** The line a side stands on, so the architect can say where a boundary is. */
const sideLine = (plot: PlotSpec, side: Side): string =>
  side === 'west'
    ? 'x = 0'
    : side === 'east'
      ? `x = ${plot.w}`
      : side === 'north'
        ? 'y = 0'
        : `y = ${plot.h}`

const corners = (box: { x: number; y: number; w: number; h: number }) => ({
  x0: r2(box.x),
  y0: r2(box.y),
  x1: r2(box.x + box.w),
  y1: r2(box.y + box.h),
})

/** One storey read: its rooms' frames, how they stand to each other, and its report. */
export function storeyRead(sheet: Sheet, storey: number): StoreyRead {
  const meetings = meetingsOf(sheet, storey)
  return {
    storey: storeyNameOf(storey),
    lineTheGroundFloorMayReach: corners(allowedBox(sheet, storey)),
    placed: allPlaced(sheet)
      .filter((r) => storeyOf(r) === storey)
      .map((r) => ({
        name: r.name,
        kind: r.kind,
        storey: storeyNameOf(storeyOf(r)),
        x: r2(r.x),
        y: r2(r.y),
        w: r2(r.w),
        h: r2(r.h),
        angle: Math.round(r.angle || 0),
        area: r2(areaOf(r)),
        target: r.target,
        height: r2(heightOf(r, sheet)),
        doors: doorsOf(r).length,
        ...(r.locked ? { locked: true } : {}),
        ...(outsideBuildable(r, allowedBox(sheet, storey)) ? { outsideLine: true } : {}),
      })),
    sharing: meetings.sharing,
    allButTouching: meetings.apart,
    report: report(sheet, storey),
  }
}

/**
 * The whole house in plain data: the plot and its lines, every storey with its rooms and how they
 * stand to each other, the rooms still waiting, and the floor areas storey by storey and in total.
 */
export function sheetRead(sheet: Sheet, onScreen: number): SheetRead {
  const { plot } = sheet
  const storeys = Array.from({ length: storeyCountOf(sheet) }, (_unused, k) => storeyRead(sheet, k))
  const ground = storeys[0]?.report ?? report(sheet, 0)
  return {
    plot: {
      w: plot.w,
      h: plot.h,
      serviceStreet: plot.service
        ? `${sideWord(plot.service)}, ${sideLine(plot, plot.service)}`
        : 'none',
      sideStreet:
        plot.streets
          .filter((side) => side !== plot.service)
          .map((side) => `${sideWord(side)}, ${sideLine(plot, side)}`)
          .join('; ') || 'none',
      neighbours:
        SIDES.filter((side) => !plot.streets.includes(side))
          .map((side) => `${sideWord(side)} (${sideLine(plot, side)})`)
          .join(' and ') || 'none',
      northArrowTurnedClockwise: `${plot.north}°`,
    },
    setbackLine: corners(plot.build),
    onScreen: storeyNameOf(onScreen),
    landingRule: sheet.settings.rule,
    importanceOrder: sheet.rooms.map((r) => r.name),
    storeys,
    waiting: sheet.rooms
      .filter((r) => !r.placed)
      .map((r) => ({ name: r.name, kind: r.kind, target: r.target, w: r.w, h: r.h })),
    totals: {
      floorAreas: ground.floors,
      total: ground.total,
      allowed: ground.allowed,
      overRatio: ground.overRatio,
    },
  }
}

const sized = (w: number, h: number) => w > 0.5 && h > 0.5 && w < 30 && h < 30

/**
 * One room put where it is asked for: a waiting room is dropped, a placed one is resized, turned and
 * dragged, each through the hand's own action, so it snaps, is held inside the line, and lands by
 * the rule.
 */
function putRoom(desk: Desk, storey: number, r: Room, wanted: Partial<Standing>): string {
  const x = Number(wanted.x)
  const y = Number(wanted.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return `${r.name}: x and y are needed`
  const w = Number(wanted.w)
  const h = Number(wanted.h)
  const angle = wanted.angle
  if (!r.placed) {
    const put = place(desk.read(), {
      id: r.id,
      x,
      y,
      storey,
      ...(angle !== undefined && Number.isFinite(angle) ? { angle } : {}),
      ...(sized(w, h) ? { w, h } : {}),
    })
    return desk.write(put).said
  }
  if (sized(w, h)) {
    const scaled = desk.write(setSize(desk.read(), { id: r.id, w, h, storey }))
    if (!scaled.ok) return scaled.said
  }
  if (angle !== undefined && Number.isFinite(angle)) {
    const turned = desk.write(turn(desk.read(), { ids: [r.id], storey, angle }))
    if (!turned.ok) return turned.said
  }
  const now = desk.read().rooms.find((o) => o.id === r.id)
  if (!now) return `${r.name} is no longer on the sheet`
  return desk.write(move(desk.read(), { ids: [r.id], dx: x - now.x, dy: y - now.y, storey })).said
}

/** One room asked for by name and coordinates, as `place_rooms` takes them. */
function oneMove(desk: Desk, storey: number, wanted: Record<string, unknown>): string {
  const r = roomNamed(desk.read(), wanted.name)
  if (!r) return `no room called ${String(wanted.name ?? '')}`
  return putRoom(desk, storey, r, {
    x: Number(wanted.x),
    y: Number(wanted.y),
    w: Number(wanted.w),
    h: Number(wanted.h),
    ...(wanted.angle === undefined ? {} : { angle: Number(wanted.angle) }),
  })
}

/** One room put against a named wall of another, the tool working out where that is. */
function onePlacing(desk: Desk, storey: number, asked: Record<string, unknown>): string {
  const sheet = desk.read()
  const r = roomNamed(sheet, asked.room)
  if (!r) return `no room called ${String(asked.room ?? '')}`
  const target = roomNamed(sheet, asked.against)
  if (!target) return `no room called ${String(asked.against ?? '')}`
  if (!target.placed) return `${target.name} is not on the sheet yet`
  if (storeyOf(target) !== storey)
    return `${target.name} stands on the ${storeyNameOf(storeyOf(target))} storey, not the ${storeyNameOf(storey)}`
  const wall = wallNamed(asked.wall)
  if (!wall) return `${r.name}: the wall must be north, south, east or west`
  const w = Number(asked.w)
  const h = Number(asked.h)
  const size = sized(w, h) ? { w: r2(w), h: r2(h) } : { w: r.w, h: r.h }
  const offset = asked.offset === undefined ? undefined : Number(asked.offset)
  const standing = standAgainst(
    target,
    wall,
    { name: r.name, ...size },
    alongNamed(asked.along),
    offset,
  )
  if (!standing.ok) return standing.why
  const said = putRoom(desk, storey, r, standing.standing)
  return `${said} · against ${target.name}'s ${wall} wall`
}

const placedCount = (sheet: Sheet, storey: number) =>
  allPlaced(sheet).filter((o) => storeyOf(o) === storey).length

const askedCount = (sheet: Sheet) => sheet.rooms.length

/** How a batch is reported back: the house as it now stands, and what this call changed in it. */
type Done = { landed: string[]; changed: Changed; house: SheetRead }

/**
 * The tools, each description a sentence or three: this is all the architect knows of them. The
 * batches it has written in this message are kept here, so it can take its own last one back.
 */
export function layoutTools(desk: Desk, onScreen: number): AgentTool[] {
  const batches: { sheet: Sheet; said: string; storey: number }[] = []

  /** One tool call: the sheet before it is kept, and the house and what changed come back. */
  const batch = (storey: number, label: (sheet: Sheet) => string, work: () => string[]): Done => {
    const before = desk.read()
    const landed = work()
    const after = desk.read()
    const said = label(after)
    if (after !== before) batches.push({ sheet: before, said, storey })
    const changed = changesBetween(before, after, storey)
    desk.say(short(`${said} · ${landed.join(' · ')}`))
    return { landed, changed, house: sheetRead(after, onScreen) }
  }

  return [
    {
      name: 'read_sheet',
      description:
        'The whole house as it stands: the plot, the setback line, and every storey with each room ' +
        'on it (frame x,y the top-left corner in metres, w, h, angle, area, target, height, doors), ' +
        'how the rooms stand to each other — every pair that shares a run of wall and how long it ' +
        'is, and every pair that only meets at a corner or stands a sliver apart — the rooms still ' +
        'waiting, the report per storey and the floor areas in total. Call it after a batch.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        const read = sheetRead(desk.read(), onScreen)
        desk.say(short(`read the house · ${askedCount(desk.read())} rooms asked for`))
        return read
      },
    },
    {
      name: 'place_against',
      description:
        'Put rooms against a named wall of another room, touching it and lying along it: each ' +
        '{room, against, wall: north|south|east|west of that room, along: start|end|centre, ' +
        'offset: metres from the near end instead, w, h to resize}. The tool works out the ' +
        'coordinates, the sheet snaps and holds it inside the line, and a wall too short to take the ' +
        'room is refused with the reason. Several placements in one call, in importance order. ' +
        'storey: the storey by name, the one on screen by default.',
      inputSchema: {
        type: 'object',
        properties: {
          placements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                room: { type: 'string' },
                against: { type: 'string' },
                wall: { type: 'string' },
                along: { type: 'string' },
                offset: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' },
              },
              required: ['room', 'against', 'wall'],
            },
          },
          storey: { type: 'string' },
        },
        required: ['placements'],
      },
      execute: (input) => {
        const storey = storeyNamed(input.storey, onScreen)
        const asked = Array.isArray(input.placements) ? input.placements : []
        return batch(
          storey,
          () => `placed against · ${storeyNameOf(storey)}`,
          () =>
            asked
              .slice(0, MOVES_PER_CALL)
              .map((one) => onePlacing(desk, storey, (one ?? {}) as Record<string, unknown>)),
        )
      },
    },
    {
      name: 'place_rooms',
      description:
        'Place or move rooms by coordinate, several at once, in importance order. Each: name; x,y ' +
        'the top-left corner of its frame in plot metres (x east, y south); optional angle in ' +
        'degrees clockwise; optional w,h to resize. Each room snaps to the neighbours and the lines, ' +
        'is held inside the line the ground floor may reach, and the landing rule settles what it ' +
        'overlaps. At most 40 a call. storey: the storey by name, the one on screen by default. ' +
        'Prefer place_against wherever a room belongs beside another.',
      inputSchema: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                angle: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' },
              },
              required: ['name', 'x', 'y'],
            },
          },
          storey: { type: 'string' },
        },
        required: ['moves'],
      },
      execute: (input) => {
        const storey = storeyNamed(input.storey, onScreen)
        const moves = Array.isArray(input.moves) ? input.moves : []
        return batch(
          storey,
          (sheet) => `placed ${placedCount(sheet, storey)} of ${askedCount(sheet)}`,
          () =>
            moves
              .slice(0, MOVES_PER_CALL)
              .map((one) => oneMove(desk, storey, (one ?? {}) as Record<string, unknown>)),
        )
      },
    },
    {
      name: 'settle',
      description:
        'Settle an overlap, as the right-click menu does: {room, with: the other room, how: carve|' +
        'push}. The room higher in the order of importance keeps its shape and the lower one gives ' +
        'way — carved to the shape of the higher one, or slid aside. Every overlap the higher room ' +
        'is in is settled, not only this pair. storey: the storey by name, the one on screen by ' +
        'default.',
      inputSchema: {
        type: 'object',
        properties: {
          room: { type: 'string' },
          with: { type: 'string' },
          how: { type: 'string' },
          storey: { type: 'string' },
        },
        required: ['room', 'how'],
      },
      execute: (input) => {
        const storey = storeyNamed(input.storey, onScreen)
        const how = String(input.how ?? '').toLowerCase() === 'push' ? 'push' : 'carve'
        return batch(
          storey,
          () => `settled by ${how}`,
          () => {
            const sheet = desk.read()
            const one = roomNamed(sheet, input.room)
            if (!one) return [`no room called ${String(input.room ?? '')}`]
            const other = input.with === undefined ? null : roomNamed(sheet, input.with)
            if (input.with !== undefined && !other)
              return [`no room called ${String(input.with ?? '')}`]
            const overlap = overlapsOf(sheet, storey).find(
              (o) => (o.a === one || o.b === one) && (!other || o.a === other || o.b === other),
            )
            if (!overlap) return [`nothing lies under ${one.name}`]
            // the room higher in the order of importance keeps its shape; the lower one gives way
            const keeps = rank(overlap.a, sheet) <= rank(overlap.b, sheet) ? overlap.a : overlap.b
            const settling = { ids: [keeps.id], storey }
            const done = desk.write(
              how === 'push' ? pushOthers(sheet, settling) : carveBelow(sheet, settling),
            )
            return [`${keeps.name} kept its shape · ${done.said}`]
          },
        )
      },
    },
    {
      name: 'take_back',
      description:
        'Take back your own last batch, before you answer: the sheet goes back to how it stood ' +
        'before your last placing or settling in this message. Use it when a batch made the plan ' +
        'worse, rather than patching forward. Nothing of the owner’s is taken back.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        const last = batches.pop()
        if (!last) {
          desk.say('nothing of mine to take back')
          return { tookBack: false, house: sheetRead(desk.read(), onScreen) }
        }
        const before = desk.read()
        desk.write({ sheet: last.sheet, result: { ok: true, said: 'taken back' } })
        desk.say(short(`took back · ${last.said}`))
        return {
          tookBack: true,
          was: last.said,
          changed: changesBetween(before, desk.read(), last.storey),
          house: sheetRead(desk.read(), onScreen),
        }
      },
    },
    {
      name: 'remember',
      description:
        'Write into your own memory, kept by the tool and sent to you with every later message. ' +
        'note: one line you have learned, in your own words — a rule the owner stated, or what you ' +
        'now know to do differently; replaces: the older line this one is written over, so the page ' +
        'never holds two versions of a rule. request: a command you lacked, which the cofounder ' +
        'reads and either builds or refuses. One short sentence each, not a summary of what you did.',
      inputSchema: {
        type: 'object',
        properties: {
          note: { type: 'string' },
          replaces: { type: 'string' },
          request: { type: 'string' },
        },
      },
      execute: (input) => {
        const note = String(input.note ?? '').trim()
        const request = String(input.request ?? '').trim()
        const replaces = String(input.replaces ?? '').trim()
        if (note) desk.note(note, replaces || undefined)
        if (request) desk.request(request)
        if (note || request) desk.say(short(`noted · ${note || request}`))
        return { remembered: !!note, asked: !!request }
      },
    },
    {
      name: 'do',
      description:
        'Every other verb of the tool, in a list applied in order: deeds:[{verb, …}]. ' +
        "turn{room, degrees|quarter:true|face:'north'}; mirror{room, axis:x|y}; " +
        'resize{room, w, h | area}; reshape{room, polygon:[[x,y]…] in plot metres}; ' +
        'carve{room, out_of: the room it is taken out of}; push{room: what lies under it slides ' +
        'aside}; court{between:[the rooms round the enclosed space]}; corridor{between}; ' +
        'give{between, to}; combine{rooms:[names], into: the one that survives}; lock{rooms}; ' +
        'unlock{rooms}; group{rooms}; ungroup{rooms}; height{room, metres}; ' +
        'storey{rooms, to: a storey by name}; copy{room, to}; cut{room: past the setback}; ' +
        'restore{room}; door{room, wall:north|south|east|west, type:door|double|sliding|opening|' +
        'street|street2, along: 0–1 of the way along that wall}; open_wall{room, wall, along}; ' +
        'send_back{rooms}. Each deed says what it did, or refuses with the reason and changes ' +
        'nothing while the rest of the list still runs. storey: by name, the one on screen by default.',
      inputSchema: {
        type: 'object',
        properties: {
          deeds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                verb: { type: 'string' },
                room: { type: 'string' },
                rooms: { type: 'array', items: { type: 'string' } },
              },
              required: ['verb'],
            },
          },
          storey: { type: 'string' },
        },
        required: ['deeds'],
      },
      execute: (input) => {
        const storey = storeyNamed(input.storey, onScreen)
        const deeds = Array.isArray(input.deeds) ? input.deeds : []
        return batch(
          storey,
          () => `did · ${storeyNameOf(storey)}`,
          () =>
            deeds.slice(0, MOVES_PER_CALL).map((one) => doDeed(desk, storey, (one ?? {}) as Deed)),
        )
      },
    },
  ]
}
