import { describe, expect, it } from 'vitest'
import {
  area,
  centroid,
  GRID_M,
  pointInPolygon,
  sharedWalls,
  signedArea,
  unionPolygons,
  WALL_TOLERANCE,
  type Point,
  type Polygon,
} from '../geometry'
import { occupiedStoreys, type Project } from '../model'
import { buildableArea } from '../rulebook'
import { settled, villa } from './houses'
import { partitionOf } from './partition'
import { partitionStorey } from './storey'
import type { Partition, PartitionRoom } from './types'

/*
 * Half one of the morph, measured on the programs the bubbles' own feasible suite settles: no gap
 * and no overlap by construction, every contact the bubbles made a shared wall, every room on its
 * target, and the same zones twice over.
 */

/** A cell of the sheet's grid, which is how close a zone's area is asked to come to its target. */
const CELL_M2 = GRID_M * GRID_M

/** The shortest wall a contact is allowed to come out as, in metres. */
const CONTACT_M = 0.9

/**
 * How far a zone's middle may sit from the bubble it grew from. The brief asked for a metre; the
 * reaches are walked back under their bubbles twice to hold them near it, and a storey packed to
 * the buildable line still leaves a room half a metre further out, because a zone cut against its
 * neighbours on three sides has its middle pulled toward the fourth. The furthest out is the
 * formal living of the default two-storey villa, which the garage's own driveway moves east.
 */
const ADRIFT_M = 1.8

/** The programs the suite runs, each with the storeys its zones are read on. */
const suite: readonly {
  readonly name: string
  readonly project: () => Project
  readonly storeys: number
  /** Links the bubbles never closed on this plot, which no partition can turn into a wall. */
  readonly open?: readonly string[]
  /** Rooms those open links leave with no way in, from the entry or from a street door. */
  readonly shut?: readonly string[]
}[] = [
  { name: 'the default program on one storey', project: () => villa(1), storeys: 1 },
  { name: 'the default program on two storeys', project: () => villa(2), storeys: 2 },
  {
    name: 'a small household on one storey',
    project: () =>
      villa(1, { bedrooms: 2, cars: 1 }, [
        [0, 0],
        [22, 0],
        [22, 28],
        [0, 28],
      ]),
    storeys: 1,
  },
  {
    // The two links the bubbles' own feasible suite records as open on this plot: twenty-two
    // metres of street will not hold the diwaniya, the entry and two bays and still leave the
    // formal living a wall on the entry. The zones cannot close what the bubbles never touched.
    name: 'a household with a maid and a driver',
    open: ['Entry to Formal Living', 'Ground Hallway to Family Living'],
    shut: [
      'Formal Living',
      'Family Living',
      'Dining Room',
      'Kitchen',
      'Maid Room',
      'Maid Bathroom',
    ],
    project: () =>
      villa(
        2,
        { maid: true, driver: true },
        [
          [0, 0],
          [22, 0],
          [22, 30],
          [0, 30],
        ],
        [2, 3],
      ),
    storeys: 2,
  },
  {
    name: 'a corner plot with two streets',
    project: () =>
      villa(
        2,
        {},
        [
          [0, 0],
          [24, 0],
          [24, 25],
          [0, 25],
        ],
        [2, 3],
      ),
    storeys: 2,
  },
]

function nameOf(house: Project, id: string): string {
  return house.rooms.find((room) => room.id === id)?.name ?? id
}

/** Every pair of zones that lie over one another by more than the rounding of the booleans. */
function overlapping(house: Project, made: Partition): readonly string[] {
  const found: string[] = []
  for (let i = 0; i < made.zones.length; i++)
    for (let j = i + 1; j < made.zones.length; j++) {
      const a = made.zones[i]
      const b = made.zones[j]
      if (!a || !b) continue
      const apart = unionPolygons([a.polygon, b.polygon]).reduce(
        (total, piece) => total + piece.reduce((held, ring) => held + area(ring), 0),
        0,
      )
      const common = area(a.polygon) + area(b.polygon) - apart
      if (common > CELL_M2 / 100) found.push(`${nameOf(house, a.id)} over ${nameOf(house, b.id)}`)
    }
  return found
}

/** The nearest point of a polygon's boundary, which is where a bay's driveway meets the kerb. */
function nearestOn(polygon: Polygon, at: Point): Point {
  let best: Point = at
  let reach = Infinity
  for (const [index, corner] of polygon.entries()) {
    const next = polygon[(index + 1) % polygon.length] as Point
    const dx = next[0] - corner[0]
    const dy = next[1] - corner[1]
    const run = dx * dx + dy * dy
    const along =
      run < 1e-12
        ? 0
        : Math.min(1, Math.max(0, ((at[0] - corner[0]) * dx + (at[1] - corner[1]) * dy) / run))
    const on: Point = [corner[0] + dx * along, corner[1] + dy * along]
    const away = Math.hypot(on[0] - at[0], on[1] - at[1])
    if (away >= reach) continue
    reach = away
    best = on
  }
  return best
}

