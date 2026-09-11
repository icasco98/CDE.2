# F1: Storeys and companions in the program

## Where you work

Worktree `/home/user/cde2-f1`, branch `f1-storeys-companions`, created from `origin/main`, dependencies installed. First run `git fetch origin main:refs/remotes/origin/main && git merge --no-edit origin/main` to pick up the model wording this task depends on (MODEL.md: Household `masterOnGround`; room types `defaultStorey` and `companion`). Work only there. Read `CLAUDE.md`, `MODEL.md`, `PLAN.md` (row F1), `rulebook/room-types.md`, `rulebook/default-connections.md`, `briefs/a10-weights.md` (the shape of a migration task), then `src/rulebook/*`, `src/model/{types,parse,persistence,project,actions,invariants}.ts`, `src/views/requirements/*`, `tests/e2e/requirements.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. Another task (F2) runs beside you in `src/views/bubbles` and `src/bubbles`; touch neither.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin f1-storeys-companions`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`.

## Why

The owner tested the tool. Rebuilding the program from the household puts every room on the ground floor, and adding a bedroom does not bring its bathroom. Both are rulebook facts about a Kuwaiti villa that the tool does not yet know.

## What changes

1. **Room-type table.** `rulebook/room-types.md` gains two columns: **Default storey** with the values `ground`, `upper`, `any`, `all` (spans every storey: stair, lift) or `top` (roof annex), and **Companion**, a kind id or `–`. Fill them from your judgement of a Kuwaiti villa and say the basis in the preamble in two or three sentences: reception, family, kitchen, dining, service, staff and garage on the ground; bedrooms and their suites upstairs; the master bedroom on the ground when the household asks; family living `any` because many villas have a second one upstairs. Companions: `master-bedroom` and `bedroom` bring `ensuite-bathroom`; `diwaniya` brings `diwaniya-wc`; `maid-room` brings `maid-bathroom`; `driver-room` brings `driver-bathroom`. A companion always takes the storey of the room it serves. All provisional.
2. **Transcription.** `src/rulebook/roomTypes.ts` and `types.ts` carry `defaultStorey` and `companion?`; the parity test against the markdown covers both columns.
3. **Household.** `masterOnGround: boolean` in `src/model/types.ts`, default false in `startingHousehold`, read by `parse.ts`, project file version 5 with a migration from 4 that adds `masterOnGround: false`. A checkbox "Master bedroom on the ground floor" in `HouseholdSection.tsx`.
4. **Rebuild.** `defaultProgram(plotAreaM2, household, storeys)` returns rooms with `storey` and `storeysSpanned`. Rule: `ground` and `any` kinds go to storey 0; `upper` kinds go to storey 1 when `storeys > 1`, else 0; the master bedroom goes to 0 when `masterOnGround`; a companion takes its room's storey; when `storeys > 1` a Stair is added at storey 0 spanning all storeys; `all` kinds span all storeys; `top` goes to the top storey. With three or more storeys every `upper` kind still goes to storey 1; the person moves rooms after. The rebuild in `ProgramSection.tsx` passes the project's storey count and the rooms' storeys through `addRoom`.
5. **Add a room.** The Add button in `ProgramSection.tsx` adds the chosen kind and, if the table names a companion, the companion on the same storey named "<Companion label>, <room name>", both in one `session.transaction` so one undo removes both. Removing a room removes nothing else.
6. Default connections (A11) already pair a companion with the room added just before it, so the ensuite's door is proposed without any change there; add one unit test in `proposals.test.ts` that a rebuilt two-storey program proposes each ensuite to its own bedroom on storey 1.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass; the parity test covers the two new columns.
2. Unit tests: the default program for the starting household on one storey is unchanged except for the stair rule (none on one storey); on two storeys the three bedrooms and three ensuites sit on storey 1, everything else on 0, and a Stair spans 2; with `masterOnGround` the master bedroom and its ensuite sit on 0; the version 4 to 5 migration; `addRoom` of a bedroom through the Add path creates two rooms and one undo removes both.
3. Playwright: set storeys to 2, rebuild, the program table shows the bedrooms on First and a stair row; tick the master-on-ground box, rebuild, the master bedroom reads Ground; add a bedroom, an ensuite row appears; Undo removes both rows.
4. Usability: the labels say what they do without explanation; the checkbox sits with the other household choices.
5. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids.

## Report

End with: what you built, files touched, the two new columns as you filled them, the test numbers, and anything you decided that the brief left open.
