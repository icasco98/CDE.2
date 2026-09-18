/**
 * The program and the sample sheet. The default ground floor comes from the fresh brief, sized from
 * the room-type ranges for a 400 to 750 m² plot; the owner's sheet, saved on 16 September 2026 at
 * 12:38, is the plan the tool opens with.
 */

import {
  DEFAULTS,
  type Category,
  type Door,
  type Poly,
  type Room,
  type Settings,
  type Sheet,
  sheetOf,
} from './model'
import { canonicalise, areaOf, r2, snapTo } from './geometry'
import type { DoorType } from './model'

/** Every kind the room-type table knows: its category and the proportion its default size takes. */
export const KINDS: Record<string, { cat: Category; ratio: number }> = {
  'entry-foyer': { cat: 'shared', ratio: 1.25 },
  stair: { cat: 'circulation', ratio: 1.9 },
  diwaniya: { cat: 'reception', ratio: 1.5 },
  'diwaniya-wc': { cat: 'service', ratio: 1.3 },
  'prep-kitchen': { cat: 'service', ratio: 1.3 },
  'formal-living': { cat: 'shared', ratio: 1.3 },
  'family-living': { cat: 'shared', ratio: 1.3 },
  'dining-room': { cat: 'shared', ratio: 1.5 },
  kitchen: { cat: 'shared', ratio: 1.4 },
  storage: { cat: 'service', ratio: 1.5 },
  'guest-wc': { cat: 'service', ratio: 1.4 },
  'maid-room': { cat: 'service', ratio: 1.2 },
  'maid-bathroom': { cat: 'service', ratio: 1.3 },
  'driver-room': { cat: 'service', ratio: 1.2 },
  'driver-bathroom': { cat: 'service', ratio: 1.3 },
  hallway: { cat: 'circulation', ratio: 0 },
  'car-bay': { cat: 'open', ratio: 2 },
  garden: { cat: 'open', ratio: 1.3 },
  'master-bedroom': { cat: 'private', ratio: 1.25 },
  bedroom: { cat: 'private', ratio: 1.25 },
  ensuite: { cat: 'private', ratio: 1.4 },
  bathroom: { cat: 'private', ratio: 1.4 },
  dressing: { cat: 'private', ratio: 1.4 },
  office: { cat: 'private', ratio: 1.25 },
  prayer: { cat: 'private', ratio: 1.25 },
  laundry: { cat: 'service', ratio: 1.3 },
  'service-entrance': { cat: 'service', ratio: 1.5 },
  'women-reception': { cat: 'shared', ratio: 1.3 },
  courtyard: { cat: 'open', ratio: 1.3 },
  room: { cat: 'shared', ratio: 1.3 },
  court: { cat: 'open', ratio: 1.3 },
}

/**
 * The fresh brief's ground floor: big is the top of the kind's range, medium the middle, small the
 * bottom. The car bays and the garden are open ground, not building: they count in nothing.
 */
export const PROGRAM: [string, string, number][] = [
  ['Entry', 'entry-foyer', 8],
  ['Stair', 'stair', 15],
  ['Diwaniya', 'diwaniya', 60],
  ['Diwaniya WC', 'diwaniya-wc', 5],
  ['Diwaniya Kitchen', 'prep-kitchen', 8],
  ['Family Living', 'family-living', 45],
  ['Formal Living', 'formal-living', 35],
  ['Dining Room', 'dining-room', 24],
  ['Kitchen', 'kitchen', 21],
  ['Pantry', 'storage', 4],
  ['Guest WC', 'guest-wc', 3],
  ['Maid Room', 'maid-room', 12],
  ['Maid Bath', 'maid-bathroom', 4.5],
  ['Driver Room', 'driver-room', 12],
  ['Driver Bath', 'driver-bathroom', 4.5],
  ['Store', 'storage', 6],
  ['Ground Hallway', 'hallway', 24],
  ['Car 1', 'car-bay', 12.5],
  ['Car 2', 'car-bay', 12.5],
  ['Car 3', 'car-bay', 12.5],
  ['Garden', 'garden', 25],
]

/** A saved layout of another program is not read back. */
export const PROGRAM_TAG = 'fresh-brief-2'

