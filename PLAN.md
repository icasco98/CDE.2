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
| A6 | **Zoning.** Salvaged canvas re-pointed at the graph: move, rotate, resize, carve; plot walls; unrealised edge drawn as tension; proposed edge on touch, accepted by a click; doors drawn from edges. | A2, A3, A5 | Every gesture has a Playwright test. Moving a room never changes an edge. | todo |
| A7 | **Massing.** Salvaged 3D re-pointed at the graph: storeys, heights, envelope numbers, click to select. | A3, A6 | A room selected in any view is selected in all three. | todo |
| A8 | **Export.** PDF to scale, DXF, produced in the browser. | A6, A7 | A printed sheet measures true at its stated scale. The DXF opens in AutoCAD with layers per storey. | todo |
| A9 | **Sample project and usability run.** A sample project; the two owner projects run through the whole loop; fix list worked. | A4 to A8, A10, A11, O3, O5 | The milestone's done condition is met and timed. | todo |
| A10 | **Weights as the three families.** The three sliders become user requirements, site constraints and environmental factors, the families in `rulebook/forces.md`; a project saved with the placeholder keys opens with them mapped. | A4 | The three names are on screen; an old project file opens without loss. | done, PR #15 |
| A11 | **Default connections from the rulebook.** A table of default adjacencies per room kind (kitchen to dining, ensuite to its bedroom, diwaniya to the exterior); rebuilding the program shows them in the bubbles as proposed links a click accepts. Nothing connects without the click. | A5, O2 | Rebuilding the program proposes the defaults; accepting one creates the edge; the table has a source per row. | done, PR #16 |

### Owner tasks

| # | Task | Needed by | Status |
|---|---|---|---|
| O1 | Obtain the current texts: the Municipality's private-housing page (done, PR #1) and the firm's working edition of MEW R-6 (open). | rulebook | in progress |
| O2 | Room-type table for Kuwaiti villas: areas, aspect ranges, tiers. | A4 | done, PR #3 |
| O3 | The known house: plot, north, program, the built plan. | A9 | todo |
| O4 | Rulebook part 1, walls: setbacks, ratios, heights, basements, spans. Each with source and confidence. | Milestone 2 | todo |
| O5 | A fresh brief for the usability run. | A9 | todo |
| O6 | Rulebook part 2, forces: name, element, direction, default strength for Kuwait, source. | Milestone 2 | done as a draft, PR #12 |
| O7 | Revisit the forces: correct strengths, add and remove forces, mark rows `sourced` once the known house and the firm's practice confirm them. Repeats whenever a source arrives. | B1, C1 | todo |

### Proposed, not approved

Named here so they are not forgotten; each starts only when the owner
approves it, after the fresh brief has run through the tool.

| # | Task | Why it waits |
|---|---|---|
| P1 | **Intent tags on the brief.** Wishes in plain words, each mapped to a force or a wall, with the tool showing what each one did. | The usability run shows which wishes people actually have. |
| P2 | **Two entry paths.** A guided sequence for a client beside the architect; the one-page form for the architect alone. Same store. | Needs P1 to have anything to guide through. |
| P3 | **AI intake.** Paste a client's text brief; the tool proposes rooms, storeys, wishes and edges, and lists every assumption for confirmation. | Must only produce inputs the screen already accepts, so it follows P1. |

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
   which standards apply and how they are checked.
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
