# Plan

An ordered list of tasks. No dates. A task starts when the owner
approves it and runs until its definition of done is met. Owner tasks
are done when the owner is available. A task is marked here as
`todo`, `in progress` or `done`, with the pull request that closed it.

Order matters where a task names what it depends on. Tasks with no
dependency between them may run at the same time.

## Milestone 1: the loop by hand

Done when: a person enters a twelve-room program with a real plot,
draws the bubbles, places and rotates the rooms, sees the massing, and
prints a scaled PDF and a DXF, in under thirty minutes without asking
for help. No solver, no findings, no analysis.

### Agent tasks

| # | Task | Depends on | Done when | Status |
|---|---|---|---|---|
| A1 | **Foundation.** Tooling (TypeScript, React, Vite, Vitest, Playwright, lint), CI, `npm run check`, the guard test, an empty app shell that opens. | – | CI green on an empty app; guard test fails on any forbidden name. | done, PR #2 |
| A2 | **Salvage the geometry core.** Polygon booleans and carving, oriented-box overlap, rigid-body plot clamp, grid and gap snapping, footprint union, shared-wall test. Comments stripped, names aligned to `MODEL.md`, their tests brought across. | A1 | Tests pass; no file mentions old concepts; each module exports only what another imports. | done, PR #8 |
| A3 | **Data model and store.** Project, rooms, edges, plot, weights as in `MODEL.md`; undo; autosave to browser storage; project file export and import. | A1 | Round-trip test: export, import, identical project. Undo covers rooms, edges, plot, weights and nothing else. | done, PR #5 |
| A4 | **Requirements screen.** Program entry with target areas from the room-type table, plot with north and street sides, household, weights. | A3, O2 | The owner enters a twelve-room program and a plot without help. | done, PR #10 |
| A5 | **Bubbles.** Circles sized by area under springs, repulsion and storey pull; damped, deterministic for the same input; pin; connect and disconnect; storey layers; area-versus-plot warning. | A3 | Same input gives the same picture twice. A pinned bubble does not move. Layout settles under two seconds for thirty rooms. | done, PR #9, wired PR #11 |
| A6 | **Zoning.** Salvaged canvas re-pointed at the graph: move, rotate, resize, carve; plot walls; unrealised edge drawn as tension; proposed edge on touch, accepted by a click; doors drawn from edges. | A2, A3, A5 | Every gesture has a Playwright test. Moving a room never changes an edge. | done, PR #19 |
| A7 | **Massing.** Salvaged 3D re-pointed at the graph: storeys, heights, envelope numbers, click to select. | A3, A6 | A room selected in any view is selected in all three. | done, PR #23 |
| A8 | **Export.** PDF to scale, DXF, produced in the browser. | A6, A7 | A printed sheet measures true at its stated scale. The DXF opens in AutoCAD with layers per storey. | done, PR #47 |
| A9 | **Sample project and usability run.** A sample project; the two owner projects run through the whole loop; fix list worked. | A4 to A8, A10 to A12, F1 to F4, G0 to G5, P4 to P7, Z0 to Z5 if approved, O3, O5 | The milestone's done condition is met and timed. | todo |
| A10 | **Weights as the three families.** The three sliders become user requirements, site constraints and environmental factors, the families in `rulebook/forces.md`; a project saved with the placeholder keys opens with them mapped. | A4 | The three names are on screen; an old project file opens without loss. | done, PR #15 |
| A11 | **Default connections from the rulebook.** A table of default adjacencies per room kind (kitchen to dining, ensuite to its bedroom, diwaniya to the exterior); rebuilding the program shows them in the bubbles as proposed links a click accepts. Nothing connects without the click. | A5, O2 | Rebuilding the program proposes the defaults; accepting one creates the edge; the table has a source per row. | done, PR #16 |
| A12 | **Zoom and pan on the zoning sheet.** Wheel and pinch zoom about the pointer, drag to pan on empty sheet, a Fit button; labels stay readable at any zoom. | A6 | A 6 m² ensuite's label is legible without help; every gesture still passes its Playwright test at 3× zoom. | done, PR #24 |
| F1 | **Storeys and companions in the program.** The room-type table gains a default storey and a companion per kind; rebuilding places bedrooms and their suites upstairs when the house has more than one storey, adds a stair spanning all storeys, and a household option keeps the master bedroom on the ground floor; adding a room adds its companion in one undo step. From the owner's first test. | A4, O2 | A two-storey rebuild reads as a Kuwaiti villa; adding a bedroom gives an ensuite that one undo removes with it. | done, PR #31 |
| F2 | **Bubbles rework.** Zoom, pan and Fit; Delete removes a bubble or a link; a visible Link button and a handle on every bubble; a selected link's kind editable; band boundaries drawn and labelled, a drop into a band assigns the storey, a storey filter; a legend. From the owner's first test. | A5, A12 | The owner links, unlinks, deletes and moves a room between storeys without asking; every gesture has a Playwright test. | done, PR #33 |
| F3 | **Live forces and the weights beside the bubbles.** The simulation runs while a bubble is dragged, neighbours respond, pinned ones hold, no two unpinned bubbles rest on each other, a Spread button clears a pile; the three weights move from Requirements to the Bubbles tab, user requirements scaling connection pull and tier push, the other two marked as acting in zoning. From the owner's first test. | F2 | Dragging a bubble moves its neighbours in the same frame; a bubble dropped on a pile slides clear within a second; the same input still gives the same picture. | done, PR #35 |
| F4 | **A stair on every floor it serves.** In the bubbles a room spanning storeys is drawn once in every band it occupies, the twins moving as one; links attach to the twin on their floor; the storey filter shows that floor's twin. A Spans control in the program table sets which storeys a stair or lift reaches. From the owner's second test. | F3 | Dragging any twin moves all of them in the same frame; a ground-to-second stair shows three bubbles and one prism; the span is changed in the program without help. | done, PR #38 |
| G0 | **Zoning gestures made honest.** Rooms are solid; a drop over a room asks Carve or Put back at the pointer; drag a shared wall to move the boundary between two rooms; Restore shape and Undo carve on the selected room; no modifier keys. From the owner's second test. | A6, A12 | Every gesture has a Playwright test; no room ever loses area without a click that says so; the no-overlap invariant holds over a random run. | done, PR #46 |
| G1 | **Hallways.** A circulation rule in the rulebook; an Add hallway button on the Bubbles tab; the rebuild adds a hallway per storey that needs one; a one-line nudge when private rooms have no corridor. From the owner's second test. | F1, F4 | A two-storey rebuild has a hallway on each storey linked by proposal to the stair and the bedrooms; the button adds one on the filtered storey. | done, PR #43 |
| G2 | **Lay out from bubbles.** One button places every unplaced room on the storey at its target size where its bubble says, pushes overlaps apart and inside the plot, deterministically; placed rooms stay put. | G0, F4 | The same diagram gives the same plan twice; doors and tensions appear at once; a reference diagram lays out inside the plot with no overlap. | done, PR #49 |
| G3 | **One Plan tab.** Zoning and massing side by side from the same store; move and rotate in the massing; the orbit pivots on the building, tilts, has a plan view and wheel zoom. | A7, G0 | A room moved in the massing moves on the sheet in the same frame; the building turns about its own centre. | done, PR #52 |
| G4 | **Joins and alignment.** Two rooms with an open connection draw as one outline with the wall gone; Align to north and Align to plot on the selected room or all unpinned rooms. | G0 | An open-plan pair reads as one space with two areas; aligned rooms have walls parallel to the north arrow or the street side. | done, PR #50 |
| G5 | **Draw tool.** Polygons by clicking corners, vertex editing, arcs and circles stored as polygons with the true arc remembered for export. | G0, A8 | A 5 m circle's area is within half a percent; the DXF opens in AutoCAD with a true arc. | done, PR #54 |
| P4 | **Drawings sized to the space left.** The sheet and the massing take the height left under their bars instead of a share of the window, so the Plan tab never scrolls and screen-sized marks keep their size. From the agents' usability runs. | G3 | Nothing on the Plan tab is below the fold on a 1280 × 720 window; every zoning gesture test still passes. | done, PR #61 |
| P5 | **A circle by target area.** The Circle tool offers the radius that gives the room's target area, so a round guest WC reads its target. | G5 | Draw a circle for a 3 m² room with one click and read 3 of 3 m². | done, PR #60 |
| P6 | **Refusals out of the way.** Fading messages sit over the drawing's corner instead of pushing it down the page. | G0 | Three refusals in a row move nothing on the page. | done, PR #59 |
| P7 | **Storey count under undo.** Storeys join the undo snapshot with heights, so adding a storey and stretching a stair revert together. | F1, A7 | One undo after Add storey restores both the count and the stair. | done, PR #58 |

