# The final tool, from the frozen mock

The brief for rebuilding the zoning sheet and the mass in the
repository from the mock "Blocks on the Plot", frozen by the owner on
17 September 2026 at version 55. Written by the cofounder on the
owner's word the same day. The mock is the specification: where this
brief and the mock differ, the mock wins and this brief is corrected.

## Goal

An architect opens the tool, sees the owner's ground floor on the
fresh brief's corner plot, and can do to it everything the mock
allows, by the same gestures, with the same rules, on the sheet or in
the mass; then prints it. Every action the hand can take is also one
call a program can make, so the agent (E1), the tests and the later
analysis drive the same tool.

## What the mock decided, fixed

- The solver stays out. No settle, no morph, no search moves a zone.
- Everything manual; the tool measures, snaps, holds, refuses, and
  says why. It never moves a room on its own except by the landing
  rule the architect chose.
- Advanced settings ship, hidden behind one "More" and reachable, each
  with a one-line explanation. Nothing settable stays only in code.
- Drawn shapes stay: rectangle, circle, polygon, and Reshape.
- Doors and openings exactly as the mock does them.
- The mass is the plan: one model, two windows, either one worked in.
- The owner's sheet (the mock's embedded 12:38 layout) is the default
  plan, with "Back to the sample" and "Clear the plan".

## The source of truth

- The mock's HTML at version 55 (artifact `965cf056`), read in full by
  the agent before writing a line. Its `DEFAULTS` are the defaults;
  its `settings/spec` document in the store is the owner's settings.
- Its embedded layout `EMBEDDED` is the default plan.
- `rulebook/municipality-private-housing.md` for every number the
  mock hard-codes (setbacks, 210 %, 15 m, 5 m on the boundary, half a
  side, 15 m on the street, the stair house).

## Shape of the build: actions first

One module, `src/zoning/actions.ts`, lists every change to the model
as a named function with typed inputs and a typed result. The views
call these and nothing else; no view touches a room directly. The
list, from the mock:

| Action | Inputs | What the mock does |
|---|---|---|
| `place` | room, x, y, storey | drop from the program: snap to walls, corners, lines; hold inside the allowed box; landing rule |
| `move` | room(s), dx, dy, axisLock | drag: same snaps and hold; a group moves as one |
| `turn` | room(s), angle or +90, pivot | knob, R, Face north; snaps to a neighbour's angle within 4°, else to the step |
| `mirror` | room, axis | |
| `pullWall` | room, wall, distance | a wall along its normal, the two it meets following; aligned to a corner, a wall, the setback or plot line |
| `moveCorner` | room, corner, point | carved or drawn rooms |
| `resize` | room, side, distance, shared | a plain room's side; a shared wall drags both |
| `setSize` / `setArea` | room, w, h / area | typed numbers; the shape scales |
| `draw` | room, polygon | rectangle, circle, polygon as the room's footprint |
| `reshape` | room, polygon | take away what overlaps, add what touches, split off the smaller part |
| `carveBelow` / `pushOthers` | room(s) | settle an overlap by hand; the lower room gives way |
| `cutToSetback` | room | |
| `restore` | room | |
| `combine` | rooms, survivor | shares a wall or refuses |
| `group` / `ungroup` / `lock` / `unlock` | rooms | |
| `givePocket` / `makeCourt` / `makeCorridor` | pocket, room | enclosed empty space |
| `setStorey` / `copyTo` | room(s), storey | move or copy up or down; copy gets "copy" in its name |
| `setHeight` | room, metres | snaps to the floor above, two storeys, another zone's height; capped at 15 m, the stair at 18 m |
| `addDoor` / `moveDoor` / `setDoorWidth` / `flipDoor` / `hingeDoor` / `removeDoor` / `openWall` | room, wall point, type… | a door is the drawing of an edge on a wall of its room |
| `sendBack` | room(s) | |
| `addRoom` / `removeRoom` / `reorder` | program | the program order is the order of importance |
| `setSetting` | name, value | every setting, validated as the mock's `setSetting` does |
| `undo` / `redo` | | rooms, doors, program, storey count, heights |

Every action returns the report the mock's sentence is built from:
placed of asked, overlaps, spills, boundary used per side, shortfalls,
courts, pockets, the walk test. The agent reads that report; the
sentence prints it.

A second module, `src/zoning/report.ts`, computes that report from the
model alone. Nothing in it renders.

## The model, as the mock has it

A room: id, name, kind, category, target area, a frame (x, y, w, h,
angle about the frame's centre), optional `pieces` (convex polygons in
the frame; none means the whole rectangle), storey, height (unset
means the storey's), `lost` size, doors (each: type, width, point in
the frame, flip, hinge), locked, group, colour, label position,
`placedAt` (a clock tick, so the newest room gives way in gap
closing). Courts and sheet-made hallways are rooms with `extra` and
`fixed`. The stair is one room across storeys when the setting says
so. A room taller than its storey, and a court, show on the storey
above as its footprint with an X: open to below, taking that space,
taking no door.

Geometry as the mock's: pieces welded within 2 cm, one room one
place (the largest part kept), outline from the pieces with seams
dropped, walls chained into loops, triangulation for any outline.
`src/geometry` already holds booleans, overlap and clamp from A2;
reuse what matches, replace what does not, and say which in the pull
request.

