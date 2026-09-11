# A8: Export, PDF to scale and DXF

## Where you work

Worktree `/home/user/cde2-a8`, branch `a8-export`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md` (11: PDF and DXF are produced in the browser, no server), `PLAN.md` (row A8), `briefs/a6-zoning.md`, `briefs/a7-massing.md`, then `src/app/{files.ts,Shell.tsx,session.ts}`, `src/geometry/index.ts`, `src/model/types.ts`, `src/views/zoning/{doors.ts,defaults.ts,frame.ts}`, `src/massing/numbers.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. Other tasks run beside you in `src/views/zoning`, `src/views/massing`, `src/views/bubbles` and `src/bubbles`; touch none of those. Your files are new under `src/export/` plus the buttons in `src/app/Shell.tsx` (or a small `src/app/ExportMenu.tsx`).

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin a8-export`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model. Add no dependency: both formats are written by hand, which keeps the repository at its one runtime library.

## Goal

Two buttons in the shell, "Export PDF" and "Export DXF", produce files in the browser from the project as it stands. A printed sheet measures true at its stated scale. The DXF opens in AutoCAD with a layer per storey.

## PDF

- `src/export/pdf.ts`: a minimal PDF writer, hand-written: one document, pages, a content stream of paths (move, line, close, stroke, fill), text in Helvetica, line widths, dash patterns, and a correct cross-reference table. Points are the unit: 1 pt = 1/72 inch = 0.3528 mm. Unit-test the writer on a two-line document by parsing the bytes back (offsets in the xref table match the object positions; the trailer's size is right).
- `src/export/sheet.ts` (pure): the drawing of one storey: plot polygon with street sides heavy, every placed footprint as a closed path with its name and area, doors from edges as a gap in the shared wall, a north arrow, a scale bar, and a title block: project name, storey label, scale, date, and the envelope numbers from `src/massing/numbers.ts` for the whole house. One page per storey plus one page for the massing numbers table. Paper A3 landscape at 1:100 by default; A3 at 1:200 when the plot does not fit at 1:100 (say the rule). The drawing sits in a frame with a 15 mm margin; the title block along the bottom.
- The scale must be exact: at 1:100 a 20 m plot edge is 200 mm on paper, 566.93 pt. Reference case as a unit test: the content stream for the starting 20 × 25 m plot at 1:100 contains a path whose coordinates differ by exactly 566.93 pt in x and 708.66 pt in y, to two decimals; at 1:200, half.
- Text is Helvetica at fixed point sizes (title 14 pt, labels 8 pt, numbers 9 pt); room names are centred in their footprint's bounding box; a name longer than its room is drawn anyway (the reader can see the room).

## DXF

- `src/export/dxf.ts`: an ASCII DXF R12 (AC1009) writer, hand-written: HEADER with `$INSUNITS` 6 (metres) and `$EXTMIN`/`$EXTMAX`, TABLES with a LAYER table, ENTITIES with `POLYLINE`/`VERTEX`/`SEQEND` closed polylines (R12 has no LWPOLYLINE), `LINE`, `TEXT`, and `ARC` (so a later task can write true arcs; write one unit test that an ARC entity round-trips through your own reader of the group codes). Layers: `PLOT`, and per storey `S0-ROOMS`, `S0-DOORS`, `S0-TEXT` (S1, S2, …), plus `NORTH`. Colours by layer (plot 7, rooms 3, doors 1, text 8).
- Coordinates in metres, y up: the tool's sheet has y down, so flip about the plot's bounding box so the plan reads the same way as on screen with north as drawn. State the transform in one comment and test it: the starting plot's four corners land at (0,0), (20,0), (20,25), (0,25) in DXF space.
- Room outlines as closed polylines on the storey's rooms layer; the name and area as TEXT at the centroid, height 0.3 m; doors as a LINE across the opening on the doors layer; the plot as a closed polyline on PLOT; the north arrow as two LINEs on NORTH.
- Reference case as a unit test: a project with one 5 × 4 m room at (2, 3) on the ground produces exactly one POLYLINE with four VERTEX entries at the right coordinates on `S0-ROOMS`, one TEXT on `S0-TEXT`, and the file starts with `0\nSECTION\n2\nHEADER` and ends with `0\nEOF\n`.

## The buttons

- In the shell beside "Save file": "Export PDF" and "Export DXF", each producing a download named after the project (`<name>.pdf`, `<name>.dxf`) through the same mechanism `downloadJson` uses (generalise it to `downloadBlob(name, blob)` in `files.ts`). Exports read the store as it is; nothing is written to it. When no room is placed on any storey, the buttons still work and the sheet says "No rooms placed" in the drawing area, so the person sees something rather than a refusal.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. The reference cases above as unit tests: the PDF scale to two decimals at 1:100 and 1:200, the xref offsets, the DXF corner transform, the one-room DXF, the ARC round-trip.
3. Playwright (`tests/e2e/export.spec.ts`): rebuild, place two rooms in Zoning, press Export PDF and Export DXF, and check each download (Playwright's download API) has the right name and starts with `%PDF-` / `0\nSECTION`; parse the DXF text for the two room polylines on `S0-ROOMS`.
4. Accuracy check you perform and describe: open the PDF in Chromium through Playwright, render page 1 to an image at a known DPI, and measure the plot edge in pixels against the expected millimetres; report the measured scale error (it should be under 0.5%).
5. Performance: writing the PDF and the DXF for 30 rooms on 3 storeys under 50 ms each, measured in a Vitest test.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; the writers are pure functions from a project to bytes or text.

## Report

End with: what you built, files touched, the reference cases with their measured numbers, the measured print scale error, the performance measurement, and anything you decided that the brief left open.
