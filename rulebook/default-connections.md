# Default connections

The connections a Kuwaiti villa is expected to have, one row per pair
of room kinds. The tool never draws these by itself: it proposes each
one the project's rooms imply, and a person accepts it with a click.
That is `MODEL.md`'s rule — the tool may propose an edge; a person
accepts it — applied to the rulebook rather than to touching
footprints.

**Status.** Drafted by the cofounder from the room-type table, the
force list and the shape of a Kuwaiti villa. Every row is
`provisional` and the source column says why it is here, so under
decision 9 none of it is ever a hard problem. The owner corrects the
table as projects show.

**Kinds.** *From kind* and *To kind* are ids from `room-types.md`, or
`EXTERIOR`, the outside, which is never a room. *Kind of edge* is
`door`, `open` (one space flows into the next) or `main-door` (the
front door, of which a project has exactly one).

**Pairing** says how a row picks rooms when a project holds several of
a kind:

- **`each`** — every room of the from-kind to every room of the
  to-kind. This is how a hub behaves: one hallway, four bedrooms, four
  proposals.
- **`one`** — one to one. Walking `project.rooms` in the order the
  rooms were added, each room of the to-kind takes the nearest room of
  the from-kind before it in that order that this row has not already
  taken; a room of the to-kind is taken by one row only, rows in the
  order of this table. That is how `defaultProgram` lays a suite out —
  the bedroom, then its own ensuite — so the third ensuite belongs to
  the third bedroom and to no other. Both kinds of a `one` row are
  rooms; `EXTERIOR` never pairs this way.

**The privacy gradient.** U2 wants a door only between adjacent tiers.
Three rows cross a tier boundary anyway (D6, D14, D18); each says in
its source why the crossing is the one a villa actually makes.

**The front door.** A `main-door` is proposed only while the project
has none, and only once, because `MODEL.md` allows a project exactly
one.

## The table

| Id | From kind | To kind | Kind of edge | Pairing | Source | Confidence |
|---|---|---|---|---|---|---|
| D1 | EXTERIOR | entry-foyer | main-door | each | The front door. The entry is a circulation kind, which is what a front door may open onto. | provisional |
| D2 | EXTERIOR | diwaniya | door | each | U1: the diwaniya receives guests without them entering the house, so it keeps its own street door. | provisional |
| D3 | EXTERIOR | garage | door | each | S2: the garage stands at the kerb with the shortest driveway, so every bay opens to the street. | provisional |
| D4 | EXTERIOR | service-entrance | door | each | S6 and U7: deliveries and staff arrive at a side door, never the family's. | provisional |
| D5 | entry-foyer | formal-living | door | each | U10: formal living receives the guests the household invites in, from the entry. | provisional |
| D6 | entry-foyer | family-living | door | each | U4: family living is the hub, reached from the family entrance. Public to private in one step, which U2 would not have; the entry is the threshold the household crosses at, and U2 is a force, not a wall. | provisional |
| D7 | entry-foyer | guest-wc | door | one | U9: guests find the WC from the entry, never through a private room. | provisional |
| D8 | entry-foyer | stair | door | each | U11 with the room-type table: the stair is a circulation kind a front door may open onto. | provisional |
| D9 | entry-foyer | hallway | open | each | Circulation to circulation: the foyer widens into the corridor that serves the house. | provisional |
| D10 | womens-reception | entry-foyer | door | each | U10: the women's reception receives from the entry, away from family living. | provisional |
| D11 | diwaniya | diwaniya-wc | door | one | U1 with the auxiliary flag: the diwaniya's WC is entered from the diwaniya and from nowhere else. | provisional |
| D12 | kitchen | dining-room | door | each | U3: the kitchen serves the dining room, sharing a wall with a door. | provisional |
| D13 | kitchen | prep-kitchen | door | one | The prep kitchen is the kitchen's back room and is entered from it. | provisional |
| D14 | kitchen | service-entrance | door | each | U7 and S6: goods reach the kitchen through the service entrance, not through the family's rooms. Semi-public to private, allowed because the service entrance is the threshold the service run crosses at. | provisional |
| D15 | kitchen | laundry | door | each | U7: the laundry stands on the service run beside the kitchen. | provisional |
| D16 | laundry | maid-room | door | one | U7: staff near their work. The maid's room is reached off the service run, so the household never passes through it. | provisional |
| D17 | maid-room | maid-bathroom | door | one | The auxiliary flag: the maid's bathroom is entered from her room. | provisional |
| D18 | dining-room | family-living | open | each | U4: the household eats beside where it lives, one space flowing into the next. Semi-public to private, the gentlest crossing the tiers allow. | provisional |
| D19 | master-bedroom | ensuite-bathroom | door | one | U6 suite integrity: the ensuite shares a wall with its own bedroom, door between. | provisional |
| D20 | master-bedroom | dressing-room | door | one | U6 suite integrity: the dressing room belongs to its own bedroom. | provisional |
| D21 | bedroom | ensuite-bathroom | door | one | U6 suite integrity: the ensuite shares a wall with its own bedroom, door between. | provisional |
| D22 | bedroom | dressing-room | door | one | U6 suite integrity: the dressing room belongs to its own bedroom. | provisional |
| D23 | hallway | master-bedroom | door | each | U2 and U5: a bedroom is reached from the corridor, never through another bedroom. | provisional |
| D24 | hallway | bedroom | door | each | U2 and U5: a bedroom is reached from the corridor, never through another bedroom. | provisional |
| D25 | hallway | bathroom | door | each | A shared bathroom is reached from the corridor, so no one room owns it. | provisional |
| D26 | hallway | stair | open | each | U11: the stair stands on the corridor it serves, open to it. | provisional |
| D27 | driver-room | driver-bathroom | door | one | The auxiliary flag: the driver's bathroom is entered from his room. | provisional |
| D28 | driver-room | garage | door | each | U8: the driver is by the cars, with his own door. | provisional |

## What the table does not say yet

The office, the prayer room, the storage, the courtyard, the lift and
the roof annex have no row: where they sit varies by house, and a
wrong default costs more than a missing one. Nothing here is proposed
across storeys except where a stair spans them, because the graph's
own rule is that an edge joins two rooms sharing a storey or a stair
with a room on any storey it spans.

## Least certain

D6 and D14 are the two gradient crossings that a hallway would remove
if `defaultProgram` laid one out; revisit both when it does. D12 may
want to be `open` in the houses the firm actually builds, and D25 is a
guess about a villa with a shared bathroom, which is not the common
case here.
