# T3: The Openings step and the walk test

## Where you work

Worktree `/home/user/cde2-t3`, branch `t3-openings`, from `origin/main`,
dependencies linked. Read `CLAUDE.md`, `MODEL.md` (an edge is explicit
and stored; a door is the drawing of an edge), `DECISIONS.md`,
`briefs/final-tool.md` (this task is its T3), `briefs/t1-actions.md`,
`briefs/t2-sheet.md`, `briefs/t4-storeys-mass.md`, and all of
`src/sheet/` and `src/views/sheet/`. The door geometry, the walk test
and every door action are already in `src/sheet/doors.ts` and
`src/sheet/actions.ts` from T1, tested: build the step over them and
add to them only what is missing. Then read, in full, the frozen mock
at `/home/user/blocks-on-the-plot-v57.html`: `startDoorMode`,
`doorModeClick`, `beginDoorSlide`, `doorControls`, `drawDoor`,
`openWall`, `renderDoorCtx`, the Openings toolbar, the `.openings`
CSS, and the door part of `sayLineBase`. The mock is the
specification. Do not copy it into the repository.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: push `t3-openings` and open a pull request against `main`,
"T3: the Openings step and the walk test", ending with "🤖 Generated
with [Claude Code](https://claude.com/claude-code)" and the session
URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`,
`tests/guard.test.ts`, `src/geometry`, `src/model`, `src/bubbles`,
`src/zoning`, `src/views/plan`, `src/views/zoning`, `src/views/bubbles`,
`src/views/massing`.

## Goal

The owner switches to Openings, clicks a wall, and a door lands on it;
the plan says which rooms can be reached and which cannot.

## What to build

The segmented switch at the top left, Zoning · Openings (Z and O; Esc
never changes step). In Openings: rooms fade to outlines, every click
is about a wall or a door, the program column becomes a room list
without areas and clicking a room lights its walls.

The toolbar: Door, Double door, Sliding door, Opening, Open wall,
Street door, Double street door, with a width field; a selected door's
controls beside them (Swing, Hinge, − width +, Remove). Arm a type,
click a wall, the door lands a jamb from the corner or at the middle.
Click near a door to select it; drag to slide it along its wall, and a
metre off the wall it comes free for another wall. F swings, H or
Space moves the hinge, Delete removes, arrows slide it a grid step.
Right-click a door for swing, hinge, remove.

The rules the mock holds: a shared wall takes one door for both rooms;
a wall on the plot boundary takes none; a wall facing what is open to
below takes none; Open wall takes out only the stretch two rooms
share, never past a corner, one opening per neighbour; a door whose
wall moved away is drawn as a red ring, put back on the nearest wall
or removed; a door whose leaf cannot open is drawn in the warning
colour.

The sentence in this step: walk reached of total, unreached rooms, an
entry without an outside door, a diwaniya without a street door, each
hallway's door count, a door that cannot open. Upstairs the walk
starts from the stair.

Doors are drawn in the mass as they are on the sheet only if the mock
does so; it does not, so leave the mass alone.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` green; the
   existing suites unchanged in what they check.
2. Playwright, each named, on the embedded sheet: arm a Door and click
   the Kitchen's wall to the Dining Room — one door appears and serves
   both; click a wall on the plot boundary — refused, with the mock's
   sentence; Open wall on a shared wall takes out the stretch they
   share and the two read as one in the walk; place a street door on
   the Diwaniya and the sentence stops naming it; remove the Entry's
   outside door and the sentence says it has none; slide a door with
   the arrows and drag it to another wall; a room left unreached goes
   grey and is named; Ctrl+Z after each.
3. Unit tests for anything added to `src/sheet`.
4. Every exported name is imported by another file or a test.

## Standards

Usability: the actions above in the running app. Accuracy: the mock's
jamb, widths and rules. Performance: the T2 render budget still met.
Tidiness: no history in comments, small files.
