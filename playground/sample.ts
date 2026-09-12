import { createIdGenerator, createStore, EXTERIOR, type Store } from '../src/model'

type Seed = {
  readonly name: string
  readonly type: string
  readonly area: number
  readonly storey: number
  readonly spans?: number
}

const program: readonly Seed[] = [
  { name: 'Entry', type: 'entry', area: 10, storey: 0 },
  { name: 'Diwaniya', type: 'diwaniya', area: 55, storey: 0 },
  { name: 'Diwaniya WC', type: 'diwaniya-wc', area: 5, storey: 0 },
  { name: 'Formal Living', type: 'formal-living', area: 36, storey: 0 },
  { name: 'Family Living', type: 'family-living', area: 42, storey: 0 },
  { name: 'Kitchen', type: 'kitchen', area: 20, storey: 0 },
  { name: 'Dining', type: 'dining', area: 24, storey: 0 },
  { name: 'Stair', type: 'stair', area: 12, storey: 0, spans: 2 },
  { name: 'Master Bedroom', type: 'master-bedroom', area: 30, storey: 1 },
  { name: 'Bedroom', type: 'bedroom', area: 18, storey: 1 },
  { name: 'Second Bedroom', type: 'bedroom', area: 18, storey: 1 },
  { name: 'Family Bath', type: 'bathroom', area: 6, storey: 1 },
]

const wanted: readonly (readonly [string, string])[] = [
  ['Entry', 'Diwaniya'],
  ['Entry', 'Formal Living'],
  ['Entry', 'Family Living'],
  ['Entry', 'Stair'],
  ['Diwaniya', 'Diwaniya WC'],
  ['Family Living', 'Dining'],
  ['Dining', 'Kitchen'],
  ['Stair', 'Master Bedroom'],
  ['Stair', 'Bedroom'],
  ['Stair', 'Second Bedroom'],
  ['Bedroom', 'Family Bath'],
]

const categories: Readonly<Record<string, string>> = {
  entry: 'shared',
  diwaniya: 'reception',
  'diwaniya-wc': 'service',
  'formal-living': 'shared',
  'family-living': 'shared',
  kitchen: 'service',
  dining: 'shared',
  stair: 'shared',
  'master-bedroom': 'private',
  bedroom: 'private',
  bathroom: 'service',
}

export function categoryOf(type: string): string | undefined {
  return categories[type]
}

/** A fixed seed, so the sample program and its ids are the same on every load. */
export function sampleStore(): Store {
  const store = createStore(undefined, { newId: createIdGenerator(20260910) })
  const { actions } = store
  actions.addStorey()
  actions.setPlot({
    on: true,
    polygon: [
      [0, 0],
      [20, 0],
      [20, 25],
      [0, 25],
    ],
    north: 0,
    street: [0],
  })
  const ids = new Map<string, string>()
  for (const room of program) {
    const added = actions.addRoom({
      name: room.name,
      type: room.type,
      targetArea: room.area,
      storey: room.storey,
      storeysSpanned: room.spans ?? 1,
    })
    if (added.ok) ids.set(room.name, added.value)
  }
  for (const [a, b] of wanted) {
    const from = ids.get(a)
    const to = ids.get(b)
    if (from && to) actions.connect({ a: from, b: to, kind: 'door' })
  }
  // The front door, so the sample has the one link that runs off the bubbles to the street.
  const entry = ids.get('Entry')
  if (entry) actions.connect({ a: EXTERIOR, b: entry, kind: 'main-door' })
  return store
}
