/**
 * The verbs of the tool in the architect's hands: one deed at a time, each through the action the
 * owner's hand uses, each saying what it did or why it was refused. A refused deed leaves the sheet
 * as it stood, so the deeds after it still apply.
 */

import {
  addDoor,
  combine,
  copyTo,
  cutToSetback,
  givePocket,
  group,
  lock,
  makeCorridor,
  makeCourt,
  mirror,
  pushOthers,
  reshape,
  restore,
  sendBack,
  setArea,
  setHeight,
  setSize,
  setStorey,
  turn,
  ungroup,
  unlock,
  type Change,
} from './actions'
import { wallNamed, wallOn, type WallName } from './against'
import { fmt, overlapCells, r2, worldPieces } from './geometry'
import { roomNamed, storeyAsked, type Desk } from './desk'
import {
  acrossStoreys,
  heightCap,
  storeyCountOf,
  storeyNameOf,
  storeyOf,
  type DoorType,
  type Point,
  type Poly,
  type Room,
  type Sheet,
} from './model'
import { pocketsOf, type Pocket } from './pockets'

/** One deed: the verb, and the arguments that verb takes, as the architect wrote them. */
export type Deed = Record<string, unknown>

const named = (value: unknown) => String(value ?? '').trim() || 'nothing'

const num = (value: unknown): number | null => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const list = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
      ? []
      : [value]

const refused = (verb: string, why: string) => `${verb} refused · ${why}`

const done = (verb: string, out: { ok: boolean; said: string }) =>
  out.ok ? `${verb} · ${out.said}` : refused(verb, out.said)

type Got = { r: Room } | { why: string }

const stuck = <T extends object>(got: T | { why: string }): got is { why: string } => 'why' in got

/** A room the deed names, standing on the storey the deed works on. */
function onSheet(sheet: Sheet, storey: number, name: unknown): Got {
  const r = roomNamed(sheet, name)
  if (!r) return { why: `no room called ${named(name)}` }
  if (!r.placed) return { why: `${r.name} is not on the sheet yet` }
  if (storeyOf(r) !== storey && !acrossStoreys(r, sheet.settings))
    return {
      why:
        `${r.name} stands on the ${storeyNameOf(storeyOf(r))} storey, ` +
        `not the ${storeyNameOf(storey)}`,
    }
  return { r }
}

/** Every room a deed names, or the first name that will not do. */
function allOnSheet(
  sheet: Sheet,
  storey: number,
  names: unknown,
): { rooms: Room[] } | { why: string } {
  const rooms: Room[] = []
  for (const name of list(names)) {
    const got = onSheet(sheet, storey, name)
    if (stuck(got)) return got
    rooms.push(got.r)
  }
  return rooms.length ? { rooms } : { why: 'name the rooms' }
}

const walledBy = (pk: Pocket, sheet: Sheet) =>
  [...pk.touch.keys()]
    .map((id) => sheet.rooms.find((r) => r.id === id)?.name)
    .filter(Boolean)
    .join(', ')

const spacesHere = (pockets: Pocket[], sheet: Sheet) =>
  pockets.map((pk) => `${fmt(pk.area)} m² walled by ${walledBy(pk, sheet)}`).join('; ')

/**
 * The enclosed space a deed means, by the rooms that wall it in; the only one on the storey needs no
 * naming. A refusal says which spaces there are, so the next deed can name one.
 */
