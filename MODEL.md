# Core model

One principle: **the graph is the truth; geometry is a view of it.**
A house at the conceptual stage is a set of zones and the connections
between them. Where the zones sit on the sheet is how that graph is
being drawn right now, and it may be rough or missing. The checker
reads the graph. The canvas edits both. Nothing ever infers a
connection from where two edges happen to land.

## Words

- **Zone**: a space of the program, drawn as a bubble and then as a
  footprint on the plot.
- **Connection**: direct access from one zone to another, or from a
  zone to the outside. Stored, never inferred.
- **Edge**: the outline of a zone's footprint; a side of it is one edge
  of the zone. Two zones whose edges meet share a run of edge.
- **Wall**: does not exist before the last stage, when the zoning
  becomes an architectural plan and edges become walls with thickness.
- **Limit** and **force**: the two kinds of rule (below).

## Entities (stored)

| Entity | Fields | Notes |
|---|---|---|
| **Project** | `id`, `name`, `storeys`, `heights[]`, `plot`, `household`, `zones[]`, `connections[]`, `apart[]`, `declined[]`, `actors[]`, `version` | One JSON document. Metres and m². `heights` is the floor-to-floor height of each storey in metres, one entry per storey, 3.5 unless the person changes it; the Municipality's 3 m clear minimum and 15 m maximum are limits in the rulebook, not limits on the field. |
| **Plot** | `on` (boolean: the boundary binds), `polygon`, `north` (degrees from up), `street` (which sides face a street) | `on` false: the plot is drawn for reference and constrains nothing. A rectangle today, any polygon later; same field either way. |
| **Zone** | `id`, `name`, `type`, `storey`, `storeysSpanned`, `targetArea`, `bubble?`, `footprint?`, `pinned` | `type` keys the zone-type table. `bubble` is `{x, y}`, the hand's nudge of the zone's bubble from where the diagram's arrangement puts it, in the diagram's own units; it keeps the diagram readable and means nothing for the plan. `footprint` is `{polygon, rotation, arcs?}`: a rigid polygon in its own frame, turned about its centre, absent while unplaced. `arcs` remembers which runs of the polygon stand for true arcs (each with its centre, radius and direction in the polygon's frame) so a curved edge exports as an arc and its area is exact; the polygon stays what every calculation works on. A stair is a zone with `storeysSpanned > 1`. `pinned` means the solver may not move it. |
| **Connection** | `id`, `a`, `b`, `kind`, `storey`, `hint?` | `a`/`b` are zone ids, or the singleton `EXTERIOR`. `kind` is `door`, `open` (one space flows into the next) or `main-door` (exactly one per project, from `EXTERIOR`). `hint` is a position on an edge for drawing; losing it changes nothing. |
| **Keep apart** | `id`, `a`, `b` | Two zone ids the program wants apart: no connection between them (they may share an edge or stand far apart; geometry is irrelevant), and neither reached only through the other, that is, `b` is not on every route from `EXTERIOR` to `a` and `a` not on every route to `b`. Not a connection and never drawn as a door. A warning only: nothing is ever refused or moved for it. |
| **Household** | `familySize`, `bedrooms`, `cars`, `maid`, `driver`, `womensReception`, `masterOnGround` | Who the house is for. The program is generated from it. `masterOnGround` keeps the master bedroom on the ground floor, a common Kuwaiti arrangement for parents. |
| **Declined** | `a`, `b` | A connection the rulebook suggested and the person took out: its two ends, zone ids or `EXTERIOR`. The default connections are not made again for a declined pair; Restore forgets it, for the whole project or for one zone, and makes the suggestion again. Deleting a zone deletes its declined pairs. |
| **Actor** | `id`, `name`, `role`, `waypoints[]` | Waypoints are zone ids. Routes are derived. |

Invariants: a connection joins two zones that share a storey, or a
stair with a zone on any storey it spans. One connection per unordered
pair per storey. Deleting a zone deletes its connections and its
keep-apart pairs. A keep-apart pair joins two different zones, once per
unordered pair, on any storeys. `EXTERIOR` is never a zone.
A zone is placed (has a footprint) or unplaced, never half. Footprints
on one storey may overlap only while an overlap is unsettled; an
unsettled overlap is always drawn and named in the sentence, never
silent, and is settled by the hand (the lower zone in the program
gives way: pushed or carved) or by the landing rule the person chose.

## Reference tables (code, one copy each)

**Zone types:** `label`, `minArea`, `typicalArea`, `aspect` range,
`category` (private, shared, service, reception), `tier` (public,
semi-public, private, or exempt), `passable`, `auxiliary`,
`circulation`, `defaultStorey` (ground, upper, any, all storeys, or
the top), `companion` (a kind added alongside this one, such as a
bedroom's ensuite). Area-based, so a zone's shape is the drawer's
choice.

**Rulebook:** every rule is a limit or a force (below), with `id`,
`statement`, `appliesTo`, `source`, `confidence` (`sourced` or
`provisional`). A provisional rule can only ever recommend.

## Limits and forces

Every factor the tool knows is one of two kinds, never both.

- **A limit** is a hard constraint: a setback, a plot ratio, a height
  limit, a zone the client will not cut, a span the structure cannot
  make. Limits carve the feasible region and are never traded.
- **A force** is a soft preference: orientation, compactness, the
  privacy gradient, the diwaniya to the street, budget pressure. A
  force has a name, the element it acts on, a direction, a magnitude,
  a source, and a default strength for Kuwait stated with evidence.
  The person can change the weight. Every force is drawable as a
  vector on a drawable element, so an animation of the solver is the
  computation, not a picture of it.

A layout is ranked by how the forces balance inside the limits. An
equilibrium is local, so several typologies are settled and shown side
by side. The tool never presents one answer. A solver or optimizer,
when it comes, is an optional feature: it proposes a zoning and never
overrides one made by hand.

## The five stages, one graph

1. **Requirements.** Zones with target areas, the household, the plot
   with north and street sides, budget. Rebuilding the program from
   the household proposes its storeys: a Ground and a First at least,
   the kinds the zone-type table puts upstairs (bedrooms with their
   suites) on the First, the master kept down when the household asks,
   a stair spanning the storeys; then, while the ground's targets
   exceed its buildable area, private kinds the table lets stand on
   either floor follow them up, largest first. Areas are zone areas:
   no allowance is made for walls, which have their real area in the
   architectural plan.
   Each step is said in a sentence; every zone's storey stays the
   person's.
2. **Bubbles.** The connection graph, built and checked. No plot, no
   setbacks, no physics and no distance: a circle's area is in
   proportion to the zone's target area, the largest zone setting the
   scale and a key in the legend saying it, and where a circle stands
   means nothing. The diagram is filled from the program: the
   rulebook's default connections are made already, each saying its
   source (the rulebook row, or added by hand). The arrangement is
   automatic and the same twice: one column per storey, every storey
   side by side, and inside a column the zones in rows by the tier of
   the zone-type table, public at the bottom, semi-public in the
   middle, private at the top; an exempt zone stands in the row of the
   first zone it is connected to. Inside a row the zones stand in the
   order that keeps connected zones near each other, read off a fixed
   number of sweeps of the barycentre rule, ties by program order, so
   fewer lines cross and the diagram is still the same twice. Each
   category's zones on a storey sit in a soft cloud of its colour. A
   nudge by the hand is kept for readability and means nothing for the
   plan. Clicking a storey's name brings it forward and fades the
   others, which stay visible. A zone spanning storeys (a stair, a
   lift) stands in every column it spans as the one zone, and is the
   only way a connection crosses from one storey to another. Keep-apart
   pairs are set here too, drawn as a line unlike any connection. The
   checks are read again on every edit. An optional matrix window shows
   every pair of zones as one cell of a half grid, connected (door or
   open), keep apart, or nothing, editable, the same store and the same
   undo as the diagram, which stays the main view.
3. **Zoning.** The sheet draws the project's zones and no other: a
   zone deleted anywhere leaves it (an undo brings it back where it
   stood), a zone added on it joins the program, a zone moved to
   another storey on it moves there in the program as the same undo
   step, and every zone it holds stands on the storey the program
   gives it; a zone the sheet makes itself (a court or corridor from a
   pocket, a copy, a piece a cut splits off) joins the program too. An
   empty program is an empty sheet. No position transfers from the
   bubbles: every zone stands where the hand put it, dropped from the
   program or drawn. Zones dragged, turned, reshaped and carved by hand
   on a plot with the Municipality setbacks, the mass beside the sheet
   as the same model in a second window. A door is the drawing of one
   connection, placed in the Openings step: it names its connection and
   the connection's far end, and stands on the run of edge its two
   zones share on the side of its zone it was placed on (the longest
   run when that side shares none), a fraction of the way along it, or,
   to the outside, on the outer edge of its zone it was placed on.
   Where the zones share no run of edge it fits, or that edge no longer
   faces outside, it is not drawn and its connection is not met; when
   they meet again it is drawn where it was. A connection may have
   several doors, never two overlapping on one edge, and is met while
   any of them is drawn; deleting the connection deletes its doors,
   deleting a door keeps the connection and the others. Which pair a
   new door draws is read from the edge clicked and the zone across it;
   an edge between two zones with no connection asks to add it: yes
   connects them and places the door as one undo step, no places
   nothing. A door never makes a connection. The Morph and its proposal
   are retired (owner, 17 September 2026). **Show connections** on the
   toolbar, off by default, shows the connections on the sheet: nothing
   is drawn while it is off. With it on, hovering a zone draws faint
   dashed lines to every zone it has a connection with, a zone still in
   the program included; selecting a zone draws them bold to its placed
   zones. In the zoning step a line goes when the two zones share a run
   of edge at least a door wide (ready; corners do not count); in the
   Openings step only when a door drawing that connection is placed
   (met). A door joining a keep-apart pair is marked, and so are both
   zones of a pair where one is reached only through the other. The
   sentence under the sheet counts both. Nothing is moved or refused by
   any of it but the door's question.
4. **Massing.** The same graph stood up: storeys, heights, envelope as
   the union of zones, drawn in parallel projection with its numbers
   (floor area, envelope, roof, volume) beside it.
5. **Architectural plan.** Not built yet. The zoning becomes a plan:
   edges become walls with thickness, doors become openings in them.
   The word wall belongs to this stage alone.

Each stage adds constraints. None changes the graph.

## Derived (computed every time, never stored)

- **Findings** from the graph: reachability from the entrances (the
  front door and every zone's own door to the outside), a house of two
  storeys or more with no stair, tier skips (a private zone joined to
  the outside or to a public zone), a storey whose connections cannot
  be drawn without crossing, keep-apart pairs broken (a connection
  between them, or one reached only through the other), stair landings,
  rule violations. Each with its rule and its source. From geometry:
  only limits broken and forces unsatisfied, each with its rule,
  number, source, assumption and confidence.
- **Geometry consistency.** A connection whose two footprints do not
  share a run of edge a door wide is a line on the drawing while Show
  connections is on, never a change to the graph. A shared run of edge
  with no connection is nothing at all. Snapping is a canvas
  convenience and never creates or removes a connection.
- Footprint outline, coverage, routes, massing: views of the above.

## Operations

- **Draw, move, rotate, resize, carve** change footprints only, and
  pin the zone touched until released.
- **Connect** and **disconnect** are the only ways connections come
  and go; a connection's `kind` may be changed in place and it stays
  the same connection. The rulebook's default connections are made
  when a program is rebuilt or a zone is added; a person disconnects
  what this house does not want, and a suggested pair taken out is kept
  as declined and not offered again in that project until Restore. In
  zoning a connection is added only by the door's question above, a
  person answering it. In the bubbles a drag from one zone to another
  connects them, and a click on a connection changes its kind or
  disconnects it.
- **Keep apart** and **allow together** are the only ways keep-apart
  pairs come and go. Connecting a keep-apart pair is allowed and
  warned about, never refused.
- **Send to a storey** moves a zone with its companions (auxiliary
  kinds joined to it and to no other zone), drops the connections it
  can no longer hold and says which, and connects the defaults on the
  new storey, in one transaction that one undo reverts. A stair
  refuses. Sent from the zoning sheet, the zones the hand moved go,
  with the companions still waiting in the program; a companion drawn
  on the sheet stays where it stands.
- **Nudge** moves a bubble for readability and is kept; it changes
  nothing else.
- **Undo** covers zones, connections, keep-apart pairs, declined
  pairs, plot, storeys, heights and household. The project's name,
  actors and camera are outside it.

## Persistence

Browser storage on every committed edit. Export and import as one JSON
file. Versioned, with a migration function per bump. No server.

## Not in the first milestone

The solver, findings from geometry, analysis, Python service, IFC, the
architectural plan. The graph's checks are in it. The first milestone
is the first four stages by hand, autosave, project file, PDF to scale
and DXF.
