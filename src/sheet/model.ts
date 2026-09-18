/** The zoning sheet's model: a room, a door, the settings, and the sheet they make. */

import { DEFAULT_PLOT, MAX_STOREYS, STOREY_NAME, type PlotSpec } from './plot'

export type Point = [number, number]
export type Poly = Point[]

export type Category = 'reception' | 'shared' | 'private' | 'service' | 'circulation' | 'open'

export type DoorType = 'door' | 'double' | 'sliding' | 'opening' | 'open' | 'street' | 'street2'

/** A door is the drawing of an edge on a wall of its room: `at` is a point in the room's frame. */
export type Door = {
  id: string
  type: DoorType
  w: number
  at: Point
  flip: boolean
  hinge: boolean
}

/**
 * A room: a rectangle `w` by `h` at `x`, `y` in plot metres, turned `angle` degrees clockwise about
 * the frame's centre, with `pieces` — convex polygons in that frame — when carving or drawing has
 * left it something other than the whole rectangle. `lost` is how much of the frame a cut took, so
 * Restore shape can give it back. `placedAt` is a clock tick, so the newest room gives way in gap
 * closing. `extra` marks a room the sheet itself made, `fixed` one that never moves: a court.
 */
export type Room = {
  id: string
  name: string
  kind: string
  cat: Category
  target: number
  x: number
  y: number
  w: number
  h: number
  angle: number
  pieces: Poly[] | null
  storey?: number
  height?: number
  lost?: { w: number; h: number } | null
  doors?: Door[]
  locked?: boolean
  group?: string
  color?: string
  labelAt?: Point
  placedAt?: number
  placed: boolean
  extra?: boolean
  fixed?: boolean
  /** Kept from a saved sheet that the project's program does not name: it is the sheet's own. */
  aside?: boolean
}

export type LandingRule = 'wait' | 'push'

export type Settings = {
  turnFrom: 'sheet' | 'north'
  snapSquare: number
  showArea: number
  rule: LandingRule
  yieldKeeps: 'rect' | 'rest'
  jamb: number
  tagDelay: number
  colors: Record<string, string>
  snapDist: number
  grid: number
  snapBuild: number
  guides: number
  dims: 'all' | 'size' | 'none'
  dimSize: number
  sharedWalls: number
  dur: number
  ease: string
  allowSpill: number
  hallW: number
  tint: number
  rotSnap: number
  closeGap: number
  showPockets: number
  pocketKeeps: 'shape' | 'square'
  courtArea: number
  courtSide: number
  punch: number
  boundary: 'off' | 'sides' | 'all'
  storeyH: number
  storeyH1: number
  storeyH2: number
  maxHeight: number
  stairTop: number
  showUnder: number
  stairAcross: number
  openBelow: number
  hardSetback: number
  ratioWarn: number
  snapStoreys: number
  streetLabels: number
}

export const DEFAULTS: Settings = {
  turnFrom: 'sheet',
  snapSquare: 1,
  showArea: 0,
  rule: 'wait',
  yieldKeeps: 'rect',
  jamb: 0.15,
  tagDelay: 3,
  colors: {
    reception: '#E9CBC1',
    shared: '#EBDBB9',
    private: '#CBD8E4',
    service: '#D7D5CF',
    circulation: '#E4D2A8',
    open: '#FBFAF7',
  },
  snapDist: 0.4,
  grid: 0.25,
  snapBuild: 1,
  guides: 1,
  dims: 'all',
  dimSize: 0.4,
  sharedWalls: 1,
  dur: 220,
  ease: 'cubic-bezier(.2,.7,.2,1)',
  allowSpill: 1,
  hallW: 1.8,
  tint: 0.28,
  rotSnap: 15,
  closeGap: 0.1,
  showPockets: 0,
  pocketKeeps: 'shape',
  courtArea: 9,
  courtSide: 1.5,
  punch: 2,
  boundary: 'all',
  storeyH: 3.5,
  storeyH1: 3.5,
  storeyH2: 3.5,
  maxHeight: 15,
  stairTop: 18,
  showUnder: 1,
  stairAcross: 1,
  openBelow: 1,
  hardSetback: 1,
  ratioWarn: 1,
  snapStoreys: 1,
  streetLabels: 1,
}

export const SETTINGS_V = 48

/** The rooms in program order, which is the order of importance, with the storeys they stand on. */
export type Sheet = {
  rooms: Room[]
  storeyCount: number
  settings: Settings
  /** The plot under the drawing: the project's where it has one, the fresh brief's otherwise. */
  plot: PlotSpec
}

export const RULE_HINT: Record<LandingRule, string> = {
  wait: 'overlaps are tinted and wait · right-click a room to settle each one',
  push: 'the room lower in the program slides aside, never shrinks',
}

export const ruleOf = (v: unknown): LandingRule => (v === 'push' ? 'push' : 'wait')

/** Settings saved by an older page: the boundary switch was never used, so its old default goes. */
export function migrate(saved: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!saved || typeof saved !== 'object') return saved
  const v = saved.v
  if (!(typeof v === 'number' && v >= SETTINGS_V) && saved.boundary === 'off')
    saved.boundary = 'all'
  return saved
}

export const cloneRoom = (r: Room): Room => JSON.parse(JSON.stringify(r)) as Room

export const cloneSheet = (sheet: Sheet): Sheet => ({
  rooms: sheet.rooms.map(cloneRoom),
  storeyCount: sheet.storeyCount,
  settings: { ...sheet.settings, colors: { ...sheet.settings.colors } },
  plot: sheet.plot,
})

