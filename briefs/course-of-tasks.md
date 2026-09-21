# The course: ten tasks that test whether the architect can use the tool

## Where you work

Worktree `/home/user/cde2-course`, branch `course-of-tasks`, from
`origin/main`, dependencies linked. Read `CLAUDE.md`, `MODEL.md`,
`briefs/e1-chat-agent.md`, `briefs/e2-architect.md`,
`briefs/e3-verbs.md`, `agent/architect.md`, `agent/lessons.md`, and
`src/sheet/` — in particular `agent.ts`, `verbs.ts`, `prompt.ts`,
`desk.ts`, `actions.ts`, `report.ts`, `meetings.ts`, `pockets.ts`.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: push `course-of-tasks` and open a pull request against `main`,
"The course: ten tasks that test the architect's use of the tool",
ending with "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
and the session URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`,
`PLAN.md`, `tests/guard.test.ts`, `agent/lessons.md`, or anything the
tool itself ships (`src/`, `tests/e2e/`) except to add the course's own
files under `course/`.

## Why

The owner cannot tell whether the architect is improving, because
nothing is measured, and it writes lessons nobody checks. This course
separates the one question that has a right answer — can it use the
tool — from the one that does not — can it design. It is a check, not
a curriculum: nothing in the tool or the architect's files may be
changed to make a task pass.

## What to build

A course under `course/`, run from the command line, with three parts.

**1. The desk.** A small program, `course/run.mjs`, holding one task's
sheet in a file under `course/runs/<task>-<n>/`. It offers exactly
three commands:

- `node course/run.mjs <task> <n> read` — prints the reading the
  architect gets from `read_sheet`, and on the first call also the
  task's instruction.
- `node course/run.mjs <task> <n> call '<json>'` — applies one tool
  call, `{"tool":"place_against","input":{…}}`, through the real
  `src/sheet/agent.ts` tools, and prints exactly what the tool returns.
- `node course/run.mjs <task> <n> check` — prints PASS or FAIL with
  the numbers behind it, and writes the run's record.

It uses the shipped tools and verbs as they are; it may not add or
change a tool. Undo, the honesty line and the memory are the tool's,
not the course's.

**2. The ten tasks**, each with a starting sheet built in code, one
instruction in the owner's plain words, and a pass condition read from
the model:

1. **Give a space away.** Four rooms round an empty middle of about
   10 m². "Add the space in the middle to the kitchen." Passes if the
   kitchen's area grew by that space to within 0.2 m² and no enclosed
   space remains there.
2. **Make a court.** The same sheet, the middle about 12 m². "Make the
   middle a court." Passes if a court room exists covering that space.
3. **A court refused.** The same sheet, the middle about 4 m². "Make
   the middle a court." Passes if no court was made, no other change
   was made to the sheet, and the run's last tool result carries the
   tool's own reason (under the 9 m² a court needs).
4. **Against a wall.** A kitchen and a dining room standing apart.
   "Put the dining room against the kitchen's east wall." Passes if
   the two share a run of wall of at least 2 m, with no overlap and
   nothing outside the line.
5. **Settle by carving.** Two rooms overlapping by about 6 m². "Settle
   the overlap by carving." Passes if no overlap remains and the
   lower room in the program lost about that area while the higher
   kept its own.
6. **Face north.** One room at 0°, the plot's north turned 25°. "Turn
   the diwaniya to face north." Passes if its angle is 25° within a
   degree and its area is unchanged.
7. **Open to below.** A hall on the ground, storeys 3.5 m. "Make the
   stair hall 5 m tall." Passes if its height is 5 m and the first
   storey reads that footprint as open to below.
8. **Another storey, not your view.** A bedroom on the ground, the
   desk's own storey left at the ground. "Move the bedroom to the
   first storey." Passes if the room is on the first storey and the
   storey the desk shows is still the ground.
9. **A door between two rooms.** Two rooms sharing a wall, one with a
   street door. "Put a door between them." Passes if exactly one door
   stands on the shared wall, both rooms count it, and the walk
   reaches the far room.
10. **A door refused.** A room with a wall on the plot boundary. "Put
    a door on its boundary wall." Passes if no door was placed, and
    the last tool result carries the tool's reason.

**3. The runner.** `course/course.mjs` runs the whole course: for each
task, three runs, each a fresh architect. Play the architect with the
`Agent` tool, one agent per run, and give that agent only what the
real one gets:

- `agent/architect.md` and `agent/lessons.md`, in full;
- the tool descriptions exactly as `src/sheet/agent.ts` writes them,
  which the course prints to `course/tools.txt` for the purpose;
- the desk's three commands, and the task's instruction through
  `read`.

Tell each architect agent plainly: it may not read anything under
`src/`, `tests/`, `course/run.mjs` or the other runs; it works only
through the desk; it stops when it believes the task is done; it never
runs `check`. Then the runner runs `check` itself.

Record for every run: the task, the run number, every tool call and
its result, the architect's own last words, PASS or FAIL, and the
numbers `check` printed. Write them to `course/results/<task>-<n>.json`
and a summary table to `course/results/summary.md`.

**The drawings.** For each task's first run, load the finished sheet
into the built app in Playwright (the sheet goes into browser storage,
as `src/views/sheet/store.ts` reads it) and save a screenshot of the
Sheet tab to `course/results/<task>.png`, before and after.

## Definition of done

1. `npm run check` and `npm run build` stay green; the tool's own
   suites are untouched.
2. The course has run: thirty runs recorded, the summary written, the
   drawings saved.
3. `course/results/summary.md` gives, per task, the pass count out of
   three, and for each failure one line saying which of three kinds it
   was: **wrong choice** (it used the wrong command or the wrong
   argument), **tool fault** (the command misbehaved or refused what
   it should allow), or **narration** (it said it had done something
   no call did).
4. Nothing in `src/`, `agent/` or the tool's tests changed. If a task
   cannot pass because the tool is at fault, that is a finding, not a
   reason to edit the tool.

## Standards

Accuracy: every pass condition read from the model, never from the
architect's words. Tidiness: the course lives under `course/`, small
files, no history in comments. Honesty: report what happened,
including a task the course itself could not run.
