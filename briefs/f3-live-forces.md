# F3: Live forces and the weights beside the bubbles

## Where you work

Worktree `/home/user/cde2-f3`, branch `f3-live-forces`, created from `origin/main` (F1 and F2 merged), dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md` (decisions 3, 6, 7, 9), `PLAN.md` (row F3), `rulebook/forces.md`, `briefs/f2-bubbles-rework.md`, then `src/bubbles/*`, `src/views/bubbles/*`, `src/views/requirements/{RequirementsScreen,WeightsSection}.tsx`, `src/rulebook/index.ts` (tiers per kind), `src/model/types.ts` (`families`), `tests/e2e/bubbles*.spec.ts`, `tests/e2e/requirements.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin f3-live-forces`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the zoning and massing views.

## Why

The owner tested the bubbles: the diagram only moves when Settle is pressed, so bubbles can be piled on top of each other and nothing pushes back; the forces should act while a bubble is dragged, the way a graph view breathes; and the three weights sit on the Requirements screen when they belong beside the diagram they change.

## What changes

1. **The simulation runs while the tab is open.** Replace the run-to-rest-on-Settle loop in `useSettling.ts` with one that advances the simulation every animation frame while anything is moving, and stops scheduling frames when the layout is at rest (energy under the threshold) so an idle tab costs nothing. A drag makes the dragged bubble a pin that follows the pointer each frame; every other unpinned bubble responds in the same frame. On release the run continues to rest and then commits, so a drag plus its aftermath is one undo step, as today. The Settle button becomes "Settle now": it runs the simulation to rest synchronously (for a person in a hurry and for tests). The status text reads "Resting" or "Moving". "Hold in place" stays as it is.
2. **Deterministic still.** Fixed time step, no wall-clock in the physics; the same project with no interaction settles to the same picture every time, asserted by a unit test that builds the state twice and compares every position to 1e-9. A drag is an input, so the picture after a drag depends on the drag; that is expected.
3. **No two unpinned bubbles rest on each other.** Add a positional correction to `step` after the forces: any two bodies closer than the sum of their radii plus the rest gap are pushed apart along their centre line, split by inverse mass (area) with a pinned body taking none of it. A bubble dropped on a pile slides clear within a second at 60 frames a second. Two pinned bubbles left on each other stay, since pinned means the person's hand; say so in a comment.
4. **Spread.** A "Spread" button beside the controls triples the repulsion for one second of simulation time and lets it settle again. Pinned bubbles push others but do not move.
5. **The weights beside the diagram.** Move `WeightsSection` out of the Requirements screen into a panel beside the bubbles sheet (`src/views/bubbles/WeightsPanel.tsx`, reusing the section's slider markup, or move the file to `src/views/weights/` and import it from the bubbles stage; remove it from `RequirementsScreen.tsx`). Labels unchanged: User requirements, Site constraints, Environmental factors. Under the second and third a one-line note: "acts in zoning". The user-requirements weight `w` (0 to 1, middle 0.5 when absent) changes the simulation through `LayoutConfig`: spring stiffness scaled by `0.5 + w`, and repulsion between two rooms of different privacy tiers scaled by `1 + w` (a public room and a private room push apart harder as the weight rises; rooms of the same tier or an exempt tier are unaffected). `BubbleRoom` gains `tier` from `roomTypeById` in `BubblesStage`. A reference case as a unit test: two rooms of different tiers at rest sit farther apart at `w = 1` than at `w = 0`, and the same two rooms of one tier sit at the same distance at both.
6. **Tests to move.** The Playwright step in `requirements.spec.ts` that moves the Site constraints slider moves to `bubbles-stage.spec.ts`; the requirements test no longer expects the Weights section.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass; the existing bubbles tests pass, with "Settle" reads changed to "Settle now" and "Settled" to "Resting" where they assert on those words.
2. Unit tests: determinism; the correction step (two overlapping unpinned bodies separate to exactly the rest distance in a bounded number of frames; a pinned one does not move); the tier reference case; Spread returns the config to normal after one second of simulation time; the frame loop stops scheduling when at rest (test the hook's scheduling through a fake `requestAnimationFrame`).
3. Playwright: drag a bubble into a neighbour and, while the pointer is still down, the neighbour's position has changed; drop a bubble on a pile and within 1.5 s no `[data-room]` circle overlaps another by more than a pixel; Spread moves a tight cloud apart; the weights panel is on the Bubbles tab and not on Requirements; the Site constraints slider change survives a reload; raising User requirements to 1 and pressing Settle now moves the Diwaniya farther from the Master Bedroom than at 0.
4. Performance: one simulation frame with 30 bubbles and 30 links, forces plus correction, under 1 ms in a Vitest test like the existing performance tests; the tab schedules no frames while resting (assert on the fake).
5. Usability run, done by you through Playwright and described: rebuild on two storeys, open Bubbles, drag the Kitchen through the cloud and watch it part, drop it on the Diwaniya and see it slide off, press Spread, move the user-requirements slider and watch the diagram tighten, then Settle now. Say what felt wrong.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms.

## Report

End with: what you built, files touched, the test numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