### Bubbles on the plot (proposed, not approved)

The owner's review found that "Lay out from bubbles" invents positions
from nothing and that bubbles floating on a blank page tell the
designer nothing. The fix is the tool's original thesis: the bubble
diagram is drawn on the plot, the site and environmental forces act
there, and the zones are the bubbles settled and inflated in place.
The morph is a proposal the designer accepts or sends back; a plan
that does not fit is shown spilling, never refused. Order: Z0 with the
owner, then Z1, then Z2 and Z3 together, then Z4, then Z5. (Z, for
zones from bubbles; B is taken by milestone 2.) Each starts
only on the owner's word. If approved, A9 waits on Z5.

| # | Task | Depends on | Done when | Status |
|---|---|---|---|---|
| Z0 | **Decisions before Z1.** Written to DECISIONS.md and MODEL.md: bubbles are drawn at true area and may overlap up to a quarter of the smaller, never wholly; one plot per storey replaces the stacked bands, All shows the upper storey as a ghost over the ground; a bubble's position is stored in plot metres, the frame a footprint uses; stair twins settle to the same spot on every storey; the morph is deterministic, the same bubbles give the same plan; the morph may spill past the buildable line and is shown doing so; slivers left between inflated rooms go to the rooms up to the top of their range, the rest to circulation. | – | Each decision numbered in DECISIONS.md; MODEL.md says where a bubble is and what it may overlap. | done, PR #65 |
| Z1 | **The plot under the bubbles.** The bubble sheet draws the plot, the buildable line from the Municipality setbacks, north and the street sides at the zoning scale through the shared camera. One plot per storey. Bubbles are held inside the buildable line while settling. The default connections are real edges from the first frame, removed by the designer rather than added. Labels never overlap, the legend stands outside the sheet, door and open links read differently. A fit line on the sheet and on the Requirements totals says each storey's target area against its buildable area. | Z0, F2, G3 | The bubbles and the sheet show the same plot at the same scale under the same camera. A bubble dragged past the buildable line comes back. The legend covers no bubble. A storey whose targets exceed its buildable area says so in both places before a bubble is drawn. | done, PR #67 |
| Z2 | **Walls and site forces act; a missed link is diagnosed.** The entry on the frontage, the garage at the kerb and the diwaniya's street door are walls: on the kerb line inside the setback, sliding along it, never off it. S1, S2 and S6 to S8 from forces.md given coordinates on the plot (S3 dropped, S4 and S5 the client's choice on the requirements screen), the service entrance a wall on a side, the privacy gradient pushing private rooms away from the street with a link always winning, every bubble inside the buildable line; the environmental slider waits for milestone 3. Links strong, the overlap wall stronger. The first arrangement is derived from the program, never random: walls on the kerb in order, the corridor just inside the door, private rooms at the back. The hallway is a corridor in the physics, not a disc, its near end held on the entry. After the forces, the link and overlap constraints are projected directly. Auxiliary rooms ride their owner's perimeter. The brief is checked before settling: planarity, links per room against its wall at target aspect, kerb conflicts, each reported with the fix. After settling, any linked pair not touching is corrected by walking the smaller round the larger to the nearest free wall. The owner's O7 corrections are applied on the way. | Z1, O7 | Raising the site weight moves the garage to a street edge in the test. The entry cannot be dragged off the kerb. The same program settles to the same picture twice from a fresh project. A brief asking a 5 m² WC to touch four rooms says so on the Requirements screen. In the feasible test suite every link is touching after settle. | done, PR #69 |
| Z3 | **The hallway as a corridor.** A hallway bubble is a capsule of its area, long axis along the rooms it serves, turning under the forces; a stair stays a circle. Briefed together with Z2, since both live in the simulation. | Z1 | The corridor lies along its served rooms after settling, touching them on its sides; its drawn area equals its target. | done with Z2, PR #69 |
| Z4 | **The morph, in two halves, as a proposal.** "Lay out from bubbles" is replaced. Half one, the partition: the buildable area divided among the bubbles with a metre of wall seeded at every contact, the corridor first from the front door, reachability from the entry checked. Half two, the straightening: walls that run on the grid with jogs of a metre or more, every zone a rectangle plus at most one arm, area met by carving along shared walls with the existing carve, the hallway drawn last as the spine; built as columns either side of the corridor and bands from the kerb up in the bubbles' order, twin bays side by side, small rooms in a pocket on the corridor, auxiliaries carved from their owner's corner, columns balanced. Links into doors where a metre of wall is shared, tension with a sentence where none is. Drawn as an animation of about a second with the camera held. The result sits as a proposal, dashed, with Accept and Back to bubbles: Accept commits the store once, so one undo returns to the bubbles; Back plays the morph in reverse and writes nothing. Rooms past the buildable line are drawn hatched outside it with the overflow in m². The two halves are briefed separately, the second on Opus. | Z2, Z3, G4, G5, O2 | The default program morphs with no gap and no overlap, every bubble contact a shared wall, every room's centre within 1 m of its bubble. Every zone a rectangle or an L on the grid, no jog under a metre. Morphing twice without a change gives the same plan; moving one bubble across the corridor gives a different one with the same links. Every link a door and every room reachable from the entry in the feasible test suite. Back leaves the store untouched. A program that spills shows the hatched rooms and the number rather than a refusal. | done, PR #71 and #73; the second half rebuilt in Z6 |
| Z6 | **The morph's second half, by the cofounder.** The straightening rebuilt around the spine: the corridor fixed first, straight, from the entry to the last room it serves; each room given one straight wall against the corridor or the room before it and its depth from its target, so walls run and align by construction; rooms that share a wall in the bubbles stacked along one line; areas exact; one arm only to keep a seeded contact; the court what is left. Half two's test harness kept and made to pass on the new engine; its straightening code removed. The default household goes to one car (the garage is a ground-floor placeholder until the basement). | Z4 | Every half-two assertion passes on the new engine; the default villa's plan reads as the mock-up's; the plan is the same twice; the default program shows no declared shortfall on the starting plot. | done, PR #74, by the cofounder |
| Z7 | **The settle rewrite, by the cofounder.** Fewer forces, ranked in one function: walls first and absolute (buildable line, kerb claims, corridor anchor, companions), then links projected to touching, then the site rows and the gradient as pulls inside what is left; a pull never undoes a link, a link never crosses a wall. The corridor's lie stored on its bubble, turned only by the hand or a stair under it. Motion bounded by the hand: a settle after a drag moves only the rooms the drag touched and their linked neighbours, by at most what the drag moved. | Z6 | The five feasible-suite programs rest with every link touching and no gap declared that the walls do not explain; dragging the diwaniya half a metre moves no room on another storey by more than half a metre; a reopened storey opens where it was left, companions included; the settle is a fixed number of rounds, not a tuned threshold. | done, PR #76, by the cofounder |
| Z5 | **Fit by reduction, and the manual size check.** When the morph spills, the rooms with the most slack above the bottom of their range are highlighted with the sum they could give up: "reduce these five and the floor fits". Clicking a highlighted room drops it to the bottom of its range and the overflow updates live; the tool never shrinks a room on its own. When even every room at its minimum exceeds the buildable area, the sentence says the ground floor program is too big for this plot by so many m², move rooms upstairs or remove some. The other direction is manual too: when a person resizes, carves or drags a wall on the plan sheet and a zone goes past the top of its kind's range, or the storey's total goes past the buildable area or the Municipality ratio, the zone is outlined in the warning colour and one sentence under the sheet names the limit and by how much; the drag is never refused. | Z6, O2 | On a plot 30 m² too small, the highlighted rooms sum to at least 30 m² and clicking them makes the plan fit. On a plot no reduction can fit, the sentence names the shortfall. No room changes size without a click. Dragging a kitchen wall to 31 m² outlines it and says "Kitchen is 31 m², the range ends at 26"; dragging it back clears the outline. | done, PR #81 |

