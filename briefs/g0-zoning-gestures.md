# G0: Zoning gestures made honest

## Where you work

Worktree `/home/user/cde2-g0`, branch `g0-zoning-gestures`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `PLAN.md` (row G0), `briefs/a6-zoning.md`, `briefs/a12-zoom-pan.md`, then `src/views/zoning/*`, `src/geometry/{carve,boundary,snap,overlap,walls,footprint}.ts`, `src/app/session.ts`, `tests/e2e/zoning.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. Another task (G1) runs beside you in `src/rulebook`, `src/views/bubbles` and `src/views/requirements`; touch none of those.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin g0-zoning-gestures`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model.

## Why

The owner tested zoning and could not find carving, because it hides behind the Alt key, and could not reshape rooms except by resize. The person's three intents when two rooms meet are: land beside it, take its space, or move the wall between them. Each gets a gesture with no key.

## What changes

1. **Rooms are solid.** A drag slides along neighbours and snaps as today. Remove the Alt carve path entirely; a modifier key is never required for anything.
2. **A drop over a room asks.** When a move or a drop from the tray ends with the room overlapping one or more neighbours, the room stays where it landed, drawn as pending (translucent, dashed), and a small prompt appears at the pointer with two buttons: "Carve <neighbour name>" (or "Carve 2 rooms") and "Put back". Carve applies `carveFootprint` to each overlapped neighbour and commits the move; Put back returns the room to where the drag began (or to the tray). Escape and a click anywhere else mean Put back. The prompt is DOM (not SVG) so it is screen-sized and keyboard reachable; give it `data-ask` and the buttons `data-carve` and `data-put-back`. Nothing is written to the store until a choice is made; the pending state is view state.
3. **Refusals stay for the breaking cases only:** a carve that would split a neighbour in two, leave it with a hole, remove it, leave it under its kind's minimum area or the Municipality minimum width (`belowMinimum` in `defaults.ts`), or cut a held room. In those cases the Carve button is disabled with the reason as its title and a one-line note in the prompt, so the person sees why before choosing.
4. **Drag a shared wall.** When two placed rooms share a wall (`sharedWalls`, tolerance 0.05 m), the shared segment gets a grab handle at its midpoint (`data-wall="<a>:<b>"`), visible on hover of either room. Dragging it moves the boundary along the wall's normal: one room grows by a rectangle strip, the other shrinks by the same strip, snapped to the grid, both rotations kept. Stop at the point where the shrinking room would go under its minimum or lose the wall entirely, and show both live areas while dragging. One undo step. Works for rectangular and carved rooms; if either room's outline is not a simple polygon on that wall (the strip would cut it in two), refuse with a sentence.
5. **Restore shape.** A button on the selected room: replace its polygon with the starting rectangle for its kind and target area (`startingRectangle` in `defaults.ts`), centred where the room's centre is, keeping its rotation, held inside the plot. If the rectangle would overlap a neighbour, the prompt from step 2 appears (Carve or Put back) rather than a refusal.
6. **Undo carve.** Each room's outline from before its last carve is kept as view memory (a map from room id to polygon, cleared when the room is unplaced or removed, and on project load). A button "Undo carve" on the selected room restores that outline if it overlaps nothing now; if it would overlap, the prompt from step 2 appears. The button is absent when there is nothing to undo.
7. **Hints.** The one-line hint under the tab reads "Drag a room to move it. Drop it on another to carve. Drag a shared wall to move it." Refusals fade as today.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass. Existing zoning tests updated where they held Alt.
2. Unit tests in `gestures.ts` tests: the wall drag arithmetic (strip added to one, removed from the other, areas conserved to 1e-6); the stop at the minimum; the pending-drop outcomes (carve applied to two neighbours; put back restores the origin); the carve refusals listed in step 3; restore shape and undo carve.
3. The no-overlap invariant test (random gestures on 12 rooms, 1000 steps) extended with wall drags and carve choices, still never leaving two footprints overlapping.
4. Playwright, one per gesture: a drop over a room shows the prompt, Carve carves and the neighbour's area drops, Put back returns the room; Escape puts back; a drop from the tray over a room shows the same prompt; a carve that would split is offered disabled with its reason; dragging a shared wall grows one room and shrinks the other by the same area; Restore shape returns a carved room to its rectangle; Undo carve returns the neighbour's earlier outline; a held room cannot be carved.
5. Usability run through Playwright, described: rebuild, lay out six ground rooms, drop the guest WC onto the diwaniya and carve, move the wall between kitchen and dining, restore the diwaniya, undo the carve. Count gestures, say what felt wrong.
6. Performance: the pointer-move path stays under 2 ms with 30 rooms (existing test), and the wall-drag preview under 2 ms.
7. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms.

## Report

End with: what you built, files touched, the test numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
