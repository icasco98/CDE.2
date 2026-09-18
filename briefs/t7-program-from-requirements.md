# T7: The program comes from Requirements

## Where you work

Worktree `/home/user/cde2-t7`, branch `t7-program-from-requirements`,
from `origin/main`, dependencies linked. Read `CLAUDE.md`, `MODEL.md`
(Project, Room, Household and the room-type table), `DECISIONS.md`,
`briefs/final-tool.md`, `briefs/t1-actions.md`, `briefs/t2-sheet.md`,
`src/model/`, `src/views/requirements/`, `src/sheet/` and
`src/views/sheet/`.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: push the branch and open a pull request against `main`,
"T7: the program comes from Requirements", ending with "🤖 Generated
with [Claude Code](https://claude.com/claude-code)" and the session
URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`,
`tests/guard.test.ts`, `src/geometry`.

## Goal

The room list on the Sheet is the brief the owner entered, not a
fixed list. Requirements is the brief; the Sheet follows it; a room
added on the Sheet is added back to Requirements.

## What to build

The Sheet's program is built from the project's rooms: name, kind,
category, target area, storey, in the project's order, which is the
order of importance. Changing a room in Requirements changes it on the
Sheet. Adding a room on the Sheet adds it to the project; removing one
on the Sheet removes it from the project; reordering on the Sheet
reorders the project. A room already placed keeps its footprint when
its target changes; the sentence reads the new target.

The plot comes from the project too where the project has one: its
size, the street sides, north, and the setbacks the rulebook gives for
that plot; the fresh brief's corner plot stays the default when the
project has none. Keep `src/sheet/plot.ts` the one place those numbers
live.

Where the two disagree on load — a saved sheet whose rooms are not the
project's — the project wins, and rooms it does not know are kept as
extra rooms of the sheet with a line in the sentence saying so.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` green.
2. Unit tests: a project's rooms become the Sheet's program in order;
   a room added on the Sheet appears in the project; a target changed
   in Requirements is read by the sentence; a saved sheet reconciled
   with a different project keeps the project's list.
3. Playwright: enter a twelve-room program in Requirements, go to the
   Sheet, and the program column holds those twelve rooms with their
   areas; add a room on the Sheet and it is in Requirements.
4. Every exported name is imported by another file or a test.

## Standards

Usability: the flow above in the running app. Accuracy: the room-type
table's areas, the rulebook's setbacks for the plot. Tidiness: one
place for the plot's numbers; no duplicate program.