### Owner tasks

| # | Task | Needed by | Status |
|---|---|---|---|
| O1 | Obtain the current texts: the Municipality's private-housing page (done, PR #1) and the firm's working edition of MEW R-6 (open). | rulebook | in progress |
| O2 | Room-type table for Kuwaiti villas: areas, aspect ranges, tiers. | A4 | done, PR #3 |
| O3 | The known house: plot, north, program, the built plan. | A9 | in progress: drawings received and recorded in `rulebook/known-house.md`; entered as a project in A9 |
| O4 | Rulebook part 1, walls: setbacks, ratios, heights, basements, spans. Each with source and confidence. | Milestone 2 | todo |
| O5 | A fresh brief for the usability run. | A9 | done, `rulebook/fresh-brief.md` |
| O6 | Rulebook part 2, forces: name, element, direction, default strength for Kuwait, source. | Milestone 2 | done as a draft, PR #12 |
| O7 | Revisit the forces: correct strengths, add and remove forces, mark rows `sourced` once the known house and the firm's practice confirm them. Repeats whenever a source arrives. | B1, C1 | in progress, first pass done (PR #66) |
| O8 | A Kuwait weather file (EPW) for Kuwait Airport or KISR's coastal station, from KISR or the Meteorological Center; the public copies were withdrawn. | Milestone 5 | todo |

