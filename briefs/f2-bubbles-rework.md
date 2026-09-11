# F2: Bubbles rework

## Where you work

Worktree `/home/user/cde2-f2`, branch `f2-bubbles-rework`, created from `origin/main`, dependencies installed. First run `git fetch origin main:refs/remotes/origin/main && git merge --no-edit origin/main` to pick up the model wording this task depends on (MODEL.md: an edge's kind may change in place; dropping a bubble in a band assigns the storey). Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`, `PLAN.md` (rows F2 and F3, so you know what F3 will add after you), `briefs/a5-bubbles.md` if present, `briefs/a12-zoom-pan.md`, then `src/views/bubbles/*`, `src/bubbles/*`, `src/views/zoning/camera.ts` and `camera.test.ts`, `src/views/zoning/parts.tsx` (how marks stay screen-sized), `src/model/actions.ts`, `src/app/selection.ts`, `tests/e2e/bubbles*.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. Another task (F1) runs beside you in `src/rulebook`, `src/model` and `src/views/requirements`; you may add one action to `src/model/actions.ts` (below) and nothing else there.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin f2-bubbles-rework`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`.

## Why

The owner tested the bubbles tab and could not zoom, delete, or see how to link two rooms; a bubble dragged into another storey's band kept its storey, so the picture could lie; there is no legend. Live simulation and the weights panel are F3, not yours: leave `useSettling` and the simulation's forces as they are.

## What changes

1. **Camera.** Zoom, pan and Fit on the bubbles sheet, the same feel as the zoning sheet: wheel and pinch zoom about the pointer, drag on empty sheet pans, `+`, `-`, `0`, a Fit button; Fit frames every bubble and the bands. Move `src/views/zoning/camera.ts` to `src/views/camera.ts` if it serves both sheets without change, re-pointing the zoning imports; otherwise write the bubbles' own and say why. Bubble labels and marks stay readable: text within an 8 to 14 px band on screen, strokes non-scaling, as the zoning sheet does.
2. **Delete.** With a bubble selected, Delete or Backspace calls `actions.removeRoom` (its edges go with it, as the model says); with a link selected, `actions.disconnect`. A "Delete" button beside the existing controls does the same, labelled "Delete room" or "Delete link" by what is selected.
3. **Linking made visible.** A "Link" button enters link mode: click one bubble, then another, and `onConnect` fires; Escape or a click on empty sheet leaves the mode; the cursor and a one-line hint say what to do. Keep the existing drag-from-the-ring gesture and give the ring a visible handle on the hovered or selected bubble so the gesture can be discovered. The selected link shows its kind and a button that toggles it between `door` and `open`; add `setEdgeKind(id, kind)` to `src/model/actions.ts` (recorded for undo, refused for `main-door`, invariant-checked like `connect`), with a unit test in `store.test.ts` or `actions` tests.
4. **Bands are storeys.** Draw the boundary between bands as a line across the sheet with the storey name at its left ("Ground", "First", …, the same labels as elsewhere). When a drag ends with the bubble's centre in a band other than its room's storey, call `actions.setStorey(id, storey)` (a stair spanning storeys is not moved this way: refuse with a message). Reordering never happens by accident: the drop must land clearly inside the other band, so use the band's middle 80% as the target and snap a drop in the outer 10% back to its own band. A storey filter beside the controls ("All", "Ground", "First", …) dims bubbles and links on other storeys to a faint grey and makes them unselectable; it never hides them.
5. **Legend.** A small legend on the sheet (bottom left, screen-sized): the category colours as `bubbles.css` defines them with the category labels from `categoryLabels`; the pinned mark; the proposal mark; door and open link strokes. Nothing the view does not draw.
6. **Selection** stays through `src/app/selection.ts`. A room removed clears the selection if it was selected.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass; the existing bubbles tests pass unchanged where they still describe the behaviour.
2. Unit tests: the camera arithmetic if you wrote a new one; `setEdgeKind`; the band-drop rule (middle 80% assigns, outer 10% snaps back; a stair refuses).
3. Playwright, one per gesture: wheel zooms and the metre under the pointer holds; pan then Fit restores; Delete removes a selected bubble and its links, Undo brings both back; Delete removes a selected link; Link mode connects two bubbles by two clicks; the ring handle connects by drag; toggling a link's kind changes `data-kind` on the link; dragging a bubble into the First band changes the room's storey in the program table on Requirements; a drop in the outer edge of a band snaps back; the storey filter dims the others; the legend is present and names every category.
4. Usability, done by you through Playwright and described: from a rebuilt program, link the kitchen to the dining room by two clicks, move a bedroom to First by dragging, delete a garage bay, zoom in on the private rooms, read the legend. Report how many gestures and anything that felt wrong.
5. Performance: a wheel notch and a band-drop each re-render in under 4 ms with 30 bubbles, measured as the zoning performance test does.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonym for room, edge, storey.

## Report

End with: what you built, files touched, the test numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