## Screens and the user action each must make possible

**Zoning sheet.** Drag a room from the program and drop it where you
want; it snaps, it lands by the landing rule, the sentence updates.
Everything in the mock's Zoning toolbar, behaviour strip and
right-click menus. Keys as the mock's Keys pane.

**Openings step.** Arm a door type, click a wall, the door lands a
jamb from the corner or at the middle; select, slide, flip, hinge,
widen, remove; Open wall on a shared wall; the walk test greys the
unreached. Z and O switch steps; Esc never does.

**Storeys.** Ground and First, + to three, − for an empty top storey;
each its own height; the storey below faint under the one in hand;
a block sent up or down; the stair one across; setback hard upstairs;
the sentence per storey and in total against 210 %.

**The mass.** The same rooms as volumes beside the sheet, drawn back
to front by the wall-line tree (exact from any angle; the ray-cast
check ships as a test). Edit in 3D on by default: take a volume by any
face and drag, the room moves on its storey with the sheet's snaps, a
shadow under it, the landing rule on the drop; wall handles on the top
edges; a post with a knob for height; a far knob to turn; right-click
for the room's menu. Orbit on empty ground, middle button or Space,
about the selection; wheel zooms; four preset views; double-click
recentres. Blind boundary walls dark, red above 5 m. No names on
volumes; the selected one named under the view. Hide and Show.

**Settings.** Tabs as the mock's: Landing and overlaps, Snapping,
Drawing and Reshape, Doors and windows, Labels, Spaces and boundary,
Motion, Colours, Storeys. The common few on the surface (landing rule,
Build to the boundary, Edit in 3D, street names, storey heights); the
rest under More. Reset to the spec. The chat line is not part of this
brief; it arrives with E1.

**The sentence.** Under the sheet, fixed height, as the mock's
`sayLineBase`: storey line, ratio line, open to below, overlaps,
spills, boundary per side with red past the budget, shortfalls,
courts, pockets, the walk.

## Rules, each with its number from the rulebook

Setback 2 m on the service street, 1.5 m elsewhere (plot under
750 m²). Ground floor may stand on a neighbour boundary for half that
side, on the street for half the frontage and at most 15 m; such walls
blind, no door, red above 5 m. Upper floors never on the boundary.
Ratio 210 % of the plot. Height 15 m; stair house 3 m above.
Corridor 1.2 m clear. Court: 9 m² and a 1.5 m square. Each is a
setting where the mock made it one; each has a reference case.

## Storage and defaults

Browser storage plus a project file (A3's store). The owner's sheet
embedded as the default and drawn before storage answers. "Back to the
sample" restores it; "This is it" makes the current sheet the sample;
"Clear the plan" empties the sheet and keeps it empty across reloads.

## Reference cases (accuracy)

- The embedded sheet's report matches the mock's sentence for it:
  ground 352.2 m² placed of 305 asked; west boundary 13 of 12.5 m,
  over by 0.5; north 7.8 of 10; side street 5.5 of 12.5; street 0 of
  10; walk 17 of 17.
- A 60 m² diwaniya turned 25° cut by a 3 × 3 room loses exactly the
  overlap area; carve then Restore shape gives the area back.
- A door on a wall of 2.6 m with a 0.9 m leaf sits 0.15 m from the
  corner; on a 1 m wall it is refused.
- The stair's height: unset reads the top storey's roof (7 m with two
  storeys of 3.5); pulled, it snaps to 3.5 and 7 and stops at 18.
- The ray cast: at 900 sample pixels from six views, the room drawn on
  top is the room a ray from the eye hits first, zero mismatches away
  from edges.

## Budgets (performance)

Render of the sheet and the mass together under 16 ms for 30 rooms on
two storeys while dragging, measured in Playwright with the
performance API; the wall-line tree under 4 ms for 60 prisms.

## Definition of done

Every screen's stated action works in the running app on the embedded
sheet, tested in Playwright headless. Every action in `actions.ts` has
a unit test and every number a reference case. `npm run check` green.
The guard untouched. The mock left as it is.

## Order

| # | Task | Depends on |
|---|---|---|
| T1 | `actions.ts`, `report.ts`, the model, the geometry reused or replaced, reference cases | – |
| T2 | The zoning sheet over the actions: program, drop, move, turn, walls, draw, reshape, pockets, menus, sentence | T1 |
| T3 | The Openings step and the walk test | T2 |
| T4 | Storeys and the mass, the ray-cast test | T2 |
| T5 | Settings, exhaustive, with the spec's values; storage; the default sheet; Back to the sample; Clear the plan | T2 |
| T6 | Export re-pointed: PDF to scale, DXF per storey (from A8) | T4 |

Each task gets its own brief in this shape, its own branch and pull
request, and runs on Opus. E1 (the agent), windows, fog of war,
circulation and neighbours follow, each briefed from the mock and
this tool.

## Not in this brief

The bubble sheet and the Z tasks are left as they are; whether a
bubble hands its position to the zoning sheet is decided by the owner
before T2 starts. The chat line and the agent are E1. Windows, fog of
war, circulation drawn as routes, neighbours' boxes and street bands
are their own tasks. Climate analysis, optimisation and export to IFC
are later milestones.
