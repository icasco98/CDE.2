# Z4 half two: the straightening

## Where you work

Worktree `/home/user/cde2-z4b`, branch `z4b-task`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md` (stage 3, the operations, the invariants), `DECISIONS.md` (19 and 21), `PLAN.md` (row Z4), `rulebook/room-types.md` (proportion range), `rulebook/municipality-private-housing.md` (the 1.20 m corridor minimum), `briefs/z4a-partition.md` and the Z4a report in its pull request, then `src/zoning/*` (the partition engine and its tests), `src/geometry/*` (polygons, carve, walls, joins, snap), `src/views/zoning/{ZoningStage.tsx,ZoningView.tsx,morph.tsx,joins.ts,align.ts,gestures.ts}`, `tests/e2e/{layout,zoning,plan}.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin z4b-task`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model.

## Why

Half one divides the floor with no gaps, no overlaps and every contact kept, and the zones come out as stepped cell outlines of 20 to 90 vertices with a corridor at a free angle. No architect would draw them. The owner's ruling: orthogonal straight lines are preferred; a diagonal appears only when the designer draws one by hand. This half turns the partition into rooms with running walls, and it is the hard half of decision 19.

## What changes

1. **The corridor snaps to an axis.** Before anything else, the corridor's axis snaps to the nearer of the plot's two grid directions (the service street's direction and its normal), keeping its near end on the room it starts from and its length; the partition is run again with the snapped corridor so the rooms along it already lie against a straight side. If the snapped corridor would leave the buildable line, it is shortened, never bent.

2. **Walls that run.** A new `src/zoning/straighten.ts`, engine only, after the partition and before the doors: every boundary between two zones, and between a zone and the buildable line, becomes straight runs on the 0.25 m grid. A stepped boundary is replaced by the fewest axis-aligned runs such that no jog is shorter than 1.0 m and each run lies within half a metre of the cells it replaces; cells the new line gives to a neighbour are taken from the other, so the union of the zones does not change and the areas move only by the swap. Runs are then aligned: a wall within 0.5 m of another wall parallel to it, on any zone, is moved onto it when the swap of cells keeps both rooms within a cell of target; the joins of G4 are the reference, reuse what they have.

3. **Rectangles plus at most one arm.** Each zone must end as a rectangle, or a rectangle with one rectangular arm (an L). A zone that is not is repaired: the largest inscribed rectangle is kept, the largest rectangle adjacent to it on the grid is the arm, and every other cell goes to the neighbour that touches it most (a companion never gives cells to anyone but its owner). A zone under 8 m² ends as a rectangle, no arm.

4. **Area by carving.** After the shapes are set, each zone is brought back to its target: the shared walls of G0 are moved along their lines, one at a time, largest error first, each move a whole grid step, never below the bottom of the neighbour's range, never breaking a seeded contact, until every zone is within a cell of target or no move remains; what remains goes to the hallway, which is why the hallway is measured last and may read "24 of 21".

5. **The hallway last.** The corridor is the leftover spine: after the rooms are carved, the corridor takes the cells between the rooms it serves along its axis, at least 1.20 m wide, never wider than 2.4 m; a cell the corridor cannot reach goes to the adjacent room.

6. **Doors, tension, reachability** as half one computes them, on the straightened zones; a seeded contact that the straightening has reduced below the door length is a defect and must not happen (test it).

7. **The proposal, the animation, Accept and Back** are unchanged; the animation now reveals the straightened zones. The hint under the sheet says once, on the first Morph of a project, that the walls are on the grid and a diagonal is drawn by hand.

8. **Every zone is a footprint** with a polygon of at most 8 vertices (6 for an L, 4 for a rectangle) and rotation 0, so the existing gestures (drag a wall, carve, align, resize) work as on any drawn room; the shared-wall drag on an accepted zone moves the whole wall.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Unit tests on the engine, on the default program for one and two storeys and the feasible-suite programs: every zone a rectangle or an L on the 0.25 m grid, at most 8 vertices, no jog under 1.0 m; no gap and no overlap (the union of zones equals the union of the partition's cells); every room within a cell of its target except the hallway, and the hallway at least 1.20 m wide everywhere; every bubble contact still a shared wall of at least 0.9 m, every door of half one still a door; every room's centroid within 1.5 m of its bubble; the corridor axis-aligned; the same output twice; a storey that spills still spills with the same overflow.
3. Playwright: (a) Morph on the default two-storey program shows zones that are rectangles or Ls (read the polygons), the corridor axis-aligned, no gap and no overlap, every link a door, every room reachable; (b) Accept then drag a shared wall moves the whole wall and both areas update; (c) Morph twice gives the same polygons; (d) the massing of the accepted plan shows prisms with straight faces (count the faces of one prism); (e) the exported DXF of the accepted plan carries at most 8 vertices per room.
4. Usability run through Playwright, described: rebuild, two storeys, settle, Plan, Morph, read the plan as an architect and say plainly whether you would show it to a client as a first zoning; Accept, drag two walls, carve one room, Undo twice. Count gestures; say what a person would need explained.
5. Performance: partition plus straightening of the 20 × 25 plot with 14 rooms under 250 ms; the animation at 60 frames a second.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms for one thing.

## Report

Push, then report: what changed by file, the numbers from the checks, the usability run with your honest reading of the plan, the performance numbers, and anything you decided that the brief left open, especially any zone that could not be made a rectangle or an L and why.