### Proposed, not approved

Named here so they are not forgotten; each starts only when the owner
approves it, after the fresh brief has run through the tool.

| # | Task | Why it waits |
|---|---|---|
| P1 | **Intent tags on the brief.** Wishes in plain words, each mapped to a force or a wall, with the tool showing what each one did. | The usability run shows which wishes people actually have. |
| P2 | **Two entry paths.** A guided sequence for a client beside the architect; the one-page form for the architect alone. Same store. | Needs P1 to have anything to guide through. |
| P3 | **AI intake.** Paste a client's text brief; the tool proposes rooms, storeys, wishes and edges, and lists every assumption for confirmation. | Must only produce inputs the screen already accepts, so it follows P1. |
| P8 | **A planned storey.** A checkbox on a storey marks it as planned, not built now: the stair spans it, its rooms and bubbles work as on any storey, the massing draws it hatched, the area line reports the ratio twice, as built now and with the planned storey, and the PDF and DXF include it, labelled planned. Nothing is deleted to print. The fresh brief's second floor for the son who marries later is the case. | Until A9 shows whether adding the storey as a normal one and reading the ratio with it is enough. The owner's ruling: if it is built, it is exported, never left out. |
| P9 | **The five analysis questions.** Written before milestone 5, each with a reference case: west sun on facades, court shade, roof gain, glazing per facade against the MEW code, cross-ventilation. Ladybug is asked exactly these. | Needs O8 and the frozen mass to have something to measure. |
| P10 | **Multi-objective optimisation at the massing level.** Few knobs (orientation, footprint proportions, storey heights, court position, setback use); rules as constraints never traded; the output a front of massings, each with its five numbers and what it gave up, for the architect to choose from. | Needs P9's numbers to have reference cases first; its own milestone after 5. |

