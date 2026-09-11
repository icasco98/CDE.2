# A12: Zoom and pan on the zoning sheet

## Where you work

Worktree `/home/user/cde2-a12`, branch `a12-zoom-pan`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `PLAN.md` (row A12), `briefs/a6-zoning.md`, then `src/views/zoning/*`, `tests/e2e/zoning.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. Another task (A7 massing) is running beside you in `src/massing`, `src/views/massing`, `src/model` and `src/app/stages.ts`; touch none of those.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin a12-zoom-pan`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md` or `tests/guard.test.ts`.

## Goal

The zoning sheet always shows the whole plot, so a 6 m² ensuite's label cannot be read. Add zoom and pan so any room can be read and worked on close up, without breaking a single gesture.

## What changes

- **Camera.** View state in `ZoningView` (never project state): a scale and an offset over the fit extent from `frame.ts`. `viewBoxOf` takes the camera. A `Fit` button returns to the whole plot; the sheet opens fitted, and refits when the plot changes size, never when a room moves.
- **Wheel zoom** about the pointer: the metre under the pointer stays under the pointer. Zoom between fit and 8× fit, in steps that feel smooth (a multiplicative factor per wheel notch, say 1.1). Ctrl+wheel and trackpad pinch (which arrives as wheel with `ctrlKey`) zoom the same way; the page never scrolls while the pointer is over the sheet.
- **Pinch** on touch: two pointers on the sheet zoom about their midpoint and pan with it.
- **Pan**: drag on empty sheet (not on a room, handle, door or proposal) pans; so does Space held with any drag, and the middle button. Panning never selects or clears the selection; a click without movement on empty sheet still clears it as today.
- **Keyboard**: `+` and `-` zoom about the sheet centre, `0` fits.
- **Labels and marks keep their size on screen.** Room labels, the area line, handles, door marks, proposal marks, the north arrow and the scale bar are drawn in screen pixels, not sheet metres, so zooming in makes the room bigger and the text readable, and zooming out never makes handles huge. Use a `vector-effect: non-scaling-stroke` for lines and a per-zoom font size or a counter-scaled group for text and marks; state which in one comment. The scale bar keeps its screen length and relabels itself (5 m, 2 m, 1 m, 0.5 m) so it stays honest.
- **Gestures unchanged.** `pointerAt` already maps through the screen matrix, so move, rotate, resize, carve, drop from the tray, proposals and doors must work at any zoom without modification; where a hit target or a snap reach was in metres and should feel constant on screen (handle size, the proposal "+", the tray drop), make it screen-sized and say so.
- **Tray drop while zoomed**: dropping a room from the tray onto a zoomed sheet lands where the pointer is.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Unit tests for the camera arithmetic: zoom about a point keeps that point fixed (exact to 1e-9); zoom is clamped to [fit, 8× fit]; fit after a zoom equals the original extent; pan then fit equals the original extent.
3. Playwright: wheel over the sheet changes the `viewBox` and keeps the metre under the pointer in place (read the viewBox before and after, compute the point under the pointer, compare to 0.01 m); drag on empty sheet pans and leaves the selection untouched; `Fit` restores the viewBox; the existing zoning tests still pass unchanged; and one new test runs the place, move, rotate, resize and proposal gestures at 3× zoom and asserts the same store results as at fit.
4. Usability: an "Ensuite, Master Bedroom" placed and zoomed to fill a third of the sheet shows its name and "6.0 of 6 m²" at a readable size (assert the label's rendered font size in CSS pixels is at least 12 px at that zoom, and at most 14 px at fit, so it neither vanishes nor balloons).
5. Performance: a wheel event re-renders in under 4 ms with 30 placed rooms (measure as `performance.test.ts` in zoning does for gestures; the camera arithmetic is pure and the room groups are memoised, so a zoom must not re-create the room groups).
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids.

## Report

End with: what you built, files touched, the unit tests' numbers, the performance measurement, the usability check with the measured font sizes, and anything you decided that the brief left open.
