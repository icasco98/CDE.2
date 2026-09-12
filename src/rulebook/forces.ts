import type { Family, Site } from '../model'
import type { Point } from '../geometry'
import { nearestOn, type PlotSide, type PlotSides } from './sides'

/*
 * The `owner` rows of rulebook/forces.md, which stays the text a person reads, with the coordinates
 * they act on. S3 is dropped and is not here; S7, the service entrance, is a wall and lives with
 * the walls; the environmental rows wait for milestone 3. S4 and S5 are the client's answers on
 * the project, so they read `Site` and pull only when it says so.
 */

/** The three strengths forces.md admits, read as numbers before the family weight multiplies them. */
export const weak = 0.3
export const medium = 0.6
export const strong = 0.9

/** A room as a force reads one: the kind the table names, and the tier the gradient reads. */
export type ForceRoom = { readonly kind: string; readonly tier?: string }

/** What a force is told about the floor it acts on besides the room it acts on. */
export type ForceField = {
  readonly sides: PlotSides
  readonly site: Site
  /** Where the rooms of these kinds stand on this floor, as one point; nothing when it holds none. */
  readonly where: (kinds: readonly string[]) => Point | undefined
}

export type Force = {
  readonly id: string
  readonly family: Family
  readonly strength: number
  /** The row's own words, for the sentence a link that cannot close says about what holds it. */
  readonly statement: string
  readonly acts: (room: ForceRoom) => boolean
  /** Which way the row pulls a room standing here, as a unit vector; no length is no pull. */
  readonly pull: (room: ForceRoom, at: Point, field: ForceField) => Point
}

const nowhere: Point = [0, 0]

function unit(x: number, y: number): Point {
  const run = Math.hypot(x, y)
  return run < 1e-9 ? nowhere : [x / run, y / run]
}

/** The two vectors together, as one direction: a row that pulls two ways pulls between them. */
function both(one: Point, other: Point): Point {
  return unit(one[0] + other[0], one[1] + other[1])
}

function toward(at: Point, target: Point): Point {
  return unit(target[0] - at[0], target[1] - at[1])
}

function towardSide(at: Point, side: PlotSide | undefined): Point {
  return side ? toward(at, nearestOn(side, at[0], at[1])) : nowhere
}

/** The side of the floor, street or not, whose line is nearest to where the room stands. */
function nearestSide(at: Point, sides: readonly PlotSide[]): PlotSide | undefined {
  let nearest: PlotSide | undefined
  let away = Infinity
  for (const side of sides) {
    const point = nearestOn(side, at[0], at[1])
    const distance = Math.hypot(point[0] - at[0], point[1] - at[1])
    if (distance >= away) continue
    away = distance
    nearest = side
  }
  return nearest
}

function awayFromKinds(at: Point, kinds: readonly string[], field: ForceField): Point {
  const other = field.where(kinds)
  return other ? toward(other, at) : nowhere
}

function towardKinds(at: Point, kinds: readonly string[], field: ForceField): Point {
  const other = field.where(kinds)
  return other ? toward(at, other) : nowhere
}

/**
 * How far from its street a room the band holds may stand, in its own radii. The owner's ruling on
 * S1 is exact, and it is a wall as much as a pull: the diwaniya may stand at most one room's depth
 * back from the kerb, and its own door is on the kerb. One room's depth back is a near rim a whole
 * diameter from the line, which is a middle three radii from it — so the room sits inside the first
 * two room-depths of the plot, and never behind the garage. S1 goes on pulling it to the street
 * inside that band; the band is only the furthest back the pull may ever leave it.
 */
export const BAND_RADII = 3

/** The street a kind is held in the band of, where its kind is held in one at all. */
export function bandFor(kind: string, sides: PlotSides): PlotSide | undefined {
  return kind === 'diwaniya' ? sides.service : undefined
}

const isKind =
  (...kinds: readonly string[]) =>
  (room: ForceRoom): boolean =>
    kinds.includes(room.kind)

const bedrooms = ['master-bedroom', 'bedroom']
const serviceRooms = ['laundry', 'storage', 'maid-room']

/**
 * Every force with coordinates, in the order forces.md lists them. The strengths are here and
 * nowhere else in the tool; the family weight the person sets multiplies them at the frame.
 */