/** Each kind's label and the range for a 400 to 750 m² plot: the bottom and the top. */
export const KIND_INFO: Record<string, [string, number, number]> = {
  'entry-foyer': ['Entry', 6, 12],
  stair: ['Stair', 12, 20],
  diwaniya: ['Diwaniya', 45, 60],
  'diwaniya-wc': ['Diwaniya WC', 4, 6],
  'prep-kitchen': ['Prep kitchen', 8, 14],
  'formal-living': ['Formal living', 30, 40],
  'family-living': ['Family living', 32, 45],
  'women-reception': ["Women's reception", 24, 40],
  'dining-room': ['Dining room', 18, 32],
  kitchen: ['Kitchen', 14, 28],
  'master-bedroom': ['Master bedroom', 22, 36],
  bedroom: ['Bedroom', 14, 22],
  ensuite: ['Ensuite bathroom', 5, 8],
  bathroom: ['Bathroom', 4, 7],
  'guest-wc': ['Guest WC', 2.5, 4],
  dressing: ['Dressing room', 6, 12],
  office: ['Office / study', 12, 18],
  prayer: ['Prayer room', 6, 12],
  laundry: ['Laundry', 6, 10],
  storage: ['Storage', 4, 10],
  'service-entrance': ['Service entrance', 3, 8],
  hallway: ['Hallway', 6, 30],
  'maid-room': ['Maid room', 10, 14],
  'maid-bathroom': ['Maid bathroom', 4, 5],
  'driver-room': ['Driver room', 10, 14],
  'driver-bathroom': ['Driver bathroom', 4, 5],
  'car-bay': ['Car bay', 12.5, 12.5],
  garden: ['Garden', 16, 50],
  courtyard: ['Courtyard', 16, 50],
  room: ['Room (other)', 10, 20],
}

/** The door types the Openings toolbar offers, each with the width it arrives at. */
export const DOOR: Record<DoorType, { w: number; label: string }> = {
  door: { w: 0.9, label: 'Door' },
  double: { w: 1.8, label: 'Double door' },
  sliding: { w: 1.8, label: 'Sliding door' },
  opening: { w: 1.2, label: 'Opening' },
  open: { w: 2.4, label: 'Open wall' },
  street: { w: 1.2, label: 'Street door' },
  street2: { w: 2, label: 'Double street door' },
}

export const isStreetDoor = (d: Door) => d.type === 'street' || d.type === 'street2'
export const hasHinge = (d: Door) => d.type === 'door' || d.type === 'street'
export const hasSwing = (d: Door) =>
  d.type !== 'opening' && d.type !== 'sliding' && d.type !== 'open'

/** The size a kind arrives at for a target area: the width on the quarter-metre grid, the depth exact. */
export function sizeFor(
  kind: string,
  target: number,
  settings: Settings,
): { w: number; h: number } {
  const k = KINDS[kind] ?? KINDS.room!
  if (kind === 'hallway') return { w: settings.hallW, h: r2(target / settings.hallW) }
  const w = snapTo(Math.sqrt(target * k.ratio), 0.25)
  return { w: r2(w), h: r2(target / w) }
}

/** The program as rooms, none of them placed. */
export function freshRooms(settings: Settings = DEFAULTS): Room[] {
  return PROGRAM.map(([name, kind, target], i) => {
    const s = sizeFor(kind, target, settings)
    return {
      id: 'r' + i,
      name,
      kind,
      cat: KINDS[kind]!.cat,
      target,
      w: s.w,
      h: s.h,
      x: 0,
      y: 0,
      angle: 0,
      pieces: null,
      placed: false,
    }
  })
}

/** The owner's sheet as saved on 16 September 2026 at 12:38, built into the page. */
type SavedRoom = Omit<Room, 'cat' | 'angle' | 'pieces'> & {
  cat: string
  angle?: number
  pieces?: Poly[] | null
}

