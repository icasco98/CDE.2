# E1: The chat agent on the sheet, zones only

## Where you work

Worktree `/home/user/cde2-e1`, branch `e1-chat-agent`, from
`origin/main` (T1 `src/sheet/` and T2 `src/views/sheet/` merged),
dependencies linked. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`,
`briefs/final-tool.md`, `briefs/t1-actions.md`, `briefs/t2-sheet.md`,
all of `src/sheet/` and `src/views/sheet/`. Then read in the frozen
mock at `/home/user/blocks-on-the-plot-v57.html` the section
"the chat line, and the agent behind it" (`sheetReport`,
`agentPlace`, `LAYOUT_TOOLS`, `AGENT_BRIEF`, the submit handler) and
the `start` function for how the page reaches `window.claude`. The
runtime it uses is described in
`/tmp/claude-0/bundled-skills/2.1.274/991d5f900eb06f38625f6c482c2edc87/artifact-capabilities/0.2.46/sample.d.ts`
and `.../db.d.ts` and `.../claude.d.ts`: read them; they are the
contract. Do not copy the mock into the repository.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

When done, `git push -u origin e1-chat-agent` and open a pull request
against `main` titled "E1: the chat agent on the sheet, zones only",
ending with "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
and the session URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`,
`PLAN.md`, `tests/guard.test.ts`, `src/geometry`, `src/model`,
`src/bubbles`, `src/zoning`, `src/views/plan`, `src/views/zoning`,
`src/views/bubbles`, `src/views/massing`. Changes to `src/sheet/` only
to export names; say so in the pull request.

## Goal

The owner opens the tool from a link (an artifact on claude.ai), sees
the Sheet tab, and a chat column at its right. They write "lay out the
ground floor"; the assistant places the zones on the sheet in front of
them, in batches they can watch, and says in a few short lines what it
did and why; it asks a question when it has one. They write back; it
adjusts. "Check this layout" makes it read the sheet and answer. It is
one assistant across sessions and versions: a memory kept in the tool
is sent with every message. Zones only: no doors, no heights, no
storeys in this task.

## The agent's tools (offer at most four; every description under 900 bytes)

- `read_sheet`: the report from `src/sheet` `report()` plus each room's
  frame and the waiting rooms, as the mock's `sheetReport`.
- `place_rooms({moves:[{name,x,y,angle?,w?,h?}]})`: through the
  `place`/`move`/`turn`/`setSize` actions with the sheet's snaps, the
  hold inside the line and the landing rule; up to 40 a call; returns
  where each landed and the report.
- `send_back({rooms})`.
- `remember({note})`: the assistant writes one line into its own
  memory (what it learned it needs, or a rule the owner stated).

The settings-and-notes tools of the mock are not carried over.

## The chat

- `src/views/sheet/Chat.tsx`, the mock's right column: the log, one
  input, Say. Under the log, a "Keep this plan" button: it stores the
  current sheet in memory as an approved plan.
- The moment Say is pressed a "Working…" line appears with a spinner;
  each tool call appends one short line ("placed 8 of 17 · diwaniya
  on the corner") and the sheet re-renders as the call runs; the
  assistant's final text streams in through `onText`. Errors are shown
  with their code and a plain sentence (not allowed, busy, stopped).
- One Undo takes back everything a message did; a message that changed
  nothing leaves no undo step.
- Where `window.claude` is absent (local dev, tests) the column says
  the assistant is reachable only from the link, and the input keeps
  the text as a note in memory.
- Voice, in the prompt: chat register, at most five short lines, no
  headings or numbered steps, name rooms by their program names, one
  question at a time when unsure, never a paragraph. Rules it must
  follow: the fresh brief's logic for a Kuwaiti villa (diwaniya group
  on the street with its own door, entry on the street with the formal
  living beside it, family rooms behind, service rooms at the back or
  on a side, rooms sharing walls, no slivers, areas near target,
  everything inside the line the ground floor may reach, importance
  order first). `modelTier: 'default'`, no cache.

## Memory

`src/sheet/memory.ts`: `{ feedback: [{at, text}], plans: [{at, name,
rooms}], notes: [{at, text}] }`. Every owner message is feedback; every
`remember` is a note; Keep this plan adds a plan (at most 5 kept, the
oldest dropped). Stored in the artifact `db` at `agent/memory` when
`db` is reachable and in `localStorage` always. Sent with every
message, bounded: the last 30 feedback lines, the last 20 notes, the
kept plans as room names with frames. So the assistant is the same
one across versions of the tool.

## Storage of the sheet (the least needed for a link to be useful)

Autosave the sheet to `localStorage` and to `db` `sheet/current` on
every change (debounced), load it on start, else the embedded sheet.
"Back to the sample" and "Clear the plan" buttons as the mock's. The
full settings window stays T5.

## Build for the link

`vite.config.ts` gets `base: './'` so `dist/` loads from any path; the
cofounder publishes `dist/` as an artifact. Keep the build working
locally too.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` green; the
   existing suites unchanged in what they check.
2. Unit tests: the tool executes on the embedded sheet (as the mock's
   headless check did: placing lands and snaps, inside the line,
   overlaps reported, send back, memory bounds); the prompt builder
   stays under 60 KB with a full memory; tool descriptions under
   900 bytes each.
3. Playwright, with a fake `window.claude` injected before load whose
   `use('sample')` returns a stub that calls the tools it is given:
   Say shows "Working…" at once; a stub that calls `place_rooms` twice
   makes the sheet show the rooms after the first call, before the
   second; the final text appears; one Ctrl+Z restores the sheet;
   Keep this plan writes a plan into memory; a reload keeps the sheet
   and the memory.
4. Every exported name is imported by another file or a test.

## Standards

Usability: the flow above in the running app. Accuracy: numbers only
from `src/sheet`. Performance: the sheet re-renders during a tool call
within the T2 budget. Tidiness: as the earlier briefs; small files.
