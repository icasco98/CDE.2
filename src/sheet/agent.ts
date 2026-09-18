/**
 * The tools the assistant is given: it reads the sheet and changes it through the same actions as
 * the hand, so the geometry is the tool's and the intent is the assistant's. Nothing here renders
 * and nothing here talks to the model.
 */

import { move, place, sendBack, setSize, turn, type Change, type Result } from './actions'
import { areaOf, r2 } from './geometry'
import {
  allPlaced,
  doorsOf,
  storeyNameOf,
  storeyOf,
  type LandingRule,
  type Room,
  type Sheet,
} from './model'
import { report, type Report } from './report'
import { SIDES, type PlotSpec, type Side } from './plot'
import { allowedBox, outsideBuildable } from './settle'

/** One page function offered to the assistant, in the shape the artifact runtime asks for. */
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

/**
 * The sheet the assistant works on: it reads the sheet as it stands, writes one action at a time,
 * says a line in the log, and keeps a note in its memory.
 */
export type Desk = {
  read: () => Sheet
  write: (change: Change) => Result
  say: (line: string) => void
  note: (text: string) => void
}

export const MOVES_PER_CALL = 40

const SAY_CAP = 80

const short = (text: string) => (text.length > SAY_CAP ? `${text.slice(0, SAY_CAP - 1)}…` : text)

/** A room by the name the assistant used: the program's name, the start of it, or its kind. */
export function roomNamed(sheet: Sheet, name: unknown): Room | null {
  const want = String(name ?? '')
    .trim()
    .toLowerCase()
  if (!want) return null
  const rooms = sheet.rooms.filter((r) => !r.extra)
  return (
    rooms.find((r) => r.name.toLowerCase() === want) ??
    rooms.find((r) => r.name.toLowerCase().startsWith(want)) ??
    rooms.find((r) => r.kind === want) ??
    null
  )
}

type PlacedRead = {
  name: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  angle: number
  area: number
  target: number
  doors: number
  locked?: boolean
  outsideLine?: boolean
}

type WaitingRead = { name: string; kind: string; target: number; w: number; h: number }

export type SheetRead = {
  plot: {
    w: number
    h: number
    serviceStreet: string
    sideStreet: string
    neighbours: string
    northArrowTurnedClockwise: string
  }
  lineTheGroundFloorMayReach: { x0: number; y0: number; x1: number; y1: number }
  setbackLine: { x0: number; y0: number; x1: number; y1: number }
  storey: string
  landingRule: LandingRule
  importanceOrder: string[]
  placed: PlacedRead[]
  waiting: WaitingRead[]
  report: Report
}

/** Which way a side of the plot faces, in the words the sheet's own frame uses. */
const sideWord = (side: Side) => (side === 'street' ? 'south' : side)

/** The line a side stands on, so the assistant can say where a boundary is. */
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

/** The sheet in plain data: the plot, the lines, every room's frame, what waits, and the report. */
export function sheetRead(sheet: Sheet, storey: number): SheetRead {
  const box = allowedBox(sheet, storey)
  const { plot } = sheet
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
    lineTheGroundFloorMayReach: corners(box),
    setbackLine: corners(plot.build),
    storey: storeyNameOf(storey),
    landingRule: sheet.settings.rule,
    importanceOrder: sheet.rooms.filter((r) => !r.extra).map((r) => r.name),
    placed: allPlaced(sheet)
      .filter((r) => storeyOf(r) === storey)
      .map((r) => ({
        name: r.name,
        kind: r.kind,
        x: r2(r.x),
        y: r2(r.y),
        w: r2(r.w),
        h: r2(r.h),
        angle: Math.round(r.angle || 0),
        area: r2(areaOf(r)),
        target: r.target,
        doors: doorsOf(r).length,
        ...(r.locked ? { locked: true } : {}),
        ...(outsideBuildable(r, box) ? { outsideLine: true } : {}),
      })),
    waiting: sheet.rooms
      .filter((r) => !r.extra && !r.placed)
      .map((r) => ({ name: r.name, kind: r.kind, target: r.target, w: r.w, h: r.h })),
    report: report(sheet, storey),
  }
}

const sized = (w: number, h: number) => w > 0.5 && h > 0.5 && w < 30 && h < 30