const EMBEDDED_ROOMS: SavedRoom[] = [
  {
    angle: 0,
    cat: 'shared',
    doors: [
      {
        at: [0, 1],
        flip: false,
        hinge: false,
        id: 'dmu3ypmqrqt7j',
        type: 'opening',
        w: 1.7,
      },
      {
        at: [5.61, 1],
        flip: false,
        hinge: false,
        id: 'dmu41ksjdtice',
        type: 'street2',
        w: 1.7,
      },
      {
        at: [2.805, 0],
        flip: false,
        hinge: false,
        id: 'dmu41p7feb2qv',
        type: 'opening',
        w: 3,
      },
    ],
    h: 2,
    id: 'r0',
    kind: 'entry-foyer',
    lost: {
      h: 1.25,
      w: 0,
    },
    name: 'Entry',
    pieces: null,
    placed: true,
    placedAt: 173,
    target: 8,
    w: 5.61,
    x: 11.39,
    y: 7,
  },
  {
    angle: 0,
    cat: 'circulation',
    doors: [
      {
        at: [6.25, 1.685],
        flip: false,
        hinge: false,
        id: 'dmu42k3d6v62v',
        type: 'open',
        w: 3.27,
      },
    ],
    h: 3.37,
    id: 'r1',
    kind: 'stair',
    lost: {
      h: 0,
      w: 1.99,
    },
    name: 'Stair',
    pieces: null,
    placed: true,
    placedAt: 115,
    target: 15,
    w: 6.25,
    x: 1.5,
    y: 9,
  },
  {
    angle: 25,
    cat: 'reception',
    doors: [
      {
        at: [0, 0.75],
        flip: false,
        hinge: false,
        id: 'dmu41nkhpgn2u',
        type: 'opening',
        w: 1.2,
      },
      {
        at: [0, 6.41],
        flip: false,
        hinge: false,
        id: 'dmu41uk3gzug2',
        type: 'street',
        w: 1.2,
      },
      {
        at: [1.65, 0],
        flip: false,
        hinge: false,
        id: 'dmu41q18ldt40',
        type: 'sliding',
        w: 2.5,
      },
    ],
    h: 7.16,
    id: 'r2',
    kind: 'diwaniya',
    locked: false,
    lost: {
      h: 0.64,
      w: 4.31,
    },
    name: 'Diwaniya',
    pieces: null,
    placed: true,
    placedAt: 141,
    target: 60,
    w: 5.38,
    x: 11.856468,
    y: 15.039586,
  },
  {
    angle: 25,
    cat: 'service',
    doors: [
      {
        at: [-21.580222, 0.6],
        flip: false,
        hinge: false,
        id: 'dmu3z49xn6xvp',
        type: 'door',
        w: 0.9,
      },
    ],
    h: 3.57,
    id: 'r3',
    kind: 'diwaniya-wc',
    lost: {
      h: 0,
      w: 0.49,
    },
    name: 'Diwaniya WC',
    pieces: null,
    placed: true,
    placedAt: 5,
    target: 5,
    w: 2.12,
    x: 10.84915,
    y: 13.622297,
  },
  {
    angle: 0,
    cat: 'shared',
    doors: [
      {
        at: [7.75, 8],
        flip: false,
        hinge: false,
        id: 'dmu41l0s9u07g',
        type: 'opening',
        w: 1.7,
      },
    ],
    h: 9,
    id: 'r5',
    kind: 'family-living',
    lost: {
      h: 0,
      w: 1.5,
    },
    name: 'Family Living',
    pieces: null,
    placed: true,
    placedAt: 67,
    target: 45,
    w: 7.75,
    x: 0,
    y: 0,
  },
  {
    angle: 0,
    cat: 'shared',
    h: 5.5,
    id: 'r6',
    kind: 'formal-living',
    lost: {
      h: 0.19,
      w: 1.5,
    },
    name: 'Formal Living',
    pieces: null,
    placed: true,
    placedAt: 77,
    target: 35,
    w: 7.11,
    x: 11.39,
    y: 1.5,
  },
  {
    angle: 0,
    cat: 'shared',
    doors: [],
    h: 6.741356,
    id: 'r7',
    kind: 'dining-room',
    lost: {
      h: 0.316694,
      w: 0.116903,
    },
    name: 'Dining Room',
    pieces: [
      [
        [0, 3.370084],
        [0, 0],
        [8.759824, 0],
      ],
      [
        [0, 3.370084],
        [8.759824, 0],
        [8.759824, 3.366567],
      ],
      [
        [8.759824, 3.366567],
        [7.104909, 6.741356],
        [0, 3.370084],
      ],
    ],
    placed: true,
    placedAt: 101,
    target: 24,
    w: 8.759824,
    x: 9.740176,
    y: 9,
  },
  {
    angle: 0,
    cat: 'shared',
    doors: [
      {
        at: [5.65, 0],
        flip: false,
        hinge: true,
        id: 'dmu41mdvxyou6',
        type: 'door',
        w: 0.9,
      },
      {
        at: [0, 0.74],
        flip: false,
        hinge: false,
        id: 'dmu41mkp6ha7x',
        type: 'door',
        w: 0.9,
      },
    ],
    h: 3.43,
    id: 'r8',
    kind: 'kitchen',
    labelAt: [4.756795, 2.280974],
    lost: {
      h: 0.23,
      w: 2,
    },
    name: 'Kitchen',
    pieces: [
      [
        [3, 1.48],
        [0, 1.48],
        [0, 0],
      ],
      [
        [3, 1.48],
        [0, 0],
        [6.25, 0],
      ],
      [
        [3, 3.43],
        [3, 1.48],
        [6.25, 0],
      ],
      [
        [6.25, 0],
        [6.25, 3.43],
        [3, 3.43],
      ],
    ],
    placed: true,
    placedAt: 1,
    target: 21,
    w: 6.25,
    x: 1.5,
    y: 16.37,
  },
  {
    angle: 0,
    cat: 'service',
    doors: [
      {
        at: [0.6, 3.5],
        flip: false,
        hinge: true,
        id: 'dmu3yq1lt207l',
        type: 'door',
        w: 0.9,
      },
    ],
    h: 3.5,
    id: 'r10',
    kind: 'guest-wc',
    lost: {
      h: 0,
      w: 0,
    },
    name: 'Guest WC',
    pieces: null,
    placed: true,
    placedAt: 38,
    target: 3,
    w: 3.64,
    x: 7.75,
    y: 3.5,
  },
  {
    angle: 0,
    cat: 'service',
    doors: [
      {
        at: [2.618213, 3.4],
        flip: false,
        hinge: true,
        id: 'dmu41ogbkbr3g',
        type: 'door',
        w: 0.9,
      },
      {
        at: [3.1, 2],
        flip: true,
        hinge: true,
        id: 'dmu42c7rvrhps',
        type: 'door',
        w: 0.9,
      },
    ],
    h: 4,
    id: 'r11',
    kind: 'maid-room',
    lost: {
      h: 0.14,
      w: 1.45,
    },
    name: 'Maid Room',
    pieces: null,
    placed: true,
    placedAt: 7,
    target: 12,
    w: 3.1,
    x: 0,
    y: 12.37,
  },
  {
    angle: 0,
    cat: 'service',
    h: 2.5,
    id: 'r12',
    kind: 'maid-bathroom',
    lost: {
      h: 0.05,
      w: 2.55,
    },
    name: 'Maid Bath',
    pieces: null,
    placed: true,
    placedAt: 8,
    target: 4.5,
    w: 2.25,
    x: 3.1,
    y: 12.37,
  },
  {
    angle: 0,
    cat: 'service',
    doors: [
      {
        at: [0, 2.5],
        flip: false,
        hinge: false,
        id: 'dmu41n3gsjgzq',
        type: 'door',
        w: 0.9,
      },
      {
        at: [2.4, 1.8],
        flip: true,
        hinge: true,
        id: 'dmu41y3dzm6jg',
        type: 'door',
        w: 0.9,
      },
    ],
    h: 3.2,
    id: 'r13',
    kind: 'driver-room',
    labelAt: [4.56679, 1.076883],
    lost: {
      h: 0,
      w: 0,
    },
    name: 'Driver Room',
    pieces: [
      [
        [3, 1.8],
        [3, 0],
        [6.25, 0],
      ],
      [
        [3, 1.8],
        [6.25, 0],
        [6.25, 3.2],
      ],
      [
        [0, 1.8],
        [3, 1.8],
        [6.25, 3.2],
      ],
      [
        [6.25, 3.2],
        [0, 3.2],
        [0, 1.8],
      ],
    ],
    placed: true,
    placedAt: 196,
    target: 12,
    w: 6.25,
    x: 1.5,
    y: 19.8,
  },
  {
    angle: 0,
    cat: 'service',
    h: 1.8,
    id: 'r14',
    kind: 'driver-bathroom',
    lost: {
      h: 0,
      w: 0.35,
    },
    name: 'Driver Bath',
    pieces: null,
    placed: true,
    placedAt: 210,
    target: 4.5,
    w: 3,
    x: 1.5,
    y: 19.8,
  },
  {
    angle: 0,
    cat: 'service',
    doors: [
      {
        at: [2.4, 0],
        flip: false,
        hinge: true,
        id: 'dmu41y1pit73w',
        type: 'door',
        w: 0.9,
      },
    ],
    h: 1.95,
    id: 'r15',
    kind: 'storage',
    lost: {
      h: 0.05,
      w: 0,
    },
    name: 'Store',
    pieces: null,
    placed: true,
    placedAt: 211,
    target: 6,
    w: 3,
    x: 1.5,
    y: 17.85,
  },
  {
    angle: 0,
    cat: 'circulation',
    doors: [
      {
        at: [1.294091, 9.577081],
        flip: true,
        hinge: false,
        id: 'dmu41ked5cml0',
        type: 'street2',
        w: 2,
      },
      {
        at: [2, 3.711908],
        flip: false,
        hinge: false,
        id: 'dmu41uupye9yl',
        type: 'sliding',
        w: 2.5,
      },
    ],
    h: 9.577081,
    id: 'r16',
    kind: 'hallway',
    labelAt: [1.104204, 3.774213],
    lost: {
      h: 3.222919,
      w: 0.443109,
    },
    name: 'Ground Hallway',
    pieces: [
      [
        [2, 5.419221],
        [3.964435, 6.337757],
        [2.453914, 9.577081],
      ],
      [
        [2, 5.419221],
        [2.453914, 9.577081],
        [0, 9.577081],
      ],
      [
        [2, 2],
        [2, 5.419221],
        [0, 9.577081],
      ],
      [
        [2, 2],
        [0, 9.577081],
        [0, 0],
      ],
      [
        [2, 2],
        [0, 0],
        [3.649824, 0],
      ],
      [
        [3.649824, 0],
        [3.649824, 2],
        [2, 2],
      ],
    ],
    placed: true,
    placedAt: 1,
    target: 24,
    w: 3.964435,
    x: 7.740176,
    y: 7,
  },
  {
    angle: 0,
    cat: 'service',
    doors: [
      {
        at: [1.8, 2.5],
        flip: false,
        hinge: false,
        id: 'dmu41rcx3prtn',
        type: 'door',
        w: 0.9,
      },
    ],
    h: 2.5,
    id: 'nmu3xhurkamdb',
    kind: 'laundry',
    lost: {
      h: 0,
      w: 0.6,
    },
    name: 'laundry',
    pieces: null,
    placed: true,
    placedAt: 10,
    target: 6,
    w: 2.4,
    x: 5.35,
    y: 12.37,
  },
  {
    angle: 0,
    cat: 'circulation',
    doors: [
      {
        at: [4.65, 0.75],
        flip: false,
        hinge: false,
        id: 'dmu42micq75ps',
        type: 'opening',
        w: 1.2,
      },
    ],
    h: 1.5,
    id: 'nmu3y9058w92y',
    kind: 'hallway',
    lost: {
      h: 0,
      w: 0.15,
    },
    name: 'service hallway',
    pieces: null,
    placed: true,
    placedAt: 9,
    target: 6,
    w: 4.65,
    x: 3.1,
    y: 14.87,
  },
  {
    angle: 0,
    cat: 'private',
    h: 3.29,
    id: 'nmu436pzls0vk',
    kind: 'bedroom',
    name: 'Bedroom',
    pieces: null,
    placed: false,
    target: 14,
    w: 4.25,
    x: 0,
    y: 0,
  },
]

