# T1: Actions, report and model of the zoning sheet

## Where you work

Worktree `/home/user/cde2-t1`, branch `t1-actions`, created from
`origin/main`, dependencies linked. Work only there. Read `CLAUDE.md`,
`MODEL.md`, `DECISIONS.md`, `briefs/final-tool.md` (the parent brief;
this task is its T1) and `rulebook/municipality-private-housing.md`
first. Then read, in full, the frozen mock at
`/home/user/blocks-on-the-plot-v57.html` (3,900 lines, one file; the
script starts near line 500). The mock is the specification. Do not
copy it into the repository.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`.
Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

When done, `git push -u origin t1-actions` and open a pull request
against `main` titled "T1: actions, report and model of the zoning
sheet", its body saying what was built, what of `src/geometry` was
reused and what replaced and why, and the reference cases, ending with
"🤖 Generated with [Claude Code](https://claude.com/claude-code)" and
the session URL above. Do not touch `main`, `MODEL.md`,
`DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or anything under
`src/views`, `src/app`, `src/bubbles`. Nothing on screen changes in
this task.

## Goal

The zoning sheet's model and every change to it as named, typed, pure
functions, with the report the sentence and the agent read, so that
the screens (T2 to T5), the tests and the layout agent (E1) all drive
the same calls. Behaviour is the mock's, number for number.

## Files

New, under `src/sheet/` (the mock's zoning sheet; `src/zoning` holds
the retired Morph and is left alone):

- `model.ts`: the types. A `Room` as the mock has it: `id`, `name`,
  `kind`, `cat`, `target`, frame `x y w h angle`, `pieces` (convex
  polygons in the frame, or none for the whole rectangle), `storey`,
  `height?`, `lost?`, `doors?` (each `id type w at flip hinge`),
  `locked?`, `group?`, `color?`, `labelAt?`, `placedAt`, `placed`,
  `extra?`, `fixed?`. `Sheet`: `rooms[]` in program order (the order
  of importance), `storeyCount`, `settings`. `Settings` with the
  mock's `DEFAULTS` as defaults and `SETTINGS_V`. The plot as the
  mock's constants for now (`PLOT`, `NORTH`, `BUILD`, the side
  budgets), in `plot.ts`, so T5 can make it data.
- `geometry.ts`: the mock's piece geometry: `tidy`, `facing`, `weld`,
  `clipHalf`, `diffConvex`, `intersectConvex`, `outlineFrom`,
  `partsOf`, `chainWalls`, `simplifyLoop`, `triangulate`,
  `canonicalise`, `normalise`, `pullWall`, `cutBy`, `cutToSetback`,
  `worldWalls`, `worldCorners`, `bboxOf`, `overlapCells`. Reuse from
  `src/geometry` wherever a function there does the same thing to the
  same tolerance; say in the pull request which were reused and which
  the mock's replaced and why. Do not change `src/geometry`.
- `snap.ts`: `snapMove`, `alignWall`, `snapPoint`, `snapAngle`,
  `snapHeight`, `wallCandidates`, `gridRest`, `closeGaps`,
  `nearWalls`, as the mock has them, with the setback and plot lines
  and the storeys below and above as candidates.
- `settle.ts`: `partingMove`, `pushFrom`, `yieldTo`, `giveWay`,
  `settle`, `resolve`, `hold`, `allowedBox`: the landing rules and
  the order of importance.
- `pockets.ts`: `pocketsOf`, `holdsSquare`, `courtWhy`, `givePieces`,
  `roomFromPocket`.
- `doors.ts`: `doorPlace`, `doorAt`, `doorAcross`, `openWall`,
  `slideDoor`, `setDoorWidth`, `walkTest`, and the swing test from
  `drawDoor` (whether a leaf can open) as a pure function.
- `labels.ts`: `labelPlan`, `spanThrough`, `obstaclesOf`,
  `initialsOf` (pure; returns where and how large the name is drawn).
- `actions.ts`: every action in the table of `briefs/final-tool.md`,
  each `(sheet, input) => { sheet, result }` with `sheet` unchanged on
  refusal and `result` carrying what happened in the mock's words
  (where it landed, what was refused and why). Undo and redo as a
  history of sheets, capped at 200, as the mock's stacks.
- `report.ts`: `report(sheet, storey)`: the mock's `sheetReport`
  plus everything `sayLineBase` prints: placed of asked, ratio line,
  open to below, overlaps, spills, boundary used per side with the
  budget, shortfalls, courts, pockets, the walk, hallway door counts,
  entry and diwaniya doors, doors that cannot open. Plain data, no
  strings assembled for the screen.
- `sample.ts`: the mock's `EMBEDDED` sheet as data, and `PROGRAM`,
  `KINDS`, `KIND_INFO`, `DOOR`, `sizeFor`, `freshRooms`.
- `index.ts`: exports only what another file imports.

Tests beside each file, Vitest.

## Definition of done

1. `npm run check` green; the guard untouched.
2. Every action has a unit test on the embedded sheet or a small
   fixture, and every refusal has one.
3. Reference cases, each a test with the numbers in its name:
   - The embedded sheet's report on the ground storey: 352.2 m²
     placed of 305 asked; west boundary 13 of 12.5 m; north 7.8 of
     10; side street (east) 5.5 of 12.5; street 0 of 10; walk 17 of
     17 reached; Ground Hallway serves 7 doors, service hallway 4.
   - A 5.38 × 7.16 room turned 25° cut by a 3 × 3 room standing over
     its corner loses exactly the overlap area (computed
     independently by clipping), and `restore` gives it back.
   - A 0.9 m door placed on a 2.6 m wall at 0.4 from the corner sits
     0.15 m (the jamb) from that corner; on a 1 m wall it is refused
     with the mock's sentence.
   - `snapMove` of a 4 × 3 room dropped 0.3 m from a neighbour's wall
     lands on that wall; dropped 0.5 m away it rests on the grid.
   - `pushFrom` of a 4 × 4 room dropped on the middle of a 6 × 6 room
     under Push slides the lower room by the least parting move.
   - `snapHeight`: a room on the ground with storeys of 3.5 pulled to
     3.6 reads 3.5 "the floor above"; the stair unset reads 7 and
     stops at 18.
   - `pocketsOf` on the embedded sheet finds the same enclosed spaces
     the mock finds (count and areas to 0.1 m²).
4. Performance: `report` on the embedded sheet under 5 ms and
   `pocketsOf` under 20 ms on the test machine, measured in a test
   that prints the numbers and fails past double the budget.
5. Every exported name is imported by another file or a test.

## Standards

Usability: none on screen in this task. Accuracy: the reference cases
above. Performance: the budgets above. Tidiness: comments only where a
decision is not obvious, one sentence, never history; no names from
the guard list; small files; the mock's variable names kept where they
are plain words (`rooms`, `walls`, `pieces`, `storey`, `plot`).
