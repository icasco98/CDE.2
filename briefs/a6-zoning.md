# A6: Zoning

## Where you work

Worktree `/home/user/cde2-a6`, branch `a6-zoning`, already created from `origin/main` with `node_modules` installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`, `PLAN.md` first, then `src/geometry/index.ts`, `src/model/actions.ts`, `src/model/store.ts`, `src/app/*`, `src/views/bubbles/*`, `src/rulebook/index.ts`, `tests/e2e/*`. Never read anything outside this worktree.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Every message is prose saying what changed and why, and ends with these two lines:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin a6-zoning`. Do not open a pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md` or `tests/guard.test.ts`.

## Goal

The Zoning tab shows one storey of the plot in plan, in metres, and lets a person place, move, rotate, resize and carve the rooms by hand over the graph that the requirements and bubbles stages already hold. The graph is the truth: nothing on this canvas ever creates, removes or changes an edge except an explicit connect or disconnect by the person. `MODEL.md` sections "Walls and forces", "The four stages", "Derived", "Operations" are the specification; if anything here contradicts it, stop and say so.

## What the screen does

**Sheet.** An SVG in sheet metres (y down), like the bubbles view. It draws: the plot polygon; the plot's street sides drawn heavier and labelled "street"; a north arrow from `plot.north`; a scale bar (1 m ticks, 5 m label); a 0.25 m grid faint inside the plot. When `plot.on` is false the plot is drawn thin and dashed and constrains nothing.

**Storeys.** One storey shown at a time; a storey switcher (buttons "Ground", "First", ... from `project.storeys`). Footprints of the storey below draw as a faint ghost outline. A room with `storeysSpanned > 1` appears on every storey it spans, at the same footprint.

**Tray.** Rooms on the current storey with no footprint are listed beside the sheet with name and target area. Dragging one onto the sheet places it: a rectangle of `targetArea` with the proportion from the room type (`roomTypeById(type).proportion`; midpoint of the range, or 1.25 : 1 where the proportion is free), rotation 0, centred at the drop point, snapped to the grid, shifted inside the plot when `plot.on`. If it would overlap a room on that storey the drop is refused and said aloud through `session.say`. A placed room has an "Unplace" action (`actions.unplace`) that returns it to the tray.

**Move.** Drag a placed room. During the drag call `actions.place(id, footprint, 'preview')`; on release `'commit'`, so one drag is one undo step. Snap the moved outline to the grid and to neighbour walls within 0.5 m using `snapToGrid`, `wallSnapOffset` and `nearestNeighbourPoint`. When `plot.on`, clamp inside the plot with `shiftFootprintInside`. A release that overlaps another room on the storey is refused: the room returns to where the drag started and the refusal is said aloud. Snapping and clamping never touch an edge.

**Rotate.** A rotation handle above the selected room turns it freely about its centre, snapping to 15° steps (Shift for free angle). A "Rotate 90°" button and the `R` key turn the selected room a quarter turn. Same preview and commit rule, same overlap refusal.

**Resize.** Eight handles on the selected room's local frame, using `anchorPointOf`, `resizeFromAnchor` and `limitResize`; the opposite side stays put. The label shows the live area against the target ("23.5 of 24 m²"). Same preview, commit, snapping, clamping and overlap refusal. A resize below the type's `minArea`, or below the Municipality minimum width for its kind if the table carries one, is allowed but the label turns to a warning; this is a hand tool, not a checker.

**Carve.** Hold `Alt` while dropping a room over others: the dropped room is the cutter and each room it overlaps is carved with `carveFootprint`. Refused, with the reason said aloud, if any carved room would split into two pieces or vanish, or if a carved room is pinned. Carving changes footprints only.

**Pin.** A pin toggle on the selected room calls `actions.pin` and `actions.unpin`. A pinned room cannot be moved, rotated, resized or carved by another room; the attempt is said aloud.

**Doors from edges.** For every edge on the current storey whose two rooms are placed and share a wall (`sharedWalls`, tolerance 0.05 m), draw a door mark at the midpoint of the longest shared wall. An `open` edge draws as a gap in that wall rather than a leaf. The `main-door` edge from `EXTERIOR` draws on the room's outline at the point nearest a street side of the plot. If an edge has a `hint` and the hint lies on a shared wall within 0.1 m, draw the door there instead.

**Tension.** An edge on this storey whose two rooms are placed but do not share a wall draws as a dashed line between the two centroids, in one distinct colour, with the edge kind as a tooltip. It is a warning on the drawing and nothing else.

**Proposed edges.** Two placed rooms on the storey that share a wall of at least 0.9 m and have no edge between them show a faint "+" at that wall's midpoint. Clicking it calls `actions.connect({ a, b, kind: 'door', storey })`. Nothing ever connects without that click. Do not compute or store any adjacency graph; derive the marks each render from footprints and edges and nothing else.

**Disconnect.** Clicking a door mark selects the edge; the `Delete` key or a "Disconnect" button calls `actions.disconnect`.

**Selection.** Clicking a room selects it; clicking empty sheet clears. Move the selected id out of `BubblesStage` local state into a small module `src/app/selection.ts` (an external store with `subscribe`, `get`, `select`, read through `useSyncExternalStore`) so the bubbles and zoning stages share one selection. A room selected in one tab is selected in the other. This is the only change to the bubbles stage.

**Labels.** Each footprint shows its name and its live area; when the area is more than 10% off target, the number is styled as a warning.

## Files

- `src/views/zoning/`: `ZoningStage.tsx` (wires the store, like `BubblesStage`), `ZoningView.tsx` (the sheet, thin), `parts.tsx` (footprint, handles, door, tension, proposal, north arrow, scale bar), `gestures.ts` (pure: move, rotate, resize, carve, drop; every function takes footprints and returns a footprint or a refusal, no React), `doors.ts` (pure: door marks, tensions and proposals from footprints and edges), `defaults.ts` (pure: the starting rectangle for a room type and area), `frame.ts` (viewBox and pointer to sheet metres; share with the bubbles view if it fits, otherwise its own), `types.ts`, `zoning.css`.
- `src/app/selection.ts` and the two-line change in `BubblesStage.tsx`.
- `src/app/stages.ts`: the zoning entry.
- Unit tests beside every pure file. `tests/e2e/zoning.spec.ts`.
- Add to `src/geometry` only what the gestures need and nothing has; with tests; export it from `index.ts`. `placeInFrame` in `footprint.ts` may need exporting.

Reuse the geometry module for every calculation. Do not re-implement polygon booleans, overlap, clamping or snapping in the view.

## Definition of done

1. Every gesture has a Playwright test: place from tray, move, rotate by handle, rotate 90°, resize, carve with Alt, refuse an overlapping drop, pin refuses a move, accept a proposed door, disconnect a door, switch storey, unplace, undo restores the footprint after a move. Each test asserts on the store's state through the DOM (`data-room`, `data-edge`, `data-proposal` attributes and the area label), not on pixels.
2. A unit test proves that a full sequence of move, rotate, resize and carve through the store leaves `project.edges` deeply equal to what it was.
3. A unit test proves that footprints on one storey never overlap after any accepted gesture, over a seeded random sequence of a thousand gestures on twelve rooms.
4. Accuracy reference cases: a 24 m² Bedroom placed for a type with proportion 1.2 : 1 has a 5.37 × 4.47 m rectangle snapped to 5.5 × 4.5 (say what your rounding rule is and test it); a room rotated 90° keeps its area to 1e-6; a carve of a 4 × 4 room by a 2 × 2 room centred on one edge leaves 14 m²; two rooms 5 × 4 placed at x 0 and x 5 on the same y share a 4 m wall and produce one proposal.
5. Performance: a pointer move with 30 placed rooms on the storey runs the pure gesture path (snap, clamp, overlap test) in under 2 ms, measured in a Vitest test like `src/geometry/performance.test.ts`; the sheet re-renders only the dragged room's group during a drag (memoised parts, verified by a React render-count test or by reasoning stated in a one-sentence comment on the memo).
6. `npm run check`, `npm run test:e2e` and `npm run build` pass.
7. The usability action, done by you in the running app through Playwright and described in your final report: rebuild the program from the household, place all ground-floor rooms of the default program inside the 20 × 25 plot, rotate one, resize one, carve one, accept one proposed door. Report how many gestures it took and anything that felt wrong.

## Standards

Usability: the actions above work in the app, not only in tests. Accuracy: the four reference cases. Performance: the 2 ms budget. Tidiness: comments explain a decision in one sentence, never history; export only what another file imports; no dead code; no synonyms for rooms, edges, walls, forces, storeys, plot, project. Never introduce the names the guard test forbids; read it before naming anything.

## Report

End with: what you built, files touched, the reference cases and their measured numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