/**
 * Rooms saved in pieces are put back together as they load. One left in so many pieces that keeping
 * the largest would lose a third of it was never a room any more: it comes back whole, at its target
 * size, where its largest part stood.
 */
export function repair(rooms: Room[], settings: Settings): Room[] {
  const out: Room[] = []
  for (const room of rooms) {
    if (!room.placed || !(room.pieces && room.pieces.length)) {
      out.push(room)
      continue
    }
    const was = areaOf(room)
    const cx = room.x + room.w / 2
    const cy = room.y + room.h / 2
    const kept = canonicalise(room)
    if (!kept) continue
    if (areaOf(kept) >= was * 0.67) {
      out.push(kept)
      continue
    }
    const s = sizeFor(kept.kind, kept.target, settings)
    kept.pieces = null
    kept.lost = null
    kept.w = s.w
    kept.h = s.h
    kept.x = r2(cx - s.w / 2)
    kept.y = r2(cy - s.h / 2)
    out.push(kept)
  }
  return out
}

/** The sample sheet, ready to work on: the embedded rooms with their defaults filled and repaired. */
export function sampleSheet(settings: Partial<Settings> = {}): Sheet {
  const sheet = sheetOf([], settings)
  const rooms = EMBEDDED_ROOMS.map(
    (r): Room => JSON.parse(JSON.stringify({ angle: 0, pieces: null, ...r })) as Room,
  )
  sheet.rooms = repair(rooms, sheet.settings)
  return sheet
}
