# T2: The zoning sheet over the actions

## Where you work

Worktree `/home/user/cde2-t2`, branch `t2-sheet`, created from
`origin/main` (which holds T1, `src/sheet/`), dependencies linked.
Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`,
`briefs/final-tool.md` (the parent brief; this task is its T2),
`briefs/t1-actions.md`, and every file in `src/sheet/` (the model and
the actions you build on; do not change them except to export a name
you need, and say so in the pull request). Then read, in full, the
frozen mock at `/home/user/blocks-on-the-plot-v57.html`: its HTML
and CSS for the sheet's look, its `render`, `drawLabel`, `drawDims`,
`drawHandles`, the pointer handlers, the menus and `sayLineBase` for
the behaviour. The mock is the specification. Do not copy it into the
repository.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`.
Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

When done, `git push -u origin t2-sheet` and open a pull request
against `main` titled "T2: the zoning sheet over the actions", its
body saying what was built, which user actions the Playwright tests
prove, the measured render time, and anything of the mock left out
and why, ending with "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
and the session URL above. Do not touch `main`, `MODEL.md`,
`DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, `src/geometry`,
`src/model`, `src/bubbles`, `src/zoning`, `src/views/plan`,
`src/views/zoning`, `src/views/bubbles`, `src/views/massing`.

## Goal

The first screen of the final tool: the mock's zoning sheet, in
React, drawing and editing a `Sheet` from `src/sheet/` through its
actions and nothing else. An architect opens the Sheet stage, sees the
embedded ground floor on the plot, drags a room from the program and
drops it where they want; it snaps, lands by the landing rule, and
the sentence updates. Everything in the mock's Zoning step works the
same way; the Openings step, storeys, the mass, the settings window
and storage are later tasks and not here.

## Files

New, under `src/views/sheet/`:

- `SheetStage.tsx`: the stage, registered in `src/app/stages.ts` as
  `{ id: 'sheet', label: 'Sheet' }` between Bubbles and Plan. It owns
  the `Sheet` state (start from `src/sheet` sample, the embedded
  sheet; in memory for this task, no storage) and the undo history
  through the actions; it lays out the mock's page: header line,
  toolbar, behaviour strip, the program column at the left, the sheet
  in the middle, the sentence under it, the legend. The right-hand
  chat and notes column of the mock is not built.
- `SheetView.tsx`: the SVG sheet: grid, plot, buildable line and
  strip, street names, north, rooms (body, walls, name, area,
  spill, lock mark, court hatch), overlaps tinted, boundary walls
  thick with their reading, pockets when shown, guides, snap marks
  and notes, the selection box, the group box, dimensions, handles,
  the turning knob and its degrees, the pivot dot, the measure tool,
  the drawing preview, the reshape bar, the hover tag, the type-in
  box. Wheel zoom about the pointer, middle-drag and Space-drag pan,
  Fit.
- `gestures.ts`: pointer handling as pure state machines over the
  actions: drop from the program, move (with Shift axis lock and the
  group), box-select, wall pull, resize with a shared wall, corner
  drag, turn (knob, group knob, pivot), draw (rectangle, circle,
  polygon; Shift free), reshape, measure, label drag, reorder in the
  program. Each returns the next drag state and the action to apply.
- `menus.tsx`: the right-click menus of a room, a pocket, and an
  empty space, with every row the mock has (turn about this corner,
  quarter turn, face north, mirror, lock, group, combine into,
  reshape, carve below, push others, cut by the setback, colour, back
  to the category colour, put the name back, restore shape, copy,
  send back). Copy and paste (Ctrl+C, Ctrl+V) on the same storey.
- `Program.tsx`: the program column: blocks by target, hollow to
  place, filled to select, grip to reorder, Draw with its shape list,
  the × to remove, add a room (kind, name, size).
- `sentence.ts`: the mock's `sayLineBase` for the Zoning step, from
  `report()`: a list of parts with a `bad` flag, rendered under the
  sheet in a fixed-height line.
- `keys.ts`: the mock's keys: R, Delete, arrows and Shift arrows,
  Shift while moving, M, F, Enter, Esc, Ctrl Z, Ctrl Shift Z, Space.
- `sheet.css`: the mock's CSS for the sheet, its variables mapped to
  the app's; light and dark as the app already does.
- Tests beside each pure file (Vitest) and
  `tests/e2e/sheet.spec.ts` (Playwright).

Storeys: the sheet shows storey 0 only; the storey switch and the
mass are T4. The behaviour strip carries the landing rule and Build to
the boundary as the mock's strip does; the full settings window is T5,
so the other settings keep their defaults.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` green; the
   guard untouched; the existing e2e suite still passes.
2. Playwright, on the embedded sheet, each a named test:
   - Drag the Bedroom block from the program onto the sheet and drop
     it beside Formal Living; it snaps to that wall (guide shown) and
     the sentence's placed area rises by its area.
   - Drop it on Formal Living under Wait: the overlap is tinted and
     the sentence says "1 overlap"; right-click, Carve below: the
     overlap is gone and Formal Living's area fell by it.
   - The same under Push others: Formal Living slides aside, the
     sentence says no overlap.
   - Select the Diwaniya, press R: it turns a quarter; the knob's
     degrees read the mock's value; drag the knob: it locks onto a
     neighbour's angle within 4° and the lock line is drawn.
   - Drag a wall handle of the Kitchen 1 m out: the wall moves alone,
     the room's area reads the new value.
   - Draw a polygon for a new room by clicking four corners, the
     snap note reading "corner" when over one; Enter closes it; it is
     placed at the drawn area.
   - Reshape the Diwaniya with a rectangle across its corner: the
     area drops by the overlap; Esc before Enter leaves it unchanged.
   - Right-click an enclosed empty space: the menu offers the rooms
     that wall it, a court (disabled with the reason when too small)
     and a corridor; give it to a room and the room's area grows by
     the space's area.
   - Click a blue dimension and type a number: the room resizes.
   - M, two clicks: the distance and angle read correctly for a known
     pair of corners.
   - Ctrl+Z after each of the above puts the sheet back.
3. Performance: while a room is dragged across the embedded sheet,
   a frame of the sheet renders in under 16 ms on the test machine
   (measure with `performance.now()` round the React commit, printed
   by the test, failing past double).
4. Every exported name is imported by another file or a test.

## Standards

Usability: the actions above, in the running app. Accuracy: numbers
from `src/sheet`, none computed in a view. Performance: the budget
above. Tidiness: comments only where a decision is not obvious, one
sentence, never history; no names from the guard list; small files,
one responsibility each; the mock's names kept where they are plain
words (rooms, walls, pieces, plot, storey).