/**
 * One room placed or moved: a waiting room is dropped, a placed one is resized, turned and dragged,
 * each through the hand's own action, so it snaps, is held inside the line, and lands by the rule.
 */
function oneMove(desk: Desk, storey: number, wanted: Record<string, unknown>): string {
  const r = roomNamed(desk.read(), wanted.name)
  if (!r) return `no room called ${String(wanted.name ?? '')}`
  const x = Number(wanted.x)
  const y = Number(wanted.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return `${r.name}: x and y are needed`
  const w = Number(wanted.w)
  const h = Number(wanted.h)
  const angle = wanted.angle === undefined ? undefined : Number(wanted.angle)
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

const placedCount = (sheet: Sheet, storey: number) =>
  allPlaced(sheet).filter((o) => storeyOf(o) === storey && !o.extra).length

const askedCount = (sheet: Sheet) => sheet.rooms.filter((r) => !r.extra).length

/** The four tools, each description a sentence or three: this is all the assistant knows of them. */
export function layoutTools(desk: Desk, storey: number): AgentTool[] {
  return [
    {
      name: 'read_sheet',
      description:
        'The sheet as it stands: the plot, the line the ground floor may reach, the setback line, ' +
        "every room on this storey with its frame (x,y the frame's top-left corner in metres, w, h, " +
        'angle, area, target) or waiting to be placed, and the report — placed of asked, overlaps, ' +
        'spills, boundary used per side, shortfalls, courts, the walk. Call it after a batch to see ' +
        'what landed where.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        const read = sheetRead(desk.read(), storey)
        desk.say(
          short(`read the sheet · ${read.placed.length} of ${askedCount(desk.read())} placed`),
        )
        return read
      },
    },
    {
      name: 'place_rooms',
      description:
        'Place or move rooms, several at once, in importance order. Each: name; x,y the top-left ' +
        'corner of its frame in plot metres (x east 0..20, y south 0..25; the service street is at ' +
        'y=25, the side street at x=20); optional angle in degrees clockwise; optional w,h to ' +
        'resize. Each room snaps to the neighbours and the lines, is held inside the line the ground ' +
        'floor may reach, and the landing rule settles what it overlaps (wait: tinted until settled; ' +
        'push: the room lower in the program slides aside). At most 40 a call. Returns where each ' +
        'landed and the sheet.',
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
        },
        required: ['moves'],
      },
      execute: (input) => {
        const moves = Array.isArray(input.moves) ? input.moves : []
        const landed = moves
          .slice(0, MOVES_PER_CALL)
          .map((one) => oneMove(desk, storey, (one ?? {}) as Record<string, unknown>))
        const sheet = desk.read()
        desk.say(
          short(
            `placed ${placedCount(sheet, storey)} of ${askedCount(sheet)} · ${landed.join(' · ')}`,
          ),
        )
        return { landed, sheet: sheetRead(sheet, storey) }
      },
    },
    {
      name: 'send_back',
      description:
        'Take rooms off the sheet, back to the program, by name: {rooms:[names]}. Their shape and ' +
        'turn go with them. Returns which went back and the sheet.',
      inputSchema: {
        type: 'object',
        properties: { rooms: { type: 'array', items: { type: 'string' } } },
        required: ['rooms'],
      },
      execute: (input) => {
        const names = Array.isArray(input.rooms) ? input.rooms : []
        const ids: string[] = []
        const missing: string[] = []
        for (const name of names) {
          const r = roomNamed(desk.read(), name)
          if (r && r.placed) ids.push(r.id)
          else missing.push(String(name ?? ''))
        }
        const said = ids.length
          ? desk.write(sendBack(desk.read(), { ids })).said
          : 'nothing to send back'
        desk.say(short(said))
        return { said, notPlaced: missing, sheet: sheetRead(desk.read(), storey) }
      },
    },
    {
      name: 'remember',
      description:
        'Write one line into your own memory, kept by the tool and sent to you with every later ' +
        'message: a rule the owner stated, or something you learned you need to know. One short ' +
        'sentence, not a summary of what you just did.',
      inputSchema: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
      },
      execute: (input) => {
        const note = String(input.note ?? '').trim()
        if (!note) return { remembered: false }
        desk.note(note)
        desk.say(short(`noted · ${note}`))
        return { remembered: true }
      },
    },
  ]
}
