# Z5: fit by reduction, and the manual size check

## Where you work

Worktree `/home/user/cde2-z5`, branch `z5-task`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md` (stage 3, the operations, the invariants), `DECISIONS.md` (19 and 22), `PLAN.md` (row Z5), `rulebook/room-types.md`, `rulebook/municipality-private-housing.md` (the building ratio table and the minimum room sizes), `rulebook/known-house.md` (the reference case for the ratio), then `src/rulebook/{fit.ts,sizes.ts,roomTypes.ts,types.ts}`, `src/zoning/{types.ts,partition.ts,straighten.ts,houses.ts}` and their tests, `src/views/zoning/{ZoningView.tsx,ZoningStage.tsx,morph.tsx,parts.tsx,gestures.ts,zoning.css}`, `src/views/requirements/ProgramSection.tsx`, `src/massing/numbers.ts`, `src/model/{types.ts,actions.ts,store.ts}`, `tests/e2e/{zoning,plan,layout}.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin z5-task`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model's types.

## Why

The morph may spill past the buildable line and says by how much, and the plan sheet lets a person resize, carve and drag walls without limit. Neither yet tells the person what to do about it. Decision 19: the tool never shrinks a room by itself; it names the rooms that could give up area and lets one click each do it, and when nothing fits it says so in one sentence. The same in the other direction: a room a hand has made larger than its kind allows, or a storey made larger than the plot or the Municipality's ratio allows, is outlined and named, never refused.

## What changes

1. **The allowed floor area, in the rulebook.** A function in `src/rulebook` gives the Municipality's allowed gross floor area for a plot area, from the building ratio table: 210% of the plot at 401 m² and above; 210% plus 120 m² from 350 to 400 m²; 800 m² from 250 to 349 m². Reference case: the known house, 400 m² gives 960 m². The massing's numbers show the allowed area beside the gross floor area; the flat 210% constant goes. Basement and roof stair house are not counted, but the tool has neither yet, so every storey counts.

2. **The slack of a room.** For a room of a kind with a range (the plot band resolved for the plot), slack is its target area minus the bottom of its range, never negative; a kind without a range, a hallway, a stair and a lift have no slack. This lives beside `fit.ts` in the rulebook, pure, with a reference case on the default program.

3. **Fit by reduction, on the proposal.** When the proposal spills (its overflow is more than 0), the rooms on that storey are sorted by slack, largest first, and the fewest taken whose slack together covers the overflow. Those rooms are outlined on the sheet in the warning colour, and the report under the sheet says, in one sentence, "Reduce these five and the floor fits: Diwaniya 54 to 45, Family living 39 to 32, … together 31 m²". Clicking an outlined room sets its target to the bottom of its range through the store's existing target-area action (one undo step each), and the proposal is made again from the same bubbles, so the overflow, the outlines and the sentence update at once. Nothing changes size without a click. When every room on the storey at the bottom of its range still leaves an overflow, the sentence is instead "The ground floor program is too big for this plot by N m² even with every room at its smallest: move rooms upstairs or remove some", where N is the storey's targets at their minimums minus its buildable area, and no room is outlined.

4. **The manual size check, on the accepted plan.** After any resize, carve, shared-wall drag or draw on the plan sheet, a placed room whose footprint area is past the top of its kind's range, or under its bottom, is outlined in the warning colour, and one sentence under the sheet names the limit: "Kitchen is 31 m², the range ends at 28" or "Kitchen is 9 m², the range starts at 14". When the storey's placed area is more than its buildable area, or the house's placed area over every storey is more than the allowed floor area, one sentence says which and by how much: "Ground is 380 m² on 365.5 m² buildable" or "The house is 990 m² of floor, the ratio allows 960". The gesture is never refused (the legal floor of `gestures.ts` stays the one refusal there is). Dragging back clears the outline and the sentence. Several rooms over give several sentences, one each, in the order of the program. This check reads the store; it does not write it.

5. **The report has one voice.** The sentences of 3 and 4 stand in the same `zoning-report` list as the fit line and the tensions, with `data-` attributes a test can read (`data-reduce`, `data-size-said`, `data-ratio-said`), and are said plainly: no jargon, no exclamation marks, numbers to a tenth where the program table uses a tenth and whole where it does not.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Unit tests: the allowed area on 300, 400, 500 and 750 m² plots (800, 960, 1050, 1575); the slack of every kind in the default program, the hallway and the stair at 0; on the default program on a plot narrowed until the ground storey spills by about 30 m², the offered rooms are the fewest by largest slack, their slack together at least the overflow, and none is offered below its range; with every room at its minimum and a plot smaller still, the too-big sentence with the right N; the size check on a kitchen of 31 m² and of 9 m² gives the two sentences above and a kitchen of 20 m² gives none; the storey and ratio sentences on a constructed house.
3. Playwright: (a) narrow the plot on Requirements until the ground spills, Morph, read the outlined rooms and the sentence, click each outlined room in turn, the overflow reaches 0 and the sentence goes; Undo restores one target per press; (b) Morph a spilling plan and wait two seconds: no target has changed; (c) Accept a plan, resize the kitchen past 28 m²: outline and sentence; resize it back: both gone; (d) resize a room until the storey passes its buildable area: the storey sentence; (e) a project saved before this task opens and shows no new sentence until a gesture is made.
4. Usability run through Playwright, described: rebuild, two storeys, settle, Plan, narrow the plot, Morph, read what the sheet tells you and say plainly whether an architect would know what to do next without being told; click two rooms, Accept, resize a room past its range, say whether the sentence would stop you or annoy you. Count gestures.
5. Performance: the offer of 3 computed in under 5 ms on the default program; the re-morph after a click inside the morph's own budget (250 ms); the check of 4 under 1 ms per gesture, measured.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms for one thing (slack is slack, overflow is overflow, range is range).

## Report

Push, then report: what changed by file, the numbers from the checks, the usability run with your honest reading, the performance numbers, and anything you decided that the brief left open, especially any kind whose range made the offer or the check say something odd.