### The final tool from the frozen mock

The zoning mock "Blocks on the Plot" was frozen by the owner on
17 September 2026 (version 55) and is the specification for the
zoning sheet and the mass; `briefs/final-tool.md` is the brief. Built
actions first: every change to the model is one named call the
screens, the tests and the agent all use. Each T task gets its own
brief, branch and pull request, on the owner's word.

| # | Task | Depends on | Done when | Status |
|---|---|---|---|---|
| T1 | **Actions, report, model.** `actions.ts` and `report.ts` with the model as the mock has it; geometry reused or replaced; reference cases. | A2, A3 | Every action unit-tested; the embedded sheet's report matches the mock's sentence. | done, PR #88 |
| T2 | **The zoning sheet over the actions.** Program, drop, move, turn, walls, draw, reshape, pockets, menus, sentence. | T1 | Drop a room and it snaps, lands by the rule, and the sentence updates, headless on the embedded sheet. | done, PR #89 |
| T3 | **The Openings step.** Door types, Open wall, select and adjust, the walk test. | T2 | Arm a door, click a wall, it lands a jamb from the corner; the unreached go grey. | done, PR #96 |
| T4 | **Storeys and the mass.** Storeys with heights, open to below, the mass drawn by the wall-line tree, Edit in 3D. | T2 | A volume dragged moves its room on the sheet; the ray-cast test passes from six views. | done, PR #94 |
| T5 | **Settings, storage, defaults.** Every setting with the spec's values, the few on the surface and the rest under More; the owner's sheet embedded; Back to the sample; Clear the plan. | T2 | Reset to the spec reproduces the mock's settings; a cleared sheet stays cleared across reloads. | done, PR #93 |
| T6 | **Export re-pointed.** PDF to scale and DXF per storey from A8. | T4 | A printed sheet measures true; the DXF opens with a layer per storey. | done, PR #95 |
| E1 | **The agent over the actions.** Text to zoning plan through `actions.ts`, the report as its feedback, one Undo for a run; the mock's chat line as the model. | T1, T3 | From the fresh brief's program and two sentences, no help: every room placed, no overlaps, inside the line, every room reached, entry and diwaniya doors, under 40 actions. | done, PR #90 |
| T7 | **The program comes from Requirements.** Requirements is the brief, the Sheet follows it, a room added on the Sheet is added back; the plot is data. | T2, A4 | Twelve rooms entered in Requirements are the Sheet's program. | done, PR #97 |
| W1 | **Windows.** Placed like a door on an outside wall; refused on shared and boundary walls; unlit rooms listed. | T3, T4 | A room with no window and no open wall to one reads unlit. | todo |
| W2 | **Fog of war.** What a guest sees from the diwaniya door and the family from the family living, read off doors and windows with heights. | W1 | The guest's view on the embedded sheet matches a hand-drawn reference. | todo |
| W3 | **Circulation drawn.** Actors, routes over doors, an animated walk (B5 re-pointed). | T3 | The route from the street door to the kitchen is drawn and counts its doors. | todo |
| E2 | **The architect's own hands.** Place a room against another's wall touching; carve or push to settle an overlap it made; take back its own last batch. The chat column scrolls, its deliberation collapsed, its answers short. Its mind is `agent/architect.md` and `agent/lessons.md`. | E1 | From the program and one sentence, no help: every room placed, no overlaps, inside the line, in one or two turns. | todo |
| N1 | **Neighbours and streets.** 15 m boxes on the neighbours' setback lines and street bands, each with a switch. | T4 | The mass shows the neighbours' boxes; each switch hides its box. | todo |

