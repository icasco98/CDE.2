# A7: Massing

## Where you work

Worktree `/home/user/cde2-a7`, branch `a7-massing`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md` (the Project row now carries `heights[]`), `DECISIONS.md` (decision 16 is the design of this view), `PLAN.md`, `briefs/a6-zoning.md` (the shape of a brief and of the zoning view you sit beside), then `src/geometry/index.ts`, `src/model/*`, `src/app/*`, `src/views/zoning/*` (parts, frame, types, css), `src/views/bubbles/BubblesStage.tsx`, `tests/e2e/zoning.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin a7-massing`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or `src/views/zoning/*` beyond importing from it.

## Goal

The Massing tab stands the same graph up: every storey's placed footprints extruded to that storey's height, drawn as an axonometric SVG, with the envelope numbers beside it. A room clicked here is the room selected in the bubbles and the zoning. No 3D library, no WebGL (decision 16).

## Model

1. `Project.heights: readonly number[]`, one entry per storey, metres, floor to floor, default 3.5. `PROJECT_VERSION` 4 with a migration from 3 that fills `heights` with 3.5 per storey. `addStorey` appends 3.5 (or copies the top storey's height); `removeStorey` drops the last. `checkProject` refuses a `heights` whose length is not `storeys` or with a non-positive entry. New action `setHeight(storey, metres)`, recorded for undo (MODEL.md now lists heights under undo: extend `Snapshot` in `project.ts`). `parse.ts` reads it. Tests for the migration, the invariant and the action.

## Geometry (pure, `src/massing/`)

- `projection.ts`: a parallel projection from sheet metres `(x, y, z)` to screen `(u, v)`: horizontal orbit angle `azimuth` (degrees, four presets NE, SE, SW, NW at 45°, 135°, 225°, 315°, and any angle by drag) and a fixed elevation of 30°. Pure functions `project(point, view)` and `depthOf(point, view)` (for painter's order).
- `solids.ts`: for each placed room on each storey, a prism: the footprint outline at the storey's floor level (the sum of the heights below) extruded by that storey's height. Faces: top and the side walls. `facesOf(room, storeys, heights)`. A room with `storeysSpanned > 1` is one prism through the storeys it spans.
- `order.ts`: painter's order of faces for a given view: back to front by the face's mean depth, then top faces after side faces of the same prism. State the rule; it needs only to look right for convex-ish villa masses, and a unit test with two boxes side by side proves the nearer one draws last from every preset.
- `numbers.ts`: the envelope numbers. Per storey: floor area (sum of footprint areas), outline area (`buildingOutline` union) and outline perimeter. Whole: gross floor area, ratio to plot area as a percentage (shown against the Municipality 210% figure from `rulebook/municipality-private-housing.md` as text, not enforced), envelope wall area (each storey's outline perimeter times its height, summed), roof area (each storey's outline minus the storey above's outline, plus the top storey's outline, via `differencePolygons`), volume (each storey's outline area times its height), surface-to-volume ratio (walls plus roof, divided by volume), and the building height (sum of heights) shown against the Municipality 15 m maximum as text. Every number carries its formula in one sentence in the code.

Reference cases, as unit tests with these exact numbers:

- One 10 × 10 room, one storey of 3.5 m: floor 100, walls 140, roof 100, volume 350, surface-to-volume 0.6857 (to four places), height 3.5.
- The same room on two storeys of 3.5 m each: floor 200, walls 280, roof 100, volume 700, ratio 0.5429.
- Ground 10 × 10, first storey 10 × 5 sitting on it: walls 140 + 105 = 245, roof 50 + 50 = 100, volume 350 + 175 = 525.
- Two 5 × 4 rooms sharing a 4 m wall on one storey: outline perimeter 28, not 36; walls 98 at 3.5 m.
- Plot 500 m², gross floor 600: ratio 120%.

## Screen (`src/views/massing/`)

- `MassingStage.tsx` wires the store like `ZoningStage`; `MassingView.tsx` is thin; `parts.tsx` holds the faces, the ground (plot polygon projected at z 0, street sides heavy, north arrow projected), a scale reference (a 5 m bar along the ground's x axis), and the numbers panel; `massing.css`.
- View controls: four preset buttons (NE, SE, SW, NW), drag on empty ground to orbit, a "Fit" that frames the mass. The view angle is view state, not project state.
- Each room is `<g data-room={id}>` with its faces; click selects through `selection.select`; the selected room's faces are highlighted; hover shows the name and area in a `<title>`. Unplaced rooms do not appear; a note says how many are unplaced and on which storey.
- Heights: a small table beside the numbers, one editable metres field per storey (`aria-label` "Height of Ground" etc.), calling `setHeight`. A value under the Municipality 3 m clear minimum, or a total over 15 m, shows a warning next to the field, text only.
- Numbers panel: the values above, formatted to one decimal, each with its formula available as a `<title>` on hover.
- Wire the stage into `src/app/stages.ts`.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. The reference cases above as unit tests, exact.
3. Playwright (`tests/e2e/massing.spec.ts`): rebuild the program, place two rooms in Zoning, open Massing, see two `[data-room]` groups with faces; click one, switch to Zoning, it is the selected room there; change the ground height to 4 and see the total height and volume change; add a storey on Requirements and see a second height field; NE and SW presets draw the same rooms in a different order (assert on the order of `data-room` groups in the DOM).
4. Performance: projecting and ordering 30 rooms on 3 storeys runs under 4 ms per view change, measured in a Vitest test like `src/views/zoning/performance.test.ts`; a drag to orbit re-renders at that cost, no more.
5. Usability run, done by you through Playwright and described in your report: place the ground floor of the default program in Zoning, open Massing, orbit through the four presets, select a room, set the ground height to 4 m, read the numbers. Say how the mass reads and anything that felt wrong.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids (read it); `src/massing` is pure, `src/views/massing` is React.

## Report

End with: what you built, files touched, the reference cases and their measured numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
