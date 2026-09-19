# E2: The architect's own hands, eyes and memory

## Where you work

Worktree `/home/user/cde2-e2`, branch `e2-architect`, from
`origin/main`, dependencies linked. Read `CLAUDE.md`, `MODEL.md`,
`DECISIONS.md`, `briefs/final-tool.md`, `briefs/e1-chat-agent.md`,
`agent/architect.md` and `agent/lessons.md` (the architect's own mind:
the lessons and the open requests at the end are what this task
answers), and all of `src/sheet/` and `src/views/sheet/`. The runtime
the chat uses is described in
`/tmp/claude-0/bundled-skills/2.1.274/991d5f900eb06f38625f6c482c2edc87/artifact-capabilities/0.2.46/sample.d.ts`
and `.../db.d.ts`: read them before changing how the chat calls the
model.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: push `e2-architect` and open a pull request against `main`,
"E2: the architect's own hands, eyes and memory", ending with
"🤖 Generated with [Claude Code](https://claude.com/claude-code)" and
the session URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`,
`PLAN.md`, `tests/guard.test.ts`, `src/geometry`, `src/model`,
`src/bubbles`, `src/rulebook`. You may edit `agent/architect.md` only
to change the paragraph that lists what it has commands for.

## Why

The owner spent an hour teaching the architect and it wrote nothing
into its memory; it lost track of which storey a room was on, asked
the owner to switch tabs so it could see, argued in coordinates, and
could not settle an overlap it made. Everything below is what that
session showed it needs. Nothing here changes what the owner sees,
except the two faults named at the end.

## What to build

**Eyes.** `read_sheet` returns the whole house, not the storey on
screen: every storey with its rooms, each room's frame, area, target,
height, storey and doors, the rooms still waiting, the plot and its
lines, and the report per storey and in total. Add to it how the rooms
stand to each other, computed in `src/sheet/`: for each pair that
meets, the length of wall they share, and separately the pairs that
touch only at a corner or stand within a small gap. That reading is
what the architect reasons with instead of coordinates.

After every action call, return the same reading plus what changed:
which rooms moved, by how much, and any overlap or spill that appeared,
so it never reasons about a sheet that is no longer there.

**Hands.** Three commands, each through the existing actions, none of
them visible in the interface:

- `place_against`: put a room against a named wall of another room,
  touching, aligned as the architect asks (flush to one end, centred,
  or by a given offset along that wall), with the sheet's snaps and
  the hold inside the line. The tool computes the coordinates. It
  takes several such placements in one call.
- `settle`: carve or push a named overlap, as the right-click menu
  does, the lower room in the program giving way.
- `take_back`: undo the architect's own last batch, inside the same
  message, before it answers.

Every command takes a storey by name and works there without moving
the storey the owner is looking at.

**Memory.** The architect must end a run by writing what it learned
and what it lacked: after the last tool call of a message that changed
the sheet, if it has written no note, the chat asks it once, in the
same call, for its lessons and requests, and writes them into the
memory. A note that supersedes an older one replaces it, so the store
holds about a page; requests are kept as a list with their state.
`agent/lessons.md` ships with the page as the architect's starting
lessons, and what it writes at runtime is added to them.

**Voice.** The prompt already asks for short lines; add: never give
coordinates or dimensions in the chat, say where a room stands by what
it stands against; ask one question when something is unclear rather
than guessing.

## The two faults the owner found

- A room cannot be added from the Sheet: the tray's "add a room" is
  gone since the program came from Requirements. Put it back on the
  Sheet — kind, name, size — writing through to the project as T7's
  bridge does, so a hallway or a stair can be added without leaving
  the screen.
- The chat's input is one short line; a sentence cannot be read back.
  Make it a box that grows with what is typed, to a few lines, and
  scrolls beyond that. Enter sends, Shift+Enter makes a line.

## Definition of done

1. `npm run check`, `npx playwright test --workers=1`, `npm run build`
   green; the existing suites unchanged in what they check.
2. Unit tests: the shared-wall reading on the embedded sheet (a known
   pair's shared length, a known corner-only pair); `place_against`
   for each alignment, refused with a plain reason when the wall is
   too short; `settle` by carve and by push; `take_back` restoring
   exactly; the memory replacing a superseded note and staying under
   its bound; the prompt with a full memory under 60 KB.
3. Playwright, with the fake `window.claude` E1's suite already uses:
   a stub that places two rooms against each other leaves them sharing
   a wall; a stub that works on the first storey while the owner looks
   at the ground leaves the owner's storey switch untouched; a stub
   that writes no note is asked once and its lessons land in the
   memory; Ctrl+Z takes back a whole message; a room added from the
   Sheet appears in Requirements; the chat box grows with three lines
   of text and Shift+Enter does not send.
4. Every exported name is imported by another file or a test.

## Standards

Usability: the two faults fixed in the running app; nothing else on
screen changes. Accuracy: numbers from `src/sheet`. Performance: the
sheet's render budget still met while the architect works. Tidiness:
no history in comments, small files, one responsibility each.