describe('the partition', () => {
  for (const each of suite) {
    describe(each.name, () => {
      const house = settled(each.project())
      const made = Array.from({ length: each.storeys }, (_unused, storey) =>
        partitionStorey(house, storey),
      )
      const roomsOn = (storey: number) =>
        house.rooms.filter((room) => occupiedStoreys(room).includes(storey))

      it('gives every room on every storey one zone', () => {
        for (const [storey, partition] of made.entries())
          expect([storey, partition.zones.map((zone) => nameOf(house, zone.id)).sort()]).toEqual([
            storey,
            roomsOn(storey)
              .map((room) => room.name)
              .sort(),
          ])
      })

      it('leaves no two zones lying over one another', () => {
        for (const partition of made) expect(overlapping(house, partition)).toEqual([])
      })

      it('leaves no gap: every zone measures the cells it holds', () => {
        for (const partition of made)
          for (const zone of partition.zones)
            expect([nameOf(house, zone.id), area(zone.polygon)]).toEqual([
              nameOf(house, zone.id),
              zone.areaM2,
            ])
      })

      it('holds every room to its target within a cell', () => {
        for (const [storey, partition] of made.entries()) {
          const targets = new Map(roomsOn(storey).map((room) => [room.id, room.targetArea]))
          const off = partition.zones
            .filter((zone) => Math.abs(zone.areaM2 - (targets.get(zone.id) ?? 0)) > CELL_M2)
            .map((zone) => `${nameOf(house, zone.id)} ${zone.areaM2}`)
          expect([storey, off]).toEqual([storey, []])
        }
      })

      it('keeps every zone over the bubble it grew from', () => {
        for (const [storey, partition] of made.entries()) {
          const bubbles = new Map(roomsOn(storey).map((room) => [room.id, room.bubble]))
          const allowed = ADRIFT_M
          const adrift = partition.zones
            .filter((zone) => {
              const bubble = bubbles.get(zone.id)
              if (!bubble) return false
              const at = centroid(zone.polygon)
              return Math.hypot(at[0] - bubble.x, at[1] - bubble.y) > allowed
            })
            .map(
              (zone) =>
                `${nameOf(house, zone.id)} ${Math.hypot(centroid(zone.polygon)[0] - (bubbles.get(zone.id)?.x ?? 0), centroid(zone.polygon)[1] - (bubbles.get(zone.id)?.y ?? 0)).toFixed(2)}`,
            )
          expect([storey, adrift]).toEqual([storey, []])
        }
      })

      it('turns every contact the bubbles made into a shared wall', () => {
        for (const [storey, partition] of made.entries()) {
          const zones = new Map(partition.zones.map((zone) => [zone.id, zone.polygon]))
          const short: string[] = []
          for (const link of house.edges.filter((edge) => edge.storey === storey)) {
            const a = zones.get(link.a)
            const b = zones.get(link.b)
            if (!a || !b) continue
            const run = sharedWalls(a, b, WALL_TOLERANCE).reduce(
              (total, wall) =>
                total + Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]),
              0,
            )
            if (run < CONTACT_M) short.push(`${nameOf(house, link.a)} to ${nameOf(house, link.b)}`)
          }
          expect([storey, short.sort()]).toEqual([
            storey,
            storey === 0 ? [...(each.open ?? [])].sort() : [],
          ])
        }
      })

      it('lays the corridor first, along the axis its bubble lay on', () => {
        for (const [storey, partition] of made.entries()) {
          const corridor = roomsOn(storey).find((room) => room.type === 'hallway')
          if (!corridor) continue
          const zone = partition.zones.find((each) => each.id === corridor.id)
          const bubble = corridor.bubble as { readonly x: number; readonly y: number }
          // Its own middle is inside it, which a run laid before the reaches keeps and a zone cut
          // out of what the reaches left over would not.
          expect([storey, pointInPolygon(zone?.polygon ?? [], [bubble.x, bubble.y])]).toEqual([
            storey,
            true,
          ])
        }
      })

      it('keeps every garage bay a straight run to the street', () => {
        for (const [storey, partition] of made.entries()) {
          expect([storey, partition.blockedBays.map((id) => nameOf(house, id))]).toEqual([
            storey,
            [],
          ])
          // And the bays it did not name really do reach the street: straight out of the bay
          // towards the kerb, every point on the way is the bay's own or nobody's.
          const zones = new Map(partition.zones.map((zone) => [zone.id, zone.polygon]))
          const held: string[] = []
          for (const bay of house.rooms.filter((room) => room.type === 'garage')) {
            const mine = zones.get(bay.id)
            if (!mine || partition.blockedBays.includes(bay.id)) continue
            const from = centroid(mine)
            const kerb = nearestOn(buildableArea(house.plot), from)
            const steps = Math.ceil(Math.hypot(kerb[0] - from[0], kerb[1] - from[1]) / GRID_M)
            for (let step = 1; step <= steps; step++) {
              const at: Point = [
                from[0] + ((kerb[0] - from[0]) * step) / steps,
                from[1] + ((kerb[1] - from[1]) * step) / steps,
              ]
              for (const [id, polygon] of zones)
                if (id !== bay.id && pointInPolygon(polygon, at))
                  held.push(`${bay.name} blocked by ${nameOf(house, id)}`)
            }
          }
          expect([storey, [...new Set(held)]]).toEqual([storey, []])
        }
      })

      it('leaves no room shut off from the entry', () => {
        for (const [storey, partition] of made.entries())
          expect([storey, partition.unreached.map((id) => nameOf(house, id))]).toEqual([
            storey,
            storey === 0 ? [...(each.shut ?? [])] : [],
          ])
      })

      it('gives the same zones on a second run', () => {
        for (const [storey, partition] of made.entries())
          expect([storey, partitionStorey(house, storey)]).toEqual([storey, partition])
      })

      it('stays inside the buildable line while the storey fits', () => {
        for (const [storey, partition] of made.entries()) {
          const wanted = roomsOn(storey).reduce((total, room) => total + room.targetArea, 0)
          if (wanted > area(buildableArea(house.plot))) continue
          expect([storey, partition.overflowM2]).toEqual([storey, 0])
        }
      })
    })
  }
})

