# Forces

The three families are the three pulls on every layout: **user
requirements** (who lives here and how), **site constraints** (the
plot, its streets and neighbours), **environmental factors** (sun,
heat, wind). Each family is one weight on screen. Every concrete force
below belongs to one family, acts on named rooms, pulls in a stated
direction, and has a default strength for a Kuwaiti villa with a
source. Walls are not here: setbacks, ratios, heights and the client's
must-haves are in the Municipality entry and the project, and are
never traded.

**Status.** Drafted by the cofounder from the room-type table, the
Municipality entry, the climate entry and published sources. The owner's
first pass (O7, 12 Sep 2026) went through the user and site rows: a row
marked `owner` carries the owner's strength and stands until the known
house confirms or corrects it; `provisional` rows are still the
cofounder's judgement. Under decision 9 a provisional force only
recommends. Rows become `sourced` when the known house and the firm's
practice confirm them. The environmental rows wait for milestone 3.

**Walls beside the forces.** Under decision 20 the entry on the
frontage and the garage at the kerb are walls, not forces: the bubble
stands on the kerb line inside the setback and slides along it. The
diwaniya is a force (S1), strong, and may stand up to one room's depth
back behind its own court; its own street door stays on the kerb. The
service entrance (S7) is a wall on a side boundary near the kitchen.

**Two choices belong to the project, not the table.** Whether the
diwaniya addresses the corner of two streets (S4) and whether the garden
goes to the rear or a side (S5) are the client's to say on each
project, so they are inputs on the requirements screen, not fixed
forces; the table keeps the rows as the two defaults the input offers.

**Strength** is weak, medium or strong, read as 0.3, 0.6 or 0.9 before
the family weight multiplies it. **Acts on** names room kinds from
`room-types.md`.

## User requirements

| Id | Force | Acts on | Pulls toward | Strength | Source | Confidence |
|---|---|---|---|---|---|---|
| U1 | Guest separation | Diwaniya, Diwaniya WC | the street side, with its own entrance, away from Family Living and bedrooms | strong | Diwaniya as an institution with its own door (Al-Razouki; UNESCO inscription) | owner |
| U2 | Privacy gradient | every room with a tier | public rooms toward the street, private toward the back, a door only between adjacent tiers; a link always wins over the gradient | strong | threshold-zone principle in Arab domestic architecture; room-type tiers; owner | owner |
| U3 | Kitchen serves dining | Kitchen, Dining Room | sharing a wall with a door | strong | adjacency-matrix practice; firm practice | provisional |
| U4 | Family living is the hub | Family Living | short routes to bedrooms, kitchen and the family entrance | medium | firm practice | provisional |
| U5 | Bedrooms are quiet | Master Bedroom, Bedroom | away from Diwaniya, Formal Living, Kitchen and the street | strong | room-type tiers; firm practice | owner |
| U6 | Suite integrity | Ensuite Bathroom, Dressing Room | sharing a wall with their own bedroom, door between | strong | room-type auxiliary flag | provisional |
| U7 | Staff near their work | Maid Room, Maid Bathroom | Kitchen, Laundry and the Service Entrance | medium | firm practice; program of government-model houses | provisional |
| U8 | Driver by the cars | Driver Room, Driver Bathroom | the Garage and the street, with their own door | medium | firm practice | provisional |
| U9 | Guests find the WC | Guest WC | Formal Living and the Entry, never through a private room | medium | firm practice | owner |
| U10 | Formal living receives | Formal Living, Women's Reception | the Entry, away from Family Living | medium | firm practice | owner |
| U11 | Stair in the middle | Stair, Lift | the centroid of the rooms it serves on every storey | medium | walking-distance economy | provisional |
| U12 | Compactness | every room | fewer exterior corners, less envelope per m² of floor | medium | envelope cost per m²; MEW/R-6 intent | provisional |
| U13 | Budget | every room | target areas toward the low end of their range when the weight is high | weak | the project's budget band | provisional |

## Site constraints

| Id | Force | Acts on | Pulls toward | Strength | Source | Confidence |
|---|---|---|---|---|---|---|
| S1 | Diwaniya to the street | Diwaniya | the service street side, its own door on the kerb; the room may stand one room's depth back behind its own court | strong | Municipality definition of the service street; owner | owner |
| S2 | Garage at the kerb | Garage | the street boundary, shortest driveway, no room behind it (a wall under decision 20; the force only chooses where along the frontage) | strong | firm practice; owner | owner |
| S3 | Neighbour privacy | – | dropped by the owner: setbacks and the privacy gradient are enough | – | – | dropped |
| S4 | Corner plot | Diwaniya | the corner where two streets meet, addressing both, when the project says so | medium | firm practice; the client's choice per project | project choice |
| S5 | Garden to the rear | Courtyard, Family Living | the boundary away from the service street, or a side, as the project says | medium | firm practice; the client's choice per project | project choice |
| S6 | Service to the side | Laundry, Storage, Maid Room | a side boundary, not the street frontage | medium | firm practice; owner | owner |
| S7 | Service entrance on a side | Service Entrance | a side boundary near the Kitchen: a wall on the side street's kerb where there is one, else on the service street beside the Garage | strong | firm practice; owner | owner |
| S8 | Kitchen away from the street | Kitchen, Laundry, Maid Room, Storage | never on the frontage; a side or the rear | strong | firm practice; owner | owner |

## Environmental factors

| Id | Force | Acts on | Pulls toward | Strength | Source | Confidence |
|---|---|---|---|---|---|---|
| E1 | Living away from the west | Family Living, Formal Living, Diwaniya, Master Bedroom | facades facing north, north-east or east; away from west and south-west | strong | climate entry: west and south-west take the highest afternoon radiation in zone 0B | provisional |
| E2 | Buffer on the hot side | Garage, Storage, Laundry, Stair, Prep Kitchen | the west and south-west facades, as a thermal buffer for the rooms behind | medium | passive design for hot-arid climates | provisional |
| E3 | Compact envelope | every room | low surface-to-volume, small roof per m² | medium | MEW/R-6 roof and wall U-values make roof and wall area the cost | provisional |
| E4 | Shaded court | Courtyard | the north side of the tallest wing, shaded in the afternoon | medium | courtyard tradition; climate entry sun path | provisional |
| E5 | Morning light | Bedroom, Master Bedroom, Kitchen | east and north-east facades | weak | comfort preference; ASHRAE 55 band | provisional |
| E6 | Shelter from the shamal | Courtyard, Entry | away from the north-west, or screened on that side | weak | climate entry prevailing wind | provisional |

## How a force becomes a number

Each force is evaluated on a placed layout as a satisfaction from 0
(fully violated) to 1 (fully met), by a rule that names its measure: a
shared wall exists, an angle between a facade normal and a compass
direction, a distance between centroids, an envelope length. That
measure is what milestone 2 reports and what milestone 3 differentiates
to move a room. No force ever moves a pinned room or crosses a wall.

## Least certain

U4 is firm practice with no external source and not yet confirmed by
the owner; E5 and E6 are weak and may be dropped; U13 overlaps E3 and U12 and may merge into
one compactness force under the user family once a budget model
exists. The three families as the weights on screen replace the
placeholder sliders (client, climate, budget) on the requirements
screen; that is a proposed change, not yet made.