## Milestone 2: the rule engine

Done when: findings from the graph and the geometry each show a
one-sentence verdict with rule, number, source, assumption and
confidence one click down; the known house scores as expected;
circulation routes draw over edges.

| # | Task | Depends on | Status |
|---|---|---|---|
| B1 | Rulebook as data: walls and forces loaded from one file, validated against `MODEL.md`. | O4, O6, O7 | todo |
| B2 | Graph findings: reachability, tier skips, stair landings, rule violations. Reference cases from the known house. | B1, A9 | todo |
| B3 | Geometry findings: walls broken, forces unsatisfied, with numbers. Reference cases. | B1, A9 | todo |
| B4 | Findings screen: verdict on the surface, detail one click down, assumptions editable in place. | B2, B3 | todo |
| B5 | Circulation: actors, routes over edges, animated walk. | A6 | todo |
| B0 | **The basement storey.** A storey below ground, its own plot on the bubble sheet, under the Municipality's basement rules from O4 (allowed area, height, whether it counts in the ratio, the ramp's slope and width). The ramp is a room spanning basement and ground, walled on the kerb like the entry. The garage bays stand in the basement by default; the ground frontage carries the ramp instead. The diwaniya may stand in the basement too, as a household choice beside the corner and garden choices, with its own stair or entrance from the street. Until this lands the garage stays on the ground floor as a placeholder. First task of the milestone. | O4, Z5 | todo |

## Milestone 3: forces and settling

Done when: settle moves unpinned rooms to an equilibrium under the
weights; grabbing a room pins it and the rest continue; several
typologies settle side by side; the animation is the solver's own
steps.

| # | Task | Depends on | Status |
|---|---|---|---|
| C1 | Solver over rigid rotatable rooms with collision, forces from B1, walls from B1. Deterministic. | B3 | todo |
| C2 | Settle, pin, interrupt in the zoning view; steps recorded for playback. | C1 | todo |
| C3 | Typologies as starting points; compare view. | C2 | todo |
| C4 | Settle animation across bubbles, zoning and massing. | C2 | todo |

## Milestone 4: visual design

Two registers: hand-drawn and cut-paper for the story and the bubbles;
quiet and precise for the plan and the numbers. Starts from the
owner's references and a written motion language.

## Milestone 5: environment and export

Sun, shadow, radiation per facade, glazing against the energy code,
passive strategies for a hot-arid climate, via a Python service. IFC
for Revit when the owner's own workflow needs it.

## How a task runs

1. The cofounder writes the brief: goal, files, definition of done,
   which standards apply and how they are checked. Briefs are kept in
   `briefs/`, one file per task.
2. The owner approves the start.
3. An agent works on a branch from the brief and this repository only.
4. The cofounder reviews the diff, runs the checks, tests the action
   in the running app, and sends it back until it passes.
5. The owner approves the merge.
6. This file is updated.

## Standards checked on every task

Usability: the stated action works in the app. Accuracy: the
reference case reproduces. Performance: the budget is measured.
Tidiness: no history in comments, small exported surfaces, nothing
inert.
