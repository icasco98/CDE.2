# F4: A stair on every floor it serves

## Where you work

Worktree `/home/user/cde2-f4`, branch `f4-stair-twins`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `PLAN.md` (row F4), `briefs/f2-bubbles-rework.md`, `briefs/f3-live-forces.md`, `briefs/f1-storeys-companions.md`, then `src/bubbles/*`, `src/views/bubbles/*`, `src/views/requirements/{ProgramRow,ProgramSection,storeys}.tsx|ts`, `src/model/{types,actions,invariants}.ts`, `src/rulebook/{program,sizes}.ts`, `tests/e2e/bubbles*.spec.ts`, `tests/e2e/requirements.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin f4-stair-twins`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the zoning and massing views.

## Why

Today a room that spans storeys (a stair, a lift) is one bubble sitting on the boundary between its bands. The owner found that it fights intuition. He wants one bubble on every floor the stair serves, moving together, and a way to say which floors a stair reaches: ground to first, ground to second, first to second.

## What changes

1. **Twins in the diagram.** A room with `storeysSpanned > 1` is drawn once in every band it occupies. Each twin is a `<g data-room={id} data-twin={storey}>` with the room's name, colour and area, plus a small mark reading "Ground to First" (the storey labels already used). The room stays one room: one id, one `bubble`, one entry in the store. The stored `bubble` is the lowest twin's position; the others sit at the same x and at the same relative height inside their own bands, so the view derives them and nothing new is stored. Say this in one comment.
2. **They move as one.** Dragging any twin drags the room: the same frame moves every twin. In the simulation the room is one body whose forces are the sum of what acts on each twin: springs from links on any floor, repulsion from neighbours in each band, and the band pull for each band it occupies. Choose and state the simplest rule that keeps `createState` and `step` deterministic and the performance test under budget; a twin is not a separate body.
3. **Links attach on their floor.** An edge between the stair and a room on storey s draws to the twin in band s. A link drawn by the Link button or the ring handle from a twin connects the room, and the model's `connect` decides the storey as it does today. A proposal to the stair draws to the twin on the proposing room's floor.
4. **The storey filter** shows the twin of the filtered floor and dims the others like any other room on another floor. Dropping a twin into a band the room does not occupy is refused with a sentence ("A stair does not change floors by dragging; set its span in the program."). The band-drop refusal for stairs in `bands.ts` stays and gains this wording.
5. **A Spans control.** In `ProgramRow.tsx`, for kinds whose default storey is `all` (stair, lift), the storey column becomes two selects: "From" (the starting storey) and "To" (the top storey reached, at least one above From when the house has more than one storey). They call `setStorey(id, from, to - from + 1)`. For other kinds the row is unchanged. The stretching on add/remove storey in `storeys.ts` keeps working for a stair that reaches the top and leaves a shorter one alone; say so in a comment and a test.
6. **Undo, autosave, file round-trip** need nothing new, since nothing new is stored; add one test that a project with a ground-to-second stair round-trips and draws three twins.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass; the existing bubbles tests pass, adjusted only where they counted a spanning room as one `[data-room]` (count twins, or count distinct ids).
2. Unit tests: the derived twin positions (same x, same relative height in each band); the one-body force rule (a stair linked only to an upper room is pulled toward it; a stair between two bands has zero net band pull when centred); determinism; the Spans arithmetic; the stretching rule for a stair that stops short.
3. Playwright: a two-storey rebuild shows two Stair twins with the same x; dragging the lower twin moves the upper one in the same frame; linking the Entry to the lower twin draws the edge on Ground and linking a Bedroom to the upper twin draws it on First; the First filter shows only the upper twin; dropping the upper twin into Ground is refused and the twin returns; setting a stair's span to Ground to Second on a three-storey house shows three twins and the Massing tab one prism through three storeys (assert one `[data-room]` group for it there); setting First to Second shows two twins in the upper bands only.
4. Performance: the bubbles frame test with 30 rooms, three of them spanning three storeys, stays under 1 ms.
5. Usability run, done by you through Playwright and described: three storeys, rebuild, set the stair to Ground to First and add a second stair First to Second, link them through a hallway, drag one, filter to Second. Say what felt wrong.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms.

## Report

End with: what you built, files touched, the test numbers, the performance measurement, the usability run, and anything you decided that the brief left open.