export const forces: readonly Force[] = [
  {
    id: 'S1',
    family: 'siteConstraints',
    strength: strong,
    statement: 'S1: the diwaniya stands on the service street with its own door.',
    acts: isKind('diwaniya'),
    // A pull, and a band: the room may stand up to one room's depth back behind its own court and
    // no further — `BAND_RADII` above is the ruling, held every round the way a wall is held — and
    // its street door is drawn on the kerb at the nearest point whatever it does inside that.
    pull: (_room, at, field) => towardSide(at, field.sides.service),
  },
  {
    id: 'S2',
    family: 'siteConstraints',
    strength: strong,
    statement: 'S2: a garage bay stands at the kerb, toward the nearer side boundary.',
    acts: isKind('garage'),
    // The kerb itself is a wall, so this row only chooses where along the frontage a bay goes.
    pull: (_room, at, field) => {
      const front = field.sides.service
      if (!front) return nowhere
      const toStart = Math.hypot(front.from[0] - at[0], front.from[1] - at[1])
      const toEnd = Math.hypot(front.to[0] - at[0], front.to[1] - at[1])
      return toward(at, toStart <= toEnd ? front.from : front.to)
    },
  },
  {
    id: 'S4',
    family: 'siteConstraints',
    strength: medium,
    statement: 'S4: the diwaniya addresses the corner where the two streets meet.',
    acts: isKind('diwaniya'),
    pull: (_room, at, field) =>
      field.site.diwaniyaAtCorner && field.sides.corner ? toward(at, field.sides.corner) : nowhere,
  },
  {
    id: 'S5',
    family: 'siteConstraints',
    strength: medium,
    statement: 'S5: the garden lies away from the service street, or on a side.',
    acts: isKind('courtyard', 'family-living'),
    pull: (_room, at, field) => {
      if (field.site.garden === 'none') return nowhere
      const wanted =
        field.site.garden === 'rear' ? field.sides.back : nearestSide(at, field.sides.sides)
      return towardSide(at, wanted)
    },
  },
  {
    id: 'S6',
    family: 'siteConstraints',
    strength: medium,
    statement: 'S6: the service rooms stand on a side boundary, not on the frontage.',
    acts: isKind(...serviceRooms),
    pull: (_room, at, field) => towardSide(at, nearestSide(at, field.sides.sides)),
  },
  {
    id: 'S8',
    family: 'siteConstraints',
    strength: strong,
    statement: 'S8: the kitchen and the service rooms are never on the frontage.',
    acts: isKind('kitchen', ...serviceRooms),
    pull: (_room, at, field) => {
      const front = field.sides.service
      return front ? toward(nearestOn(front, at[0], at[1]), at) : nowhere
    },
  },
  {
    id: 'U1',
    family: 'userRequirements',
    strength: strong,
    statement:
      'U1: the diwaniya receives guests away from the family living room and the bedrooms.',
    acts: isKind('diwaniya', 'diwaniya-wc'),
    pull: (_room, at, field) => awayFromKinds(at, ['family-living', ...bedrooms], field),
  },
  {
    id: 'U2',
    family: 'userRequirements',
    strength: strong,
    statement: 'U2: the privacy gradient runs from the street to the back of the plot.',
    // Every room the table gives a tier; an exempt kind stands outside the gradient altogether.
    acts: (room) =>
      room.tier === 'public' || room.tier === 'semi-public' || room.tier === 'private',
    // A link always wins over the gradient: a link's pull grows with how far the pair is apart
    // while this one never does, so a stretched link outpulls it at any distance that matters.
    pull: (room, at, field) => {
      const front = field.sides.service
      const back = field.sides.back
      if (room.tier === 'public') return towardSide(at, front)
      if (room.tier === 'private') return towardSide(at, back)
      if (!front || !back) return nowhere
      const onFront = nearestOn(front, at[0], at[1])
      const onBack = nearestOn(back, at[0], at[1])
      return toward(at, [(onFront[0] + onBack[0]) / 2, (onFront[1] + onBack[1]) / 2])
    },
  },
  {
    id: 'U5',
    family: 'userRequirements',
    strength: strong,
    statement:
      'U5: a bedroom is quiet, away from the diwaniya, the formal living room, the kitchen and the street.',
    acts: isKind(...bedrooms),
    pull: (_room, at, field) => {
      const rooms = awayFromKinds(at, ['diwaniya', 'formal-living', 'kitchen'], field)
      const front = field.sides.service
      const street = front ? toward(nearestOn(front, at[0], at[1]), at) : nowhere
      return both(rooms, street)
    },
  },
  {
    id: 'U9',
    family: 'userRequirements',
    strength: medium,
    statement: 'U9: guests find the WC from the formal living room and the entry.',
    acts: isKind('guest-wc'),
    pull: (_room, at, field) => towardKinds(at, ['formal-living', 'entry-foyer'], field),
  },
  {
    id: 'U10',
    family: 'userRequirements',
    strength: medium,
    statement: 'U10: formal living receives from the entry, away from the family living room.',
    acts: isKind('formal-living', 'womens-reception'),
    pull: (_room, at, field) =>
      both(towardKinds(at, ['entry-foyer'], field), awayFromKinds(at, ['family-living'], field)),
  },
]

/** The forces that act on a room, so a picture can say which row is holding it where it is. */
export function forcesOn(room: ForceRoom): readonly Force[] {
  return forces.filter((force) => force.acts(room))
}