function spaceFor(
  sheet: Sheet,
  storey: number,
  between: unknown,
): { at: number; pocket: Pocket } | { why: string } {
  const pockets = pocketsOf(sheet, storey)
  if (!pockets.length) return { why: `no enclosed space on the ${storeyNameOf(storey)} storey` }
  const round: Room[] = []
  for (const name of list(between)) {
    const r = roomNamed(sheet, name)
    if (!r) return { why: `no room called ${named(name)}` }
    round.push(r)
  }
  if (!round.length)
    return pockets.length === 1
      ? { at: 0, pocket: pockets[0]! }
      : {
          why:
            `${pockets.length} enclosed spaces here — ${spacesHere(pockets, sheet)}: ` +
            'name the rooms round the one you mean',
        }
  // the space between the rooms named is the smallest they all wall in, not the leftover round them
  let at = -1
  for (let i = 0; i < pockets.length; i++)
    if (
      round.every((r) => pockets[i]!.touch.has(r.id)) &&
      (at < 0 || pockets[i]!.area < pockets[at]!.area)
    )
      at = i
  return at >= 0
    ? { at, pocket: pockets[at]! }
    : {
        why:
          `no enclosed space walled by ${round.map((r) => r.name).join(' and ')} — ` +
          `${spacesHere(pockets, sheet)}`,
      }
}

/** The storey a deed sends a room to, refused when the plan has no such storey. */
function storeyFor(sheet: Sheet, value: unknown): { to: number } | { why: string } {
  const asked = storeyAsked(value)
  if (asked === null)
    return { why: `${named(value)} is no storey: name it Ground, First or Second` }
  if (asked < 0 || asked >= storeyCountOf(sheet))
    return {
      why:
        `the plan stands ${storeyCountOf(sheet)} storeys high, so there is no ` +
        `${named(value)} storey: add one first`,
    }
  return { to: asked }
}

const DOOR_ALIAS: Record<string, DoorType> = {
  single: 'door',
  'double door': 'double',
  'sliding door': 'sliding',
  'street door': 'street',
  'double street door': 'street2',
  'open wall': 'open',
}

const DOOR_TYPES: readonly DoorType[] = [
  'door',
  'double',
  'sliding',
  'opening',
  'open',
  'street',
  'street2',
]

const doorTypeNamed = (value: unknown): DoorType | null => {
  const want = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!want) return 'door'
  return DOOR_ALIAS[want] ?? DOOR_TYPES.find((type) => type === want) ?? null
}

/**
 * Where a door goes: a fraction along the named wall, measured from its top-left end as `along` is
 * everywhere else, and a hand's width inside the room so the wall found is that room's own.
 */
function doorSpot(r: Room, wall: WallName, along: number): Point | null {
  const found = wallOn(r, wall)
  if (!found) return null
  const { seg, length } = found
  const first: Point =
    seg.a[1] < seg.b[1] || (seg.a[1] === seg.b[1] && seg.a[0] <= seg.b[0]) ? seg.a : seg.b
  const last: Point = first === seg.a ? seg.b : seg.a
  const t = Math.min(Math.max(along, 0), 1) * length
  const u: Point = [(last[0] - first[0]) / length, (last[1] - first[1]) / length]
  return [r2(first[0] + u[0] * t - seg.n[0] * 0.05), r2(first[1] + u[1] * t - seg.n[1] * 0.05)]
}

/** The polygon a reshape draws, in plot metres. */
function polygonOf(value: unknown): Poly | null {
  if (!Array.isArray(value)) return null
  const poly: Poly = []
  for (const pair of value) {
    const pt = Array.isArray(pair) ? pair : [(pair as Point)?.[0], (pair as Point)?.[1]]
    const x = num(pt[0])
    const y = num(pt[1])
    if (x === null || y === null) return null
    poly.push([x, y])
  }
  return poly.length >= 3 ? poly : null
}

type Doing = (desk: Desk, storey: number, deed: Deed) => string

/** One room, then the action: the shape every verb that works on a single room takes. */
const onOne =
  (
    verb: string,
    act: (r: Room, sheet: Sheet, storey: number, deed: Deed) => Change | string,
  ): Doing =>
  (desk, storey, deed) => {
    const got = onSheet(desk.read(), storey, deed.room)
    if (stuck(got)) return refused(verb, got.why)
    const out = act(got.r, desk.read(), storey, deed)
    return typeof out === 'string' ? refused(verb, out) : done(verb, desk.write(out))
  }

