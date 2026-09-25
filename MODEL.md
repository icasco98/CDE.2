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
| **Project** | `id`, `name`, `storeys`, `heights[]`, `plot`, `household`, `rooms[]`, `edges[]`, `apart[]`, `declined[]`, `actors[]`, `version` | One JSON document. Metres and m². `heights` is the floor-to-floor height of each storey in metres, one entry per storey, 3.5 unless the person changes it; the Municipality's 3 m clear minimum and 15 m maximum are walls in the rulebook, not limits on the field. |
| **Plot** | `on` (boolean: the boundary binds), `polygon`, `north` (degrees from up), `street` (which edges face a street) | `on` false: the plot is drawn for reference and constrains nothing. A rectangle today, any polygon later; same field either way. |
| **Room** | `id`, `name`, `type`, `storey`, `storeysSpanned`, `targetArea`, `bubble?`, `footprint?`, `pinned` | `type` keys the room-type table. `bubble` is `{x, y}`, the hand's nudge of the room's bubble from where the diagram's arrangement puts it, in the diagram's own units; it keeps the diagram readable and means nothing for the plan. `footprint` is `{polygon, rotation, arcs?}`: a rigid polygon in its own frame, turned about its centre, absent while unplaced. `arcs` remembers which runs of the polygon stand for true arcs (each with its centre, radius and direction in the polygon's frame) so a curved wall exports as an arc and its area is exact; the polygon stays what every calculation works on. A stair is a room with `storeysSpanned > 1`. `pinned` means the solver may not move it. |
| **Edge** | `id`, `a`, `b`, `kind`, `storey`, `hint?` | `a`/`b` are room ids, or the singleton `EXTERIOR`. `kind` is `door`, `open` (one space flows into the next) or `main-door` (exactly one per project, from `EXTERIOR`). `hint` is a wall position for drawing; losing it changes nothing. |
| **Keep apart** | `id`, `a`, `b` | Two room ids the program wants apart: no edge between them (they may share a wall or stand far apart; geometry is irrelevant), and neither reached only through the other, that is, `b` is not on every route from `EXTERIOR` to `a` and `a` not on every route to `b`. Not an edge and never drawn as a door. A warning only: nothing is ever refused or moved for it. |
| **Household** | `familySize`, `bedrooms`, `cars`, `maid`, `driver`, `womensReception`, `masterOnGround` | Who the house is for. The room program is generated from it. `masterOnGround` keeps the master bedroom on the ground floor, a common Kuwaiti arrangement for parents. |
| **Declined** | `a`, `b` | A connection the rulebook suggested and the person took out: its two ends, room ids or `EXTERIOR`. The default connections are not made again for a declined pair; Restore forgets it, for the whole project or for one room, and makes the suggestion again. Deleting a room deletes its declined pairs. |
| **Actor** | `id`, `name`, `role`, `waypoints[]` | Waypoints are room ids. Routes are derived. |

Invariants: an edge joins two rooms that share a storey, or a stair
with a room on any storey it spans. One edge per unordered pair per
storey. Deleting a room deletes its edges and its keep-apart pairs. A
keep-apart pair joins two different rooms, once per unordered pair, on
any storeys. `EXTERIOR` is never a room.
A room is placed (has a footprint) or unplaced, never half. Footprints
on one storey may overlap only while an overlap is unsettled; an
unsettled overlap is always drawn and named in the sentence, never
silent, and is settled by the hand (the lower room in the program
gives way: pushed or carved) or by the landing rule the person chose.

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
by side. The tool never presents one answer. A solver or optimizer,
when it comes, is an optional feature: it proposes a zoning and never
overrides one made by hand.

## The four stages, one graph

1. **Requirements.** Rooms with target areas, the household, the plot
   with north and street sides, budget. Rebuilding the program from
   the household proposes its storeys: one when the one-storey
   program, hallway included, fits the buildable ground, else a First
   with the upper kinds and a stair spanning the storeys, each step
   said in a sentence; every room's storey stays the person's.
2. **Bubbles.** The connection graph, built and checked. No plot, no
   setbacks, no physics and no distance: a circle's area is in
   proportion to the room's target area, the largest room setting the
   scale and a key in the legend saying it, and where a circle stands
   means nothing. The diagram is filled from the program: the
   rulebook's default connections are edges already, each saying its
   source (the rulebook row, or added by hand). The arrangement is
   automatic and the same twice: one column per storey, every storey
   side by side, and inside a column the rooms in rows by the tier of
   the room-type table, public at the bottom, semi-public in the
   middle, private at the top; an exempt room stands in the row of the
   first room it is connected to. Inside a row the rooms stand in the
   order that keeps connected rooms near each other, read off a fixed
   number of sweeps of the barycentre rule, ties by program order, so
   fewer lines cross and the diagram is still the same twice. Each
   category's rooms on a storey sit in a soft cloud of its colour. A
   nudge by the hand is kept for
   readability and means nothing for the plan. Clicking a storey's
   name brings it forward and fades the others, which stay visible. A
   room spanning storeys (a stair, a lift) stands in every column it
   spans as the one room, and is the only way an edge crosses from one
   storey to another. Keep-apart pairs are set here too, drawn as a
   line unlike any edge. The checks stand beside the diagram and are
   read again on every edit. An optional matrix window shows every
   pair of rooms as one cell of a half grid, connected (door or open),
   keep apart, or nothing, editable, the same store and the same undo
   as the diagram, which stays the main view.
3. **Zoning.** The sheet draws the project's rooms and no other: a
   room deleted anywhere leaves it (an undo brings it back where it
   stood), a room added on it joins the program, and a room the sheet
   makes itself (a court or corridor from a pocket, a copy, a piece a
   cut splits off) joins the program too. An empty program is an empty
   sheet. No position transfers from the bubbles: every zone stands where
   the hand put it, dropped from the program or drawn. Rooms dragged,
   turned, reshaped and carved by hand on a plot with the Municipality
   setbacks, the mass beside the sheet as the same model in a second
   window. A door is the drawing of one edge, placed in the Openings
   step: it names its edge and the edge's far end, and stands on the
   longest run of wall its two rooms share, a fraction of the way
   along it, or, to the outside, on the outside wall of its room it
   was placed on. Where the rooms share no wall it fits, or that wall
   no longer faces outside, it is not drawn and its edge is not met;
   when they meet again it is drawn where it was. An edge has one door;
   deleting the edge deletes its door, deleting the door keeps the
   edge. Which pair a new door draws is read from the wall clicked and
   the room across it; a wall between two rooms with no edge asks to
   add the connection: yes connects them and places the door as one
   undo step, no places nothing. A door never makes an edge. The Morph and its proposal are retired (owner, 17 September
   2026). **Check** on the toolbar, off by default, shows the edges on
   the sheet: nothing is drawn while it is off. With it on, hovering a
   room draws faint dashed lines to every room it has an edge with,
   a room still in the program included; selecting a room draws them
   bold to its placed rooms. In the zoning step a line goes when the
   two rooms share a run of wall at least a door wide (ready; corners
   do not count); in the Openings step only when a door drawing that
   edge is placed (met). A door joining a keep-apart pair is marked,
   and so are both rooms of a pair where one is reached only through
   the other. The sentence under the sheet counts both. Nothing is
   moved or refused by any of it but the door's question.
4. **Massing.** The same graph stood up: storeys, heights, envelope as
   the union of rooms, drawn in parallel projection with its numbers
   (floor area, envelope, roof, volume) beside it.

Each stage adds constraints. None changes the graph.

## Derived (computed every time, never stored)

- **Findings** from the graph: reachability from the entrances (the
  front door and every room's own door to the outside), a house of two
  storeys or more with no stair,
  tier skips (a private room joined to the outside or to a public
  room), a storey whose edges cannot be drawn without crossing,
  keep-apart pairs broken (an edge between them, or one reached only
  through the other), stair landings, rule violations. Each with its
  rule and its source. From geometry: only walls
  broken and forces unsatisfied, each with its rule, number, source,
  assumption and confidence.
- **Geometry consistency.** An edge whose two footprints do not share a
  wall a door wide is a line on the drawing while Check is on, never a
  change to the graph. A shared wall with no edge is nothing at all. Snapping is a canvas
  convenience and never creates or removes an edge.
- Footprint outline, coverage, routes, massing: views of the above.

## Operations

- **Draw, move, rotate, resize, carve** change footprints only, and
  pin the room touched until released.
- **Connect** and **disconnect** are the only ways edges come and go;
  an edge's `kind` may be changed in place and it stays the same edge.
  The rulebook's default connections arrive as edges when a program is
  rebuilt or a room is added; a person disconnects what this house
  does not want, and a suggested pair taken out is kept as declined
  and not offered again in that project until Restore. In zoning an edge is added only by the door's question
  above, a person answering it. In the bubbles a drag from
  one room to another connects them, and a click on an edge changes
  its kind or disconnects it.
- **Keep apart** and **allow together** are the only ways keep-apart
  pairs come and go. Connecting a keep-apart pair is allowed and
  warned about, never refused.
- **Send to a storey** moves a room with its companions (auxiliary
  kinds joined to it and to no other room), drops the edges it can no
  longer hold and says which, and connects the defaults on the new
  storey, in one transaction that one undo reverts. A stair refuses.
- **Nudge** moves a bubble for readability and is kept; it changes
  nothing else.
- **Undo** covers rooms, edges, keep-apart pairs, declined pairs,
  plot, storeys, heights and household. The project's name, actors and
  camera are outside it.

## Persistence

Browser storage on every committed edit. Export and import as one JSON
file. Versioned, with a migration function per bump. No server.

## Not in the first milestone

The solver, findings from geometry, analysis, Python service, IFC.
The graph's checks beside the bubble diagram are in it. The first
milestone is the four stages by hand, autosave, project
file, PDF to scale and DXF.