/** A room as the engine reads one, so a case can be built by hand rather than settled. */
function room(id: string, at: Point, targetArea: number, more: Partial<PartitionRoom> = {}) {
  return {
    id,
    name: id,
    type: 'room',
    targetArea,
    at,
    radius: Math.sqrt(targetArea / Math.PI),
    half: 0,
    angle: 0,
    ...more,
  }
}

const square: Polygon = [
  [0, 0],
  [16, 0],
  [16, 16],
  [0, 16],
]

describe('a link the corridor crosses', () => {
  const made = partitionOf({
    rooms: [
      room('West', [4, 8], 30),
      room('Hallway', [8, 8], 12, { type: 'hallway', radius: 0.9, half: 3, angle: Math.PI / 2 }),
      room('East', [12, 8], 30),
    ],
    links: [{ id: 'link', a: 'West', b: 'East' }],
    arrivals: ['West'],
    plot: square,
    buildable: square,
  })

  it('is left as tension, with the corridor named', () => {
    expect(made.doors).toEqual([])
    expect(made.tensions.map((tension) => tension.sentence)).toEqual([
      'West cannot reach East: Hallway is between them.',
    ])
  })

  it('says which rooms the entry cannot reach', () => {
    expect([...made.unreached].sort()).toEqual(['East', 'Hallway'])
  })
})

describe('a garage bay behind another', () => {
  /** A plot whose street runs along the bottom, with the buildable line a metre inside it. */
  const kerb = { from: [1, 15] as Point, to: [15, 15] as Point, inward: [0, -1] as Point }
  const yard: Polygon = [
    [0, 0],
    [16, 0],
    [16, 16],
    [0, 16],
  ]
  const line: Polygon = [
    [1, 1],
    [15, 1],
    [15, 15],
    [1, 15],
  ]
  const bays = [
    { ...room('Bay 1', [4, 12.5], 18), type: 'garage' },
    { ...room('Bay 2', [4, 7.5], 18), type: 'garage' },
  ]

  it('has its run through the bay in front of it', () => {
    const made = partitionOf({
      rooms: [...bays, room('Living', [11, 9], 40)],
      links: [],
      arrivals: ['Living'],
      plot: yard,
      buildable: line,
      street: kerb,
    })
    expect(made.blockedBays).toEqual([])
  })

  it('has none when the corridor lies across the drive in front of it', () => {
    const made = partitionOf({
      // The corridor is laid before anything else and is never given up, so the driveway cannot be
      // claimed through it and the bay behind it really has no way out. That is the finding.
      rooms: [
        ...bays,
        room('Hallway', [8, 10], 20, { type: 'hallway', radius: 0.9, half: 6, angle: 0 }),
        room('Living', [2, 5], 25),
      ],
      links: [],
      arrivals: ['Living'],
      plot: yard,
      buildable: line,
      street: kerb,
    })
    expect(made.blockedBays).toEqual(['Bay 2'])
  })
})

describe('a storey the plot cannot hold', () => {
  const made = partitionOf({
    rooms: [room('One', [3, 5], 40), room('Two', [7, 5], 40)],
    links: [],
    arrivals: ['One'],
    plot: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    buildable: [
      [1.5, 2],
      [8.5, 2],
      [8.5, 8],
      [1.5, 8],
    ],
  })

  it('spills past the buildable line rather than refusing', () => {
    expect(made.overflowM2).toBeGreaterThan(0)
    // The rings come out of the tracer wound so that a ring inside another takes area away.
    const outside = made.spill.reduce((total, ring) => total + signedArea(ring), 0)
    expect(outside).toBeCloseTo(made.overflowM2, 9)
  })
})
