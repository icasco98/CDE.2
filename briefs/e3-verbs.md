# E3: The rest of the tool in the architect's hands, and a page teaching it

## Where you work

Worktree `/home/user/cde2-e3`, branch `e3-verbs`, from `origin/main`,
dependencies linked. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`,
`briefs/final-tool.md`, `briefs/e1-chat-agent.md`,
`briefs/e2-architect.md`, `agent/architect.md`, `agent/lessons.md`,
and all of `src/sheet/` and `src/views/sheet/` — in particular
`src/sheet/actions.ts` (every action the hand has) and
`src/sheet/agent.ts` (the seven the architect is offered today). The
runtime is described in
`/tmp/claude-0/bundled-skills/2.1.274/991d5f900eb06f38625f6c482c2edc87/artifact-capabilities/0.2.46/sample.d.ts`;
`limits().tools.maxCount` is why this task adds one command and not
twelve.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: push `e3-verbs` and open a pull request against `main`,
"E3: the rest of the tool in the architect's hands", ending with
"🤖 Generated with [Claude Code](https://claude.com/claude-code)" and
the session URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`,
`PLAN.md`, `tests/guard.test.ts`, `src/geometry`, `src/model`,
`src/bubbles`, `src/rulebook`. `agent/architect.md` and
`agent/lessons.md` are yours to add to, as this brief says.

## Why

The architect can only read, place, settle an overlap, take a batch
back and send a room away. Everything else the owner's hand can do —
turning a room, mirroring it, reshaping it, carving one room out of
another, making an enclosed space into a court or a corridor,
combining two rooms, locking, grouping, setting a height, moving a
room to another storey, placing a door — exists in `src/sheet/
actions.ts` and is not offered to it. It also misreads the commands it
has: it asked for a batch placement it already had.

## What to build

**One command carrying the verbs.** A tool, `do`, taking a list of
deeds, each a verb with its own arguments, applied in order through
the existing actions, on a storey named by the architect and never by
moving the owner's view. The verbs, each mapping to the action the
hand uses:

`turn` (a room by degrees, or a quarter, or to face north), `mirror`,
`resize` (a room's width and depth, or its area), `reshape` (a room
cut back to a polygon, or grown to one), `carve` (one room's shape out
of another's), `push`, `court` (an enclosed empty space made a court,
refused with the tool's own reason when too small), `corridor` (an
enclosed space made a corridor, or given to a hallway that walls it),
`give` (an enclosed space given to a room that walls it), `combine`
(rooms sharing a wall welded into one, a named survivor), `lock` and
`unlock`, `group` and `ungroup`, `height` (a room's height in metres),
`storey` (a room moved to another storey), `copy` (a room copied, to
the same storey or another), `cut` (a room cut by the setback line),
`restore` (a room's shape put back), `door` (a door of a named type on
a named wall of a room, at a fraction along it, through the same check
a click makes), `open_wall`.

Each deed returns what happened in the tool's own words — where it
landed, what it refused and why — and the whole call returns the
reading E2 added: the house, how the rooms stand to each other, and
what changed. A deed that cannot be done refuses without touching the
sheet and the rest of the list still runs; the refusals are reported.
One message is still one undo.

Keep the tool count at or under what the runtime allows: fold
`send_back` into `do` as a verb if that is needed to stay inside it,
and say in the pull request what the final list of tools is.

**A page teaching it the tool.** A new section in
`agent/architect.md`, written for the architect, plain and short: each
command it has, what it does, when to reach for it, and one worked
example in the words it would use. It must say plainly that
`place_against` takes several rooms in one call, since it has asked
for what it already has; that a claim in the chat changes nothing
unless a command was called; and that a verb refused is a fact about
the plan, not a reason to narrate around it. The page ships with the
page as its instructions do.

**The honesty guard.** When a message's reply describes a change to
the plan but no action ran that message, the chat says so under the
answer, in one line: nothing was placed. Keep it to what can be told
for certain — an action ran or it did not — and write it as a line in
the log, not a refusal.

## Definition of done

1. `npm run check`, `npx playwright test --workers=1`, `npm run build`
   green; the existing suites unchanged in what they check.
2. Unit tests: every verb, each with its refusal (a court too small, a
   combine of rooms that share no wall, a door on a boundary wall, a
   height above the cap, a storey out of range); a list of deeds where
   the third refuses and the rest still apply; one message is one undo.
3. Playwright, with the fake `window.claude` the chat suites use: a
   stub that turns a room and makes a court leaves both done on the
   sheet; a stub that narrates without calling anything has the log
   say nothing was placed; the owner's storey switch is untouched
   while the architect works on another storey.
4. The teaching page is in `agent/architect.md` and the page reads it.
5. Every exported name is imported by another file or a test.

## Standards

Usability: nothing on screen changes but the one honest line in the
log. Accuracy: every number from `src/sheet`. Performance: the render
budget still met while a list of deeds is applied. Tidiness: no
history in comments, small files, one responsibility each.
