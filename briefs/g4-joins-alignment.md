# G4: Joins and alignment

## Where you work

Worktree `/home/user/cde2-g4`, branch `g4-joins-alignment`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `PLAN.md` (row G4), `briefs/g0-zoning-gestures.md`, then `src/views/zoning/*`, `src/geometry/{polygon,outline,walls,footprint}.ts`, `src/model/types.ts`, `tests/e2e/zoning.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree.

**File ownership.** Another task (G2) runs beside you and owns `src/views/zoning/ZoningStage.tsx` plus new files `layout.ts`, `layout.test.ts`, `tests/e2e/layout.spec.ts`. You own `src/views/zoning/{ZoningView.tsx,parts.tsx,doors.ts,gestures.ts,zoning.css,types.ts}` and their tests, and `tests/e2e/zoning.spec.ts`. Do not edit `ZoningStage.tsx`; if a new callback is needed from the stage, add it to `ZoningViewProps` as optional and have the view work without it, and say so in the report.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin g4-joins-alignment`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model.

## Why

Open-plan living, dining and kitchen are the norm in the villas this tool serves, and the owner wants complex outlines without breaking the rule that rooms never overlap. Two rooms joined by an `open` connection should read as one space. And rooms placed by hand or by layout should be squared to the north or to the street with one press.

## Joins

1. Two placed rooms on the same storey with an `open` edge between them that share a wall (`sharedWalls`, tolerance 0.05 m) are a **join**. They stay two rooms in the graph with two footprints and two areas; only the drawing changes.
2. Drawing: the union of the two outlines (`unionPolygons`) is filled once and stroked once as `<path data-join="<a>:<b>">`; the two footprints' own strokes are not drawn along the shared segment, so no wall shows between them; one label at the union's centroid reads both names and both areas ("Family Living 39 m² · Dining Room 24 m²"). Selecting either room highlights the join outline and shows that room's handles; gestures on either room are unchanged. If the two stop sharing a wall (one is moved away), the join is gone and the edge draws as a tension line as today.
3. Three or more rooms chained by open edges form one join (union of all).
4. Doors from `open` edges inside a join are not drawn (the wall is gone); doors of other edges into the join are drawn on the union's outline as today.
5. The massing is untouched: prisms per room, as before.

## Alignment

1. Two buttons on the zoning bar: **Align to north** and **Align to plot**. With a room selected they act on it; with none selected they act on every placed, unheld room on the current storey, in one transaction.
2. Align to north sets the room's rotation so its local axes run with the north arrow (`plot.north` degrees). Align to plot sets it to the direction of the plot's first street side (from `plot.street[0]`, the side's angle), or the plot's longest side when no side is a street. Each rotation is about the room's centre; the result must not overlap a neighbour or leave the plot, otherwise that room is skipped and the fading message names it ("Kitchen could not be aligned: it would overlap Dining Room").
3. A rotation already within 0.5° of the target is left alone (no undo step for it).
4. Reference cases: a room at 17° with north 0 aligns to 0; with north 30 it aligns to 30; a room on a plot whose street side runs at 12° aligns to 12 with Align to plot; a rotation of 92° aligns to 90 under north 0 (the nearest of the four square orientations, so a room is never spun a quarter turn it did not ask for). State that rule.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Unit tests: join detection (shares a wall and an open edge; not for a door edge; not when apart; a chain of three); the union label; the alignment arithmetic and the four reference cases; the skip on overlap.
3. Playwright: place Family Living and Dining Room touching, set their link to open (through the bubbles tab or the existing kind toggle if the zoning offers one; otherwise connect and toggle on Bubbles), return to Zoning and see one `[data-join]` with both names; move one away and the join is gone; place a room at an angle, press Align to north, `data-rotation` reads 0.0; set the plot's north to 30 on Requirements and Align to north reads 30.0; Align to plot with a street side.
4. Usability run through Playwright, described: rebuild, lay two rooms side by side, open them to each other, read the join, rotate one 15° and align it back. Say what felt wrong.
5. Performance: the join computation for 30 rooms with 10 open edges under 2 ms per render, measured as the zoning performance test does.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms.

## Report

End with: what you built, files touched, the test numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
