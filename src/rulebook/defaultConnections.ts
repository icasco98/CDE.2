import { EXTERIOR, type EdgeKind } from '../model'

/** How a row picks rooms when a project holds several of a kind; the markdown's preamble states both. */
export type Pairing = 'each' | 'one'

export type DefaultConnection = {
  readonly id: string
  /** A room-type id, or EXTERIOR. */
  readonly from: string
  readonly to: string
  readonly kind: EdgeKind
  readonly pairing: Pairing
  /** Why the row is here, shown to the person as the proposal's own reason. */
  readonly source: string
  readonly confidence: 'provisional'
}

const provisional = 'provisional'

const suiteBathroom =
  'U6 suite integrity: the ensuite shares a wall with its own bedroom, door between.'
const suiteDressing = 'U6 suite integrity: the dressing room belongs to its own bedroom.'
const bedroomOffCorridor =
  'U2 and U5: a bedroom is reached from the corridor, never through another bedroom.'

/** Transcribed row for row from rulebook/default-connections.md, which stays the source a person reads. */
export const defaultConnections: readonly DefaultConnection[] = [
  {
    id: 'D1',
    from: EXTERIOR,
    to: 'entry-foyer',
    kind: 'main-door',
    pairing: 'each',
    source:
      'The front door. The entry is a circulation kind, which is what a front door may open onto.',
    confidence: provisional,
  },
  {
    id: 'D2',
    from: EXTERIOR,
    to: 'diwaniya',
    kind: 'door',
    pairing: 'each',
    source:
      'U1: the diwaniya receives guests without them entering the house, so it keeps its own street door.',
    confidence: provisional,
  },
  {
    id: 'D3',
    from: EXTERIOR,
    to: 'garage',
    kind: 'door',
    pairing: 'each',
    source:
      'S2: the garage stands at the kerb with the shortest driveway, so every bay opens to the street.',
    confidence: provisional,
  },
  {
    id: 'D4',
    from: EXTERIOR,
    to: 'service-entrance',
    kind: 'door',
    pairing: 'each',
    source: "S6 and U7: deliveries and staff arrive at a side door, never the family's.",
    confidence: provisional,
  },
  {
    id: 'D5',
    from: 'entry-foyer',
    to: 'formal-living',
    kind: 'door',
    pairing: 'each',
    source: 'U10: formal living receives the guests the household invites in, from the entry.',
    confidence: provisional,
  },
  {
    id: 'D6',
    from: 'entry-foyer',
    to: 'family-living',
    kind: 'door',
    pairing: 'each',
    source:
      'U4: family living is the hub, reached from the family entrance. Public to private in one step, which U2 would not have; the entry is the threshold the household crosses at, and U2 is a force, not a wall.',
    confidence: provisional,
  },
  {
    id: 'D7',
    from: 'entry-foyer',
    to: 'guest-wc',
    kind: 'door',
    pairing: 'one',
    source: 'U9: guests find the WC from the entry, never through a private room.',
    confidence: provisional,
  },
  {
    id: 'D8',
    from: 'entry-foyer',
    to: 'stair',
    kind: 'door',
    pairing: 'each',
    source:
      'U11 with the room-type table: the stair is a circulation kind a front door may open onto.',
    confidence: provisional,
  },
  {
    id: 'D9',
    from: 'entry-foyer',
    to: 'hallway',
    kind: 'open',
    pairing: 'each',
    source: 'Circulation to circulation: the foyer widens into the corridor that serves the house.',
    confidence: provisional,
  },
  {
    id: 'D10',
    from: 'womens-reception',
    to: 'entry-foyer',
    kind: 'door',
    pairing: 'each',
    source: "U10: the women's reception receives from the entry, away from family living.",
    confidence: provisional,
  },
  {
    id: 'D11',
    from: 'diwaniya',
    to: 'diwaniya-wc',
    kind: 'door',
    pairing: 'one',
    source:
      "U1 with the auxiliary flag: the diwaniya's WC is entered from the diwaniya and from nowhere else.",
    confidence: provisional,
  },
  {
    id: 'D12',
    from: 'kitchen',
    to: 'dining-room',
    kind: 'door',
    pairing: 'each',
    source: 'U3: the kitchen serves the dining room, sharing a wall with a door.',
    confidence: provisional,
  },
  {
    id: 'D13',
    from: 'kitchen',
    to: 'prep-kitchen',
    kind: 'door',
    pairing: 'one',
    source: "The prep kitchen is the kitchen's back room and is entered from it.",
    confidence: provisional,
  },
  {
    id: 'D14',
    from: 'kitchen',
    to: 'service-entrance',
    kind: 'door',
    pairing: 'each',
    source:
      "U7 and S6: goods reach the kitchen through the service entrance, not through the family's rooms. Semi-public to private, allowed because the service entrance is the threshold the service run crosses at.",
    confidence: provisional,
  },
  {
    id: 'D15',
    from: 'kitchen',
    to: 'laundry',
    kind: 'door',
    pairing: 'each',
    source: 'U7: the laundry stands on the service run beside the kitchen.',
    confidence: provisional,
  },
  {
    id: 'D16',
    from: 'laundry',
    to: 'maid-room',
    kind: 'door',
    pairing: 'one',
    source:
      "U7: staff near their work. The maid's room is reached off the service run, so the household never passes through it.",
    confidence: provisional,
  },
  {
    id: 'D17',
    from: 'maid-room',
    to: 'maid-bathroom',
    kind: 'door',
    pairing: 'one',
    source: "The auxiliary flag: the maid's bathroom is entered from her room.",
    confidence: provisional,
  },
  {
    id: 'D18',
    from: 'dining-room',
    to: 'family-living',
    kind: 'open',
    pairing: 'each',
    source:
      'U4: the household eats beside where it lives, one space flowing into the next. Semi-public to private, the gentlest crossing the tiers allow.',
    confidence: provisional,
  },
  {
    id: 'D19',
    from: 'master-bedroom',
    to: 'ensuite-bathroom',
    kind: 'door',
    pairing: 'one',
    source: suiteBathroom,
    confidence: provisional,
  },
  {
    id: 'D20',
    from: 'master-bedroom',
    to: 'dressing-room',
    kind: 'door',
    pairing: 'one',
    source: suiteDressing,
    confidence: provisional,
  },
  {
    id: 'D21',
    from: 'bedroom',
    to: 'ensuite-bathroom',
    kind: 'door',
    pairing: 'one',
    source: suiteBathroom,
    confidence: provisional,
  },
  {
    id: 'D22',
    from: 'bedroom',
    to: 'dressing-room',
    kind: 'door',
    pairing: 'one',
    source: suiteDressing,
    confidence: provisional,
  },
  {
    id: 'D23',
    from: 'hallway',
    to: 'master-bedroom',
    kind: 'door',
    pairing: 'each',
    source: bedroomOffCorridor,
    confidence: provisional,
  },
  {
    id: 'D24',
    from: 'hallway',
    to: 'bedroom',
    kind: 'door',
    pairing: 'each',
    source: bedroomOffCorridor,
    confidence: provisional,
  },
  {
    id: 'D25',
    from: 'hallway',
    to: 'bathroom',
    kind: 'door',
    pairing: 'each',
    source: 'A shared bathroom is reached from the corridor, so no one room owns it.',
    confidence: provisional,
  },
  {
    id: 'D26',
    from: 'hallway',
    to: 'stair',
    kind: 'open',
    pairing: 'each',
    source: 'U11: the stair stands on the corridor it serves, open to it.',
    confidence: provisional,
  },
  {
    id: 'D27',
    from: 'driver-room',
    to: 'driver-bathroom',
    kind: 'door',
    pairing: 'one',
    source: "The auxiliary flag: the driver's bathroom is entered from his room.",
    confidence: provisional,
  },
  {
    id: 'D28',
    from: 'driver-room',
    to: 'garage',
    kind: 'door',
    pairing: 'each',
    source: 'U8: the driver is by the cars, with his own door.',
    confidence: provisional,
  },
]

const byId: ReadonlyMap<string, DefaultConnection> = new Map(
  defaultConnections.map((row) => [row.id, row]),
)

/** Why the rulebook proposes this connection, for the person looking at the proposal. */
export function connectionSource(rowId: string): string {
  return byId.get(rowId)?.source ?? ''
}
