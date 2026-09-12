# Z1: The plot under the bubbles

## Where you work

Worktree `/home/user/cde2-z1`, branch `z1-task`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md` (the Room row, the invariants, stages 2 and 3), `DECISIONS.md` (17 to 21), `PLAN.md` (row Z1), `rulebook/municipality-private-housing.md` (Setbacks), `rulebook/default-connections.md`, `briefs/f2-bubbles-rework.md`, `briefs/f4-stair-twins.md`, `briefs/g1-hallways.md`, then `src/bubbles/*`, `src/views/bubbles/*`, `src/views/camera.ts`, `src/views/zoning/{frame.ts,parts.tsx}` (the plot, north arrow and scale bar as zoning draws them), `src/views/requirements/ProgramSection.tsx` (the totals line), `src/rulebook/{defaultConnections,proposals}.ts`, `src/model/{types,persistence,actions}.ts`, `tests/e2e/{bubbles,bubbles-stage}.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin z1-task`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`. The model changes named below are the only model changes; `MODEL.md` already describes them.

## Why

Bubbles floating on a blank page tell the designer nothing, and the site forces have nowhere to act. Decision 17 puts the bubble diagram on the plot at the zoning scale, so a bubble and the zone it becomes are one point. This task builds the ground for Z2 (forces on the plot) and Z4 (the morph); it does not build the forces or the morph.

## What changes

1. **Bubble position is plot metres.** `Room.bubble` is `{x, y}` in the plot's frame, the same frame as a footprint. `PROJECT_VERSION` goes to 6 with a migration: an old bubble's band coordinates are mapped into the storey's buildable area proportionally (x across its width, y down its depth); a project with no bubbles is unchanged. The simulation (`src/bubbles/simulation.ts`) works in that frame: bodies are held inside the buildable polygon (a bubble that would cross it is pushed back, radius included), not inside bands. Bands, `bandOf`, `bandHeightFor`, `twinY`, `src/views/bubbles/bands.ts` and the drop-in-band gesture go. Storey pull goes with them.

2. **One plot per storey.** The Bubbles sheet draws, through the same parts zoning uses, the plot with its street sides, the north arrow, the scale bar, and the **buildable line**: the plot offset inward by the Municipality setbacks from `rulebook/municipality-private-housing.md` (plots under 750 m²: 2 m on the street sides, 1.5 m on the others; 750 m² and above: 3 m and 2 m; the sight-angle rule is out of scope). Put the offset in a new `src/rulebook/setbacks.ts` that returns the buildable polygon for a plot, with its own tests on a rectangle, an L, and a corner plot with two streets. The storey group (All, Ground, First, as today) chooses which storey's bubbles are drawn on the one plot; **All** draws the ground storey's bubbles in full and every upper storey's faint (a class, not a second colour), in storey order. A room changes storey from the program screen or a button on the selected bubble ("To First", "To Ground"; a stair refuses with `STAIR_STAYS`'s sentence). A stair spanning storeys has one position and is drawn on each storey it reaches at that point, moving as one; keep `twinsOf` for that.

3. **One camera for both sheets.** The bubbles sheet and the zoning sheet frame the same plot with the same `extentOf(plot, …)` and share one camera state, so switching from Bubbles to Plan shows the same view at the same scale, and zoom, pan and Fit on either sheet carry to the other. Put the shared camera where both views can reach it (`src/views/camera.ts` or a small store beside it), not in either view's local state. Zoning's own behaviour does not change otherwise.

4. **Default connections are real edges.** Rebuild program from household, and Add room, create the rulebook's default connections as edges (kind from the table) rather than as proposals; the designer removes what is not wanted with Disconnect or Delete. The proposals list under the sheet and "Accept all proposals" go; each edge keeps its rulebook sentence (`connectionSource`) as the link's title, and a removed default connection is not offered again in that project (a removed pair is remembered in view memory per project, cleared on New project). Keep `proposedConnections` only if zoning still uses it for the touch-and-propose gesture; otherwise remove it and its tests.

5. **Readable.** Labels never overlap: a bubble draws its name inside only when the name fits its diameter at the current scale; otherwise it draws a short mark (the first letters) and shows the full name on hover and while selected. The legend stands outside the sheet, in the side column with the weights, not over the drawing. Door and open links read differently: door a single line, open a double line, main door with a small square at the outside end, the same marks the zoning sheet uses for doors if it has them.

6. **The fit line.** Under the bubbles sheet, one line per shown storey: "Ground: 292 m² of targets on 365.5 m² buildable · fits, 73.5 m² to spare" or "· over by 33 m²" in the warning colour. The same sentence stands on the Requirements totals line beside the storey totals, computed from the same function in `src/rulebook`. This is a fit of targets against area, not a layout.

7. **Keep** Settle now, Spread, Fit, Link, Hold in place, Delete, Add hallway and the weights panel as they are. The "acts in zoning" labels on the site and environmental weights stay until Z2.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass. Existing bubbles tests updated where they depended on bands; nothing else in the suite changes.
2. Unit tests: the setback offset on three plots; the migration of a v5 project with bubbles in bands to v6 in plot metres; containment inside the buildable polygon (a body started outside comes to rest inside, radius included); the fit sentence for a storey that fits and one that is over; default connections created as edges by rebuild and by Add room, and a removed one not recreated.
3. Playwright: (a) the plot's rectangle has the same bounding box on the Bubbles sheet and the Plan sheet at the same zoom, and a zoom on one is seen on the other; (b) a bubble dragged past the buildable line comes to rest inside it; (c) the legend's box intersects no bubble's box after settling; (d) on a plot too small for the program the fit line reads "over by" before any bubble is moved, on both screens; (e) All shows the first storey's bubbles faint over the ground and a stair is drawn at one point on both storeys; (f) after Rebuild program the default connections are edges and the proposals list is gone; (g) the name of a 3 m² room is not drawn inside its bubble at fit zoom and appears on hover.
4. Usability run through Playwright, described in the report: new project, rebuild, add a storey, move three bedrooms upstairs, zoom into the ground plot, drag the diwaniya to the street corner, switch to Plan and back. Count gestures, say what felt wrong, list anything a person would need explained.
5. Performance: settle under 2 s for 30 rooms (existing test, now inside the polygon); the pointer-move path under 2 ms.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms for one thing; nothing left of the bands.

## Report

Push, then report: what changed by file, the numbers from the checks, the usability run, and anything you decided that the brief left open.
