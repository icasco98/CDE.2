# G2: Lay out from bubbles

## Where you work

Worktree `/home/user/cde2-g2`, branch `g2-layout-from-bubbles`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md` (1, 5, 6 and the removed-on-purpose list in CLAUDE.md: no generator based on random search), `PLAN.md` (row G2), `briefs/a6-zoning.md`, `briefs/g0-zoning-gestures.md`, then `src/views/zoning/{gestures.ts,defaults.ts,ZoningStage.tsx,types.ts}`, `src/geometry/index.ts`, `src/bubbles/simulation.ts` (bands, `bandOf`, twins), `src/views/bubbles/bands.ts`, `tests/e2e/zoning.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree.

**File ownership.** Another task (G4) runs beside you and owns `src/views/zoning/{ZoningView.tsx,parts.tsx,doors.ts,gestures.ts,zoning.css,types.ts}`. You own new files `src/views/zoning/layout.ts`, `layout.test.ts`, `tests/e2e/layout.spec.ts`, and you may change `src/views/zoning/ZoningStage.tsx` only (the button goes there, in a small bar above the view). Touch nothing else in the zoning view. Import from `gestures.ts` and `defaults.ts`; do not edit them.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin g2-layout-from-bubbles`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model.

## Why

The bubble diagram already says which room is on which storey and what sits beside what, yet the zoning sheet starts empty and every room is dragged from the tray by hand. One button should turn the diagram into a first plan.

## What it is, and what it is not

A projection of the diagram, then a short deterministic relaxation. It is not a layout generator: no random search, no scoring, no annealing, and none of the names the guard forbids. Same diagram, same plan, every time.

## The rule (`src/views/zoning/layout.ts`, pure)

`layOut(rooms, edges, plot, storey, sizes, gridM)` returns placements for every unplaced room on the storey, or a refusal naming the rooms that could not be placed.

1. **Starting rectangle** for each unplaced room: `startingRectangle(targetArea, proportion)` from `defaults.ts`, rotation 0.
2. **Starting position** from the bubble: take the bubbles of the storey's rooms (a stair uses its twin on this storey), map their x range onto the plot's bounding box x range inset by half the widest rectangle, and each bubble's height within its band onto the plot's y range the same way. A room with no bubble goes at the plot's centre. Placed rooms and held rooms are fixed obstacles and never move.
3. **Relaxation**, at most 200 rounds, in room order by id so the result is deterministic: for every pair that overlaps (`footprintsOverlap`, and `sharedArea` when the cheap test says maybe), push both apart along the line between their centres by the overlap, split by inverse area, a fixed room taking none; then hold every moving room inside the plot (`shiftFootprintInside`) when the plot binds. Stop when no pair overlaps. Then snap each moving room's north-west corner to the grid and, if the snap made an overlap, undo that room's snap. State the rule in one comment.
4. **Refusal.** If overlaps remain after 200 rounds, return the rooms still overlapping and place nothing (the button says "Not enough room on Ground for Garage bay 2 and Kitchen; enlarge the plot or unplace something").
5. Rooms are never rotated, resized or carved by this rule; the person does that after.

## The button

In `ZoningStage.tsx`, a bar above the view with "Lay out from bubbles" (disabled with a title when every room on the current storey is placed; the stage needs to know the storey the view shows: read it from the view through a small `onStoreyChange` callback if the view exposes one, else keep the storey in the stage and pass it down as a prop only if that prop already exists; if neither is possible without editing files you do not own, lay out every storey at once and say so). On press, `onPlaceAll` with the placements in one transaction, so one undo removes the whole layout; the refusal goes through `session.say`.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Unit tests: determinism (same input twice, deep-equal placements); no overlaps after layout for the two-storey default program's ground floor on the starting plot with the diagram settled (build the diagram with `createState`/`settle` from `src/bubbles` in the test); fixed rooms untouched; the refusal case (a plot too small); a stair spanning two storeys placed once and reported on both.
3. Reference case: the default program's ground floor (rooms as `defaultProgram` gives them, bubbles from `settle`) lays out inside the 20 × 25 plot with no overlap, every room at its target size, and rooms linked in the diagram closer on the plan than unlinked ones on average (state the two averages in the test's name).
4. Playwright: rebuild, settle the bubbles, accept all proposals, open Zoning, press Lay out from bubbles: every ground room is placed, no `[data-room]` overlaps another (compare polygons through the DOM), doors and tensions are drawn, and one Undo returns them all to the tray.
5. Performance: layout of 20 rooms on one storey under 20 ms, measured in a Vitest test.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids.

## Report

End with: what you built, files touched, the reference case's numbers, the performance measurement, and anything you decided that the brief left open.
