# G3: One Plan tab

## Where you work

Worktree `/home/user/cde2-g3`, branch `g3-plan-tab`, at `origin/main` with G0, G2 and G4 merged, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md` (16), `PLAN.md` (row G3), `briefs/a7-massing.md`, `briefs/a12-zoom-pan.md`, `briefs/g0-zoning-gestures.md`, `briefs/g4-joins-alignment.md`, then `src/app/{stages.ts,Shell.tsx,selection.ts}`, `src/styles.css`, `src/views/zoning/*`, `src/views/massing/*`, `src/massing/*`, `src/views/camera.ts`, every file under `tests/e2e`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you; you own every view file.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin g3-plan-tab`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model.

## Why

The owner wants zoning and massing on one page, editable from either, and found the massing's orbit swings the mass instead of turning it. Two things G4 found belong here too: opening a door on the zoning sheet needs a trip to the Bubbles tab, and an open edge cannot be picked on the sheet.

## What changes

1. **One Plan tab.** In `src/app/stages.ts` the Zoning and Massing entries become one entry `{ id: 'plan', label: 'Plan' }` whose component, `src/views/plan/PlanStage.tsx`, shows the zoning stage on the left and the massing stage on the right, side by side. A split handle between them drags the ratio (view state, remembered in `localStorage` under one key, default 60/40); three buttons above, "Sheet", "Both", "Massing", set the ratio to 100/0, the remembered value, 0/100. Each half keeps its own bar (the zoning bar with Lay out from bubbles and the gestures; the massing bar with the presets). At phone width the halves stack.
2. **One storey.** The storey in view moves from `ZoningView` local state to `PlanStage` and is passed down to both halves. The massing draws every storey as today but lights the prisms of the storey in view and dims the others slightly (`data-storey-lit`); its storey buttons are the same control as the sheet's, so both halves switch together. Selection is already shared.
3. **Editing in the massing.** Drag a prism's top face to move the room in plan: the pointer is projected back onto the room's floor plane (invert the parallel projection at the storey's floor height; a pure function with a test), the delta goes through `moveFootprint` from the zoning gestures with the same neighbours, snapping and plot clamp, previewed each frame and committed on release. A drop over a neighbour in the massing is refused and said, not asked (the prompt lives on the sheet). A rotation handle above the selected prism's top face turns the room with `rotateFootprint`, 15° steps, Shift free. Resize, carve, walls and joins stay on the sheet.
4. **The orbit.** Pivot about the centre of the placed mass's bounding box, or the selected room's centre when one is selected; the frame is held during a turn as today. Vertical drag tilts the elevation between 10° and 89° (a new `elevation` in `View`, the constant becoming the default); a "Plan" preset sets 89° looking straight down with north up; the four compass presets keep 30°. Wheel and pinch zoom about the pointer through the shared camera (`src/views/camera.ts`, adapted or extended), plus Fit. A unit test proves the projected pivot point does not move across azimuths and elevations.
5. **Door kind on the sheet.** A selected door on the zoning sheet shows a "Make it open" / "Make it a door" button on the bar (through `setEdgeKind`, via a new optional `onSetEdgeKind` prop wired in `ZoningStage`). An open edge inside a join draws a thin dotted line along the vanished wall, carrying `data-edge`, so it can be picked and disconnected or turned back into a door.
6. **Tests.** Every Playwright test that clicks the Zoning or Massing tab now clicks Plan (and presses "Sheet" or "Massing" where a test needs one half full width). New tests: moving a prism in the massing moves the footprint on the sheet in the same frame (compare the sheet's polygon points before and after while the pointer is down); a drop over a neighbour in the massing is refused; rotating in the massing changes `data-rotation` on the sheet; the split buttons; the storey buttons switch both halves; tilt to Plan shows north up (assert the north mark's direction); the pivot holds while orbiting (the selected room's projected centre stays within 1 px); wheel zoom on the massing; door kind toggled on the sheet and an open edge picked on the sheet.
7. **Performance:** the massing drag path (unproject, move, reproject) under 4 ms with 30 rooms on 3 storeys, in a Vitest test; orbit unchanged.

## Definition of done

`npm run check`, `npm run test:e2e`, `npm run build` pass; the tests in 6 and the measurement in 7; a usability run through Playwright, described: rebuild on two storeys, Lay out from bubbles, in the massing drag the Diwaniya to the street side, tilt to Plan and back, select a bedroom and orbit, open the living to the dining from the sheet. Say what felt wrong. Tidiness as always: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms.

## Report

End with: what you built, files touched, the test numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
