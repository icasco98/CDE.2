# Z4 half one: the partition, as a proposal

## Where you work

Worktree `/home/user/cde2-z4a`, branch `z4a-task`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md` (stage 3, the operations, the invariants), `DECISIONS.md` (17 to 21, especially 19 and 21), `PLAN.md` (row Z4), `rulebook/room-types.md` (proportion range, auxiliary, companion), `briefs/z1-plot-under-bubbles.md`, `briefs/z2-walls-site-forces.md`, `briefs/g2-layout-from-bubbles.md`, `briefs/g4-joins-alignment.md`, `briefs/g5-draw-tool.md`, then `src/bubbles/simulation.ts` (`corridorLies`, `buildableOf`, the bodies), `src/rulebook/{setbacks,feasibility,program,kerb}.ts`, `src/geometry/*` (polygons, carve, outline, walls, overlap, snap), `src/views/zoning/{layout.ts,ZoningStage.tsx,ZoningView.tsx,parts.tsx,doors.ts,joins.ts}`, `src/model/{types,actions,store}.ts`, `src/app/session.ts`, `tests/e2e/{layout,zoning,plan}.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin z4a-task`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model: a zone is a footprint as the model already has it, and the proposal is view state until Accept.

## Why

"Lay out from bubbles" packs rectangles from nothing and leaves gaps, overlaps and broken contacts. Decision 19 replaces it in two halves. This is half one, the partition: the buildable area divided among the bubbles so that there are no gaps and no overlaps by construction and every contact the bubbles have becomes a shared wall. Half two, the straightening into running walls, is a separate task; here the zones may be stepped on the 0.25 m grid. The proposal, the animation, Accept and Back are built here because the partition is what they show.

## What changes

1. **The partition engine**, `src/zoning/partition.ts` (new directory, engine only, no React), with its own tests. Input: the storey's rooms with their bubbles (plot metres), the storey's edges, the buildable polygon, the corridor as `corridorLies` places it (read from the same rule the bubbles use, so the zone lies where the bubble lay), companions and their owners, the kerb claims of the walled rooms. Output: one orthogonal polygon per room on the 0.25 m grid, the doors, the links left as tension with their sentence, the rooms not reachable from the entry, and the overflow past the buildable line in m².
   - Cells of 0.25 m over the plot. Each cell goes to the bubble whose weighted reach covers it most deeply (a power diagram: distance squared less a weight), the weights adjusted round by round until every room holds its target area to within a cell; cells no reach covers stay outside the house. While the storey's targets fit inside the buildable area, no cell outside the line is given to a room; only a storey that cannot fit is let past it, and that is the spill.
   - The corridor is laid first, as fixed cells along its axis at its width from `corridorLies`, from the room it starts from to the far end its area gives it; then the entry and the walled rooms' cells at their kerb claims; then a metre of shared wall is seeded at every bubble contact (for a room on the corridor, the free neighbours of the corridor cells nearest it, on its side; for two discs, cells either side of their contact point), so the division reshapes rooms but never separates them. A companion's cells are seeded against its owner's.
   - A garage bay keeps a straight run to the kerb: the strip between the bay and the street line is the bay's or nobody's, never another room's; a bay with no run is a finding (step 5).
   - Then the cells are tidied so the zones read as shapes: a majority pass over a five-cell window, then notches out, never touching a seeded or corridor cell, never taking a cell from a room under 8 m², never crossing the line while the storey fits.
   - Each zone becomes one polygon: the outline of its cells (`buildingOutline` or your own tracer), holes filled to the room that surrounds them. If a zone comes out in two pieces the larger is the room and the smaller goes to the neighbour that touches it most.
   - A door where a linked pair shares at least 1.0 m of wall (0.9 m for a room under 8 m²), at the middle of the longest shared run, as a `hint` on the edge; a linked pair with less is tension, with the sentence naming what is between them; reachability from the entry (the stair on an upper storey) over the doors.
   - Deterministic: the same bubbles give the same polygons, cell for cell.

2. **The proposal.** "Lay out from bubbles" becomes **Morph**. It runs the partition for the storey shown and draws the result on the sheet as a proposal: every zone dashed, doors as marks, tension as the dashed lines the sheet already draws, overflow hatched outside the buildable line with the number in the fit line, and two buttons in the bar, **Accept** and **Back to bubbles**. The proposal is view state: nothing is written to the store until Accept, which places every zone in one transaction (one undo returns the storey to unplaced) and writes the door hints. Back clears the proposal and writes nothing. Escape is Back. Morphing twice without touching a bubble gives the same proposal. A storey with rooms already placed asks first ("Replace the 12 placed rooms?") with the same two buttons.

3. **The animation.** About a second, camera held: each bubble (drawn from the bubble positions the sheet already knows) grows into its zone, the zone revealed inside a circle expanding from the bubble's centre, links fade to doors and tension. Drawn with the sheet's SVG, no library. The store does not change during it. Under `prefers-reduced-motion` it is a cut.

4. **Replace, do not keep.** `src/views/zoning/layout.ts` and its tests go, with `planFrom` in the stage; the reference numbers in `layout.test.ts` go with them. `tests/e2e/layout.spec.ts` is rewritten around Morph, Accept and Back. Nothing else on the plan sheet changes: the gestures, joins, doors, alignment and export work on the accepted zones as on any footprint.

5. **Findings.** Two new lines in `src/rulebook/feasibility.ts`, shown where the others are: a garage bay whose run to the kerb is blocked ("Garage bay 2 has no straight run to the street; move the room in front of it or stack it behind bay 1"), and, after a morph, the links left as tension listed under the plan sheet as they are under the bubbles.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Unit tests on the engine: no gap (the union of zones is the union of the covered cells) and no overlap (no cell in two zones) on the default program for one and two storeys and on the four feasible-suite programs of Z2; every bubble contact a shared wall of at least 0.9 m; every room's polygon area within a cell of its target while the storey fits; every room's centroid within 1 m of its bubble; the corridor first and its cells fixed; a bay's run to the kerb clear; the same output twice; a storey that does not fit spills with the overflow equal to the cells outside; a link crossed by the corridor is tension with the sentence; reachability from the entry.
3. Playwright: (a) Morph on the default two-storey program shows a dashed proposal with no two zones overlapping and no gap between neighbours (sample points along shared walls), every link a door, every room reachable; (b) Accept places every room in one step and one Undo unplaces them all; (c) Back writes nothing and Escape is Back; (d) Morph twice gives the same polygons; (e) the animation runs and ends with the proposal, and under reduced motion it is a cut; (f) on a plot too small for the program the overflow is hatched and counted; (g) a storey with placed rooms asks before replacing; (h) the accepted zones take the existing gestures (drag a shared wall, carve, align) as any footprint does.
4. Usability run through Playwright, described: rebuild, two storeys, settle, Plan tab, Morph, read the proposal as an architect (are the rooms where the bubbles were, do the walls make sense even stepped, is the corridor a corridor), Back, move one bubble across the corridor, Morph again, Accept, drag one wall, Undo. Count gestures, say what a person would need explained, and say plainly what the stepped zones look like so half two knows what it inherits.
5. Performance: the partition of a 20 × 25 plot with 14 rooms under 150 ms; the animation at 60 frames a second on the default program; the pointer-move path unchanged.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms for one thing; nothing of the old packer left.

## Report

Push, then report: what changed by file, the numbers from the checks, the usability run with your reading of the proposal, the performance numbers, and anything you decided that the brief left open, especially anything half two must know about the stepped zones.
