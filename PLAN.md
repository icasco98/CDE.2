# Plan

Updated at every weekly check-in. Dates are targets; a slip is
recorded here with its reason, not hidden.

Start: week of 14 September 2026. Owner available weekdays and
weekends; agent work is continuous; every merge is reviewed by the
cofounder (Claude) and approved by the owner with one click.

## Milestone 1: the loop by hand (target: 13 November 2026)

A person enters a twelve-room program with a real plot, draws the
bubbles, places and rotates the rooms, sees the massing, and prints a
scaled PDF and a DXF, in under thirty minutes without asking for help.
No solver, no findings, no analysis.

| Week | Ending | Agent track | Owner track |
|---|---|---|---|
| 0 | 20 Sep | Foundation: tooling, CI, guard test, app shell, salvaged geometry with its tests, instructions and specs merged. | Verify current editions of the Municipality resolutions and the MEW energy code. Pick the known house for the accuracy test. |
| 1 | 27 Sep | Data model and store: project, rooms, edges, plot, weights; undo; autosave; project file import and export with a round-trip test. | Room-type table: areas, aspects, tiers for Kuwaiti villas. |
| 2 | 4 Oct | Requirements screen: program entry, plot with north and street sides, household. | Rulebook part 1: walls (setbacks, ratios, heights, structure). |
| 3 | 11 Oct | Bubbles: force layout with damping, determinism, pinning, storey layers, connect and disconnect, area-versus-plot warning. | Rulebook part 2: forces, with sources and default strengths. |
| 4 | 18 Oct | Bubbles finished and usability-tested. Zoning begins: salvaged canvas re-pointed at the graph. | Enter the known house as a project. |
| 5 | 25 Oct | Zoning: move, rotate, resize, carve, plot walls, unrealised edges shown as tension, proposed edges on touch, door drawing from edges. | Review zoning on the known house. |
| 6 | 1 Nov | Massing: salvaged 3D re-pointed at the graph, storeys, envelope numbers. | Rulebook review with a colleague. |
| 7 | 8 Nov | Export: PDF to scale, DXF. Sample project. | Write the fresh brief for the usability run. |
| 8 | 13 Nov | Usability run on both projects, fix list, milestone review. | Run the tool on both projects and time it. |

Slack: one week held in reserve before milestone 2.

## Milestone 2: the rule engine (target: mid January 2027)

Findings from the graph and the geometry, each with rule, number,
source, assumption and confidence, one click down from a one-sentence
verdict. Circulation routes over edges. The known house scores as
expected. Plain screens, no visual design yet.

## Milestone 3: forces and settling (target: spring 2027)

The solver over rigid rotatable rooms with collision; pinning; the
settle animation as the solver's own steps; several typologies side
by side. The hardest milestone. Budget accordingly.

## Milestone 4: visual design

The two registers: hand-drawn and cut-paper for the story and the
bubbles, quiet and precise for the plan and the numbers.

## Milestone 5: environment and export

Sun, shadow and radiation per facade, glazing against the energy
code, passive strategies for hot-arid climate. Python service arrives
here. IFC for Revit when the owner's own workflow needs it.

## How a task runs

1. The cofounder writes the brief: goal, files, definition of done,
   which standards apply and how they are checked.
2. An agent works on a branch from the brief and this repository
   only.
3. The cofounder reviews the diff, runs the checks, and tests the
   action in the running app.
4. The owner approves the merge.
5. The check-in note records what merged, what slipped, and why.

## Standards checked on every task

Usability: the stated action works in the app. Accuracy: the
reference case reproduces. Performance: the budget is measured.
Tidiness: no history in comments, small exported surfaces, nothing
inert.
