# Core model

One principle: **the graph is the truth; geometry is a view of it.**
A house at the conceptual stage is a set of rooms and the connections
between them. Where the rooms sit on the sheet is how that graph is
being drawn right now, and it may be rough or missing. The checker
reads the graph. The canvas edits both. Nothing ever infers a
connection from where two walls happen to land.

## Entities (stored)

| Entity | Fields | Notes |
|---|---|---|
| **Project** | `id`, `name`, `storeys`, `heights[]`, `plot`, `household`, `rooms[]`, `edges[]`, `weights`, `actors[]`, `version` | One JSON document. Metres and m². `heights` is the floor-to-floor height of each storey in metres, one entry per storey, 3.5 unless the person changes it; the Municipality's 3 m clear minimum and 15 m maximum are walls in the rulebook, not limits on the field. |
| **Plot** | `on` (boolean: the boundary binds), `polygon`, `north` (degrees from up), `street` (which edges face a street) | `on` false: the plot is drawn for reference and constrains nothing. A rectangle today, any polygon later; same field either way. |
| **Room** | `id`, `name`, `type`, `storey`, `storeysSpanned`, `targetArea`, `bubble?`, `footprint?`, `pinned` | `type` keys the room-type table. `bubble` is `{x, y}` in plot metres, the same frame as a footprint, so a bubble and the zone it becomes are one point. `footprint` is `{polygon, rotation, arcs?}`: a rigid polygon in its own frame, turned about its centre, absent while unplaced. `arcs` remembers which runs of the polygon stand for true arcs (each with its centre, radius and direction in the polygon's frame) so a curved wall exports as an arc and its area is exact; the polygon stays what every calculation works on. A stair is a room with `storeysSpanned > 1`. `pinned` means the solver may not move it. |
| **Edge** | `id`, `a`, `b`, `kind`, `storey`, `hint?` | `a`/`b` are room ids, or the singleton `EXTERIOR`. `kind` is `door`, `open` (one space flows into the next) or `main-door` (exactly one per project, from `EXTERIOR`). `hint` is a wall position for drawing; losing it changes nothing. |
| **Household** | `familySize`, `bedrooms`, `cars`, `maid`, `driver`, `womensReception`, `masterOnGround` | Who the house is for. The room program is generated from it. `masterOnGround` keeps the master bedroom on the ground floor, a common Kuwaiti arrangement for parents. |
| **Weights** | one number per family of forces: user requirements, site constraints, environmental factors | The person's own priorities on this project. Always on screen. The forces inside each family and their default strengths are in the rulebook. |
| **Actor** | `id`, `name`, `role`, `waypoints[]` | Waypoints are room ids. Routes are derived. |

Invariants: an edge joins two rooms that share a storey, or a stair
with a room on any storey it spans. One edge per unordered pair per
storey. Deleting a room deletes its edges. `EXTERIOR` is never a room.
A room is placed (has a footprint) or unplaced, never half. Footprints
on one storey never overlap. Bubbles on one storey may overlap by up
to a quarter of the smaller one's area, never wholly.

## Reference tables (code, one copy each)

**Room types:** `label`, `minArea`, `typicalArea`, `aspect` range,
`category` (private, shared, service, reception), `tier` (public,
semi-public, private, or exempt), `passable`, `auxiliary`,
`circulation`, `defaultStorey` (ground, upper, any, all storeys, or
the top), `companion` (a kind added alongside this one, such as a
bedroom's ensuite). Area-based, so a room's shape is the drawer's
choice.

**Rulebook:** every rule is a wall or a force (below), with `id`,
`statement`, `appliesTo`, `source`, `confidence` (`sourced` or
`provisional`). A provisional rule can only ever recommend.

## Walls and forces

Every factor the tool knows is one of two kinds, never both.

- **A wall** is a hard constraint: a setback, a plot ratio, a height
  limit, a room the client will not cut, a span the structure cannot
  make. Walls carve the feasible region and are never traded.
- **A force** is a soft preference: orientation, compactness, the
  privacy gradient, the diwaniya to the street, budget pressure. A
  force has a name, the element it acts on, a direction, a magnitude,
  a source, and a default strength for Kuwait stated with evidence.
  The person can change the weight. Every force is drawable as a
  vector on a drawable element, so an animation of the solver is the
  computation, not a picture of it.

A layout is ranked by how the forces balance inside the walls. An
equilibrium is local, so several typologies are settled and shown side
by side. The tool never presents one answer.

## The four stages, one graph

1. **Requirements.** Rooms with target areas, the household, the plot
   with north and street sides, budget, weights.
2. **Bubbles.** Circles of true area on the plot, one plot per storey,
   under springs (wanted adjacency), soft repulsion (overlap up to a
   quarter, never wholly), the site and environmental forces on the
   plot's coordinates, and the buildable line as a wall. A hallway is
   an ellipse along the rooms it serves. Damped, deterministic for the
   same input, pinnable. If a storey's areas cannot fit its buildable
   area, it says so here and on the Requirements totals.
3. **Zoning.** The bubbles inflated in place into footprints of the
   same area, offered as a proposal to accept or send back, spilling
   past the buildable line rather than refused; then rooms dragged,
   rotated, reshaped and carved by hand; an unrealised edge shown as
   tension between two rooms.
4. **Massing.** The same graph stood up: storeys, heights, envelope as
   the union of rooms, drawn in parallel projection with its numbers
   (floor area, envelope, roof, volume) beside it.

Each stage adds constraints. None changes the graph.

## Derived (computed every time, never stored)

- **Findings** from the graph: reachability from `EXTERIOR`, tier
  skips, stair landings, rule violations. From geometry: only walls
  broken and forces unsatisfied, each with its rule, number, source,
  assumption and confidence.
- **Geometry consistency.** An edge whose two footprints do not share a
  wall is a warning on the drawing, never a change to the graph. A
  shared wall with no edge is nothing at all. Snapping is a canvas
  convenience and never creates or removes an edge.
- Footprint outline, coverage, routes, massing: views of the above.

## Operations

- **Draw, move, rotate, resize, carve** change footprints only, and
  pin the room touched until released.
- **Connect** and **disconnect** are the only ways edges come and go;
  an edge's `kind` may be changed in place and it stays the same edge.
  The tool may **propose** an edge when two rooms come to touch or the
  rulebook expects one; a person accepts it.
- **Settle** runs the solver on unpinned rooms. It is interruptible:
  grab a room and it pins, the rest continue.
- **Undo** covers rooms, edges, plot, storeys, heights, weights and
  household. The project's name, actors and camera are outside it.

## Persistence

Browser storage on every committed edit. Export and import as one JSON
file. Versioned, with a migration function per bump. No server.

## Not in the first milestone

The solver, findings, analysis, animation of settling, Python service,
IFC. The first milestone is the four stages by hand, autosave, project
file, PDF to scale and DXF.