export const sheetOf = (
  rooms: Room[],
  settings: Partial<Settings> = {},
  storeyCount = 2,
  plot: PlotSpec = DEFAULT_PLOT,
): Sheet => ({
  rooms,
  storeyCount,
  plot,
  settings: {
    ...DEFAULTS,
    ...settings,
    colors: { ...DEFAULTS.colors, ...(settings.colors ?? {}) },
  },
})

// ---------- what a room is ----------

export const isOpen = (r: Room) => r.cat === 'open'
export const isStair = (r: Room) => r.kind === 'stair'
export const isCourt = (r: Room) => r.placed && !!r.fixed && r.kind === 'court'
export const doorsOf = (r: Room): Door[] => r.doors ?? []
export const RECT = (w: number, h: number): Poly => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
]
export const piecesOf = (r: Room): Poly[] =>
  r.pieces && r.pieces.length ? r.pieces : [RECT(r.w, r.h)]
/** What the frame maths needs of a room: where it stands, how big it is, and its turn. */
export type Frame = { x: number; y: number; w: number; h: number; angle: number }

export const square = (r: Frame) => !r.angle
export const right = (r: Room) => r.x + r.w
export const bottom = (r: Room) => r.y + r.h
export const centreOf = (r: Frame): Point => [r.x + r.w / 2, r.y + r.h / 2]

export const acrossStoreys = (r: Room, settings: Settings) => isStair(r) && !!settings.stairAcross

export const storeyOf = (r: Room) =>
  Math.max(0, Math.min(MAX_STOREYS - 1, Math.floor(Number(r.storey) || 0)))

export const allPlaced = (sheet: Sheet) => sheet.rooms.filter((r) => r.placed)

/** How many storeys the plan has: what was added, and never fewer than the rooms need. */
export const storeyCountOf = (sheet: Sheet) =>
  Math.max(sheet.storeyCount, ...allPlaced(sheet).map((r) => storeyOf(r) + 1), 1)

/** Floor to floor, per storey, from the settings. */
export const stH = (settings: Settings, k: number) =>
  (k <= 0 ? settings.storeyH : k === 1 ? settings.storeyH1 : settings.storeyH2) || 3.5

export const floorZ = (settings: Settings, k: number) => {
  let z = 0
  for (let i = 0; i < k; i++) z += stH(settings, i)
  return z
}

export const zBase = (r: Room, settings: Settings) => floorZ(settings, storeyOf(r))

/** The stair may add its 3 m stair house; every other zone stops at the building height. */
export const heightCap = (r: Room, settings: Settings) =>
  acrossStoreys(r, settings) ? settings.stairTop || 18 : settings.maxHeight || 15

/** A zone's height: its own, else the stair reaches the top storey's roof, else the storey's. */
export function heightOf(r: Room, sheet: Sheet): number {
  const { settings } = sheet
  if (r.height && r.height > 0) return r.height
  if (acrossStoreys(r, settings)) return floorZ(settings, storeyCountOf(sheet)) - zBase(r, settings)
  return stH(settings, storeyOf(r))
}

export const zTop = (r: Room, sheet: Sheet) =>
  zBase(r, sheet.settings) + Math.min(heightCap(r, sheet.settings), heightOf(r, sheet))

/** Taller than the storey it stands on: open to below on the floor above. */
export const tallRoom = (r: Room, sheet: Sheet) =>
  r.placed &&
  !isOpen(r) &&
  !r.fixed &&
  !acrossStoreys(r, sheet.settings) &&
  heightOf(r, sheet) > stH(sheet.settings, storeyOf(r)) + 0.05

/** Open to the sky, or rising through this floor. */
export const voidOn = (r: Room, k: number, sheet: Sheet) =>
  r.placed &&
  storeyOf(r) < k &&
  (isCourt(r) || (tallRoom(r, sheet) && zTop(r, sheet) > floorZ(sheet.settings, k) + 0.05))

/** The rooms the sheet shows on one storey: that storey's, and the stair when it is one across. */
export const placedRooms = (sheet: Sheet, storey: number) =>
  sheet.rooms.filter(
    (r) => r.placed && (storeyOf(r) === storey || acrossStoreys(r, sheet.settings)),
  )

/** The footprints of the storey below that stand open on this one. */
export const ghostsOf = (sheet: Sheet, storey: number) =>
  storey > 0 && sheet.settings.openBelow ? sheet.rooms.filter((r) => voidOn(r, storey, sheet)) : []

export const isGhost = (r: Room, storey: number, sheet: Sheet) =>
  storey > 0 && !!sheet.settings.openBelow && voidOn(r, storey, sheet)

/** What a move may snap to: this storey, the spaces open to below, and the storeys either side. */
export const snapRooms = (sheet: Sheet, storey: number, except: Room | null) =>
  placedRooms(sheet, storey)
    .concat(
      ghostsOf(sheet, storey),
      sheet.settings.snapStoreys
        ? sheet.rooms.filter(
            (o) =>
              o.placed && !acrossStoreys(o, sheet.settings) && Math.abs(storeyOf(o) - storey) === 1,
          )
        : [],
    )
    .filter((o) => o !== except)

/** A room with the rooms grouped to it, or just itself. */
export const kin = (r: Room, onStorey: Room[]) =>
  r.group ? onStorey.filter((o) => o.group === r.group) : [r]

/** The order of importance is the program order: the lower room gives way. */
export const rank = (r: Room, sheet: Sheet) => sheet.rooms.indexOf(r)

export const storeyNameOf = (k: number) => STOREY_NAME[Math.max(0, Math.min(3, k))]!