/** Rooms, then the action: the shape every verb that works on several rooms takes. */
const onMany =
  (
    verb: string,
    act: (rooms: Room[], sheet: Sheet, storey: number, deed: Deed) => Change | string,
  ): Doing =>
  (desk, storey, deed) => {
    const got = allOnSheet(desk.read(), storey, deed.rooms ?? deed.room)
    if (stuck(got)) return refused(verb, got.why)
    const out = act(got.rooms, desk.read(), storey, deed)
    return typeof out === 'string' ? refused(verb, out) : done(verb, desk.write(out))
  }

const ids = (rooms: Room[]) => rooms.map((r) => r.id)

const VERBS: Record<string, Doing> = {
  turn: (desk, storey, deed) => {
    const got = onSheet(desk.read(), storey, deed.room)
    if (stuck(got)) return refused('turn', got.why)
    const face = String(deed.face ?? '')
      .trim()
      .toLowerCase()
    const degrees = num(deed.degrees ?? deed.angle)
    const how =
      face === 'north'
        ? { faceNorth: true }
        : deed.quarter
          ? { quarter: true }
          : degrees === null
            ? null
            : { angle: degrees }
    if (!how) return refused('turn', 'say degrees, or quarter, or face: north')
    return done('turn', desk.write(turn(desk.read(), { ids: [got.r.id], storey, ...how })))
  },

  mirror: onOne('mirror', (r, sheet, storey, deed) => {
    const axis = String(deed.axis ?? '')
      .trim()
      .toLowerCase()
    if (axis !== 'x' && axis !== 'y')
      return 'the axis is x to mirror left to right, or y to mirror top to bottom'
    return mirror(sheet, { ids: [r.id], axis, storey })
  }),

  resize: onOne('resize', (r, sheet, storey, deed) => {
    const area = num(deed.area)
    if (area !== null) return setArea(sheet, { id: r.id, area, storey })
    const w = num(deed.w)
    const h = num(deed.h)
    if (w === null && h === null) return 'say w and h in metres, or an area'
    return setSize(sheet, {
      id: r.id,
      storey,
      ...(w === null ? {} : { w }),
      ...(h === null ? {} : { h }),
    })
  }),

  reshape: onOne('reshape', (r, sheet, storey, deed) => {
    const polygon = polygonOf(deed.polygon)
    if (!polygon) return 'the polygon is three corners or more, each [x, y] in plot metres'
    return reshape(sheet, { id: r.id, polygon, storey })
  }),

  carve: (desk, storey, deed) => {
    const cutter = onSheet(desk.read(), storey, deed.room)
    if (stuck(cutter)) return refused('carve', cutter.why)
    const host = onSheet(desk.read(), storey, deed.out_of ?? deed.from)
    if (stuck(host)) return refused('carve', host.why)
    if (host.r === cutter.r) return refused('carve', 'a room cannot be carved out of itself')
    if (!overlapCells(cutter.r, host.r).length)
      return refused('carve', `${cutter.r.name} does not lie over ${host.r.name}`)
    const said: string[] = []
    for (const piece of worldPieces(cutter.r)) {
      const out = desk.write(reshape(desk.read(), { id: host.r.id, polygon: piece, storey }))
      said.push(out.said)
      if (!out.ok) return refused('carve', out.said)
    }
    return `carve · ${host.r.name}: ${said.join(' · ')}`
  },

  push: onOne('push', (r, sheet, storey) => pushOthers(sheet, { ids: [r.id], storey })),

  court: (desk, storey, deed) => {
    const space = spaceFor(desk.read(), storey, deed.between ?? deed.rooms)
    if (stuck(space)) return refused('court', space.why)
    return done('court', desk.write(makeCourt(desk.read(), { pocket: space.at, storey })))
  },

  corridor: (desk, storey, deed) => {
    const space = spaceFor(desk.read(), storey, deed.between ?? deed.rooms)
    if (stuck(space)) return refused('corridor', space.why)
    return done('corridor', desk.write(makeCorridor(desk.read(), { pocket: space.at, storey })))
  },

  give: (desk, storey, deed) => {
    const space = spaceFor(desk.read(), storey, deed.between ?? deed.rooms)
    if (stuck(space)) return refused('give', space.why)
    const to = onSheet(desk.read(), storey, deed.to)
    if (stuck(to)) return refused('give', to.why)
    if (!space.pocket.touch.has(to.r.id))
      return refused('give', `${to.r.name} does not wall that space in`)
    return done(
      'give',
      desk.write(givePocket(desk.read(), { pocket: space.at, room: to.r.id, storey })),
    )
  },

  combine: onMany('combine', (rooms, sheet, storey, deed) => {
    if (rooms.length < 2) return 'name two rooms or more, and which of them survives'
    const survivor = roomNamed(sheet, deed.into ?? deed.survivor)
    if (!survivor || !rooms.includes(survivor))
      return `say which of ${rooms.map((r) => r.name).join(', ')} survives, as into`
    return combine(sheet, { ids: ids(rooms), survivor: survivor.id, storey })
  }),

  lock: onMany('lock', (rooms, sheet, storey) => lock(sheet, { ids: ids(rooms), storey })),

  unlock: onMany('unlock', (rooms, sheet, storey) => unlock(sheet, { ids: ids(rooms), storey })),

  group: onMany('group', (rooms, sheet, storey) => group(sheet, { ids: ids(rooms), storey })),

  ungroup: onMany('ungroup', (rooms, sheet, storey) => ungroup(sheet, { ids: ids(rooms), storey })),

  height: onOne('height', (r, sheet, _storey, deed) => {
    const metres = num(deed.metres ?? deed.height)
    if (metres === null || metres <= 0) return 'say the height in metres'
    const cap = heightCap(r, sheet.settings)
    if (metres > cap + 1e-9) return `${r.name} may stand ${fmt(cap)} m tall at most`
    return setHeight(sheet, { id: r.id, metres })
  }),

  storey: onMany('storey', (rooms, sheet, storey, deed) => {
    const to = storeyFor(sheet, deed.to)
    if (stuck(to)) return to.why
    return setStorey(sheet, { ids: ids(rooms), storey, to: to.to })
  }),

  copy: onMany('copy', (rooms, sheet, storey, deed) => {
    const to = deed.to === undefined ? { to: storey } : storeyFor(sheet, deed.to)
    if (stuck(to)) return to.why
    return copyTo(sheet, { ids: ids(rooms), storey, to: to.to })
  }),

  cut: onMany('cut', (rooms, sheet, storey) => cutToSetback(sheet, { ids: ids(rooms), storey })),

  restore: onOne('restore', (r, sheet, storey) => restore(sheet, { id: r.id, storey })),

  door: onOne('door', (r, sheet, storey, deed) => {
    const wall = wallNamed(deed.wall)
    if (!wall) return 'the wall is north, south, east or west'
    const type = doorTypeNamed(deed.type)
    if (!type) return `${named(deed.type)} is no door: ${DOOR_TYPES.join(', ')}`
    const along = num(deed.along)
    const spot = doorSpot(r, wall, along === null ? 0.5 : along)
    if (!spot) return `${r.name} shows no ${wall} wall`
    const width = num(deed.width)
    return addDoor(sheet, {
      x: spot[0],
      y: spot[1],
      type,
      storey,
      ...(width === null ? {} : { width }),
    })
  }),

  open_wall: (desk, storey, deed) => VERBS.door!(desk, storey, { ...deed, type: 'open' }),

  send_back: onMany('send back', (rooms, sheet) => sendBack(sheet, { ids: ids(rooms) })),
}

/** The verbs, in the order the page teaches them. */
export const VERB_NAMES = Object.keys(VERBS)

/** One deed, applied through the hand's own action; a refusal leaves the sheet as it stood. */
export function doDeed(desk: Desk, storey: number, deed: Deed): string {
  const verb = String(deed.verb ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  const doing = VERBS[verb]
  if (!doing) return `${named(deed.verb)} is no verb of mine: ${VERB_NAMES.join(', ')}`
  return doing(desk, storey, deed)
}
