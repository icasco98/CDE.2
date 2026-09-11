# G1: Hallways

## Where you work

Worktree `/home/user/cde2-g1`, branch `g1-hallways`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `PLAN.md` (row G1), `rulebook/room-types.md`, `rulebook/default-connections.md`, `rulebook/municipality-private-housing.md` (corridor 1.20 m clear), `briefs/f1-storeys-companions.md`, `briefs/f4-stair-twins.md`, then `src/rulebook/*`, `src/views/requirements/{addRoom.ts,ProgramSection.tsx,HouseholdSection.tsx}`, `src/views/bubbles/{BubblesStage.tsx,BubblesView.tsx,types.ts}`, `tests/e2e/bubbles-stage.spec.ts`, `tests/e2e/requirements.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. Another task (G0) runs beside you in `src/views/zoning` and `src/geometry`; touch neither. In `src/views/bubbles` change only what the button and the nudge need.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin g1-hallways`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or the model.

## Why

The room-type table has a hallway but nothing ever creates one, so bedrooms link straight to each other and the plan has no corridor to give doors to. The owner asked for a hallway on the fly in the bubbles and for the program's logic to know about circulation.

## What changes

1. **A circulation rule in the rulebook.** Add a short "Circulation" section to `rulebook/room-types.md`: a hallway's target area on a storey is a share of the area of the rooms it serves on that storey, with a floor and a ceiling, and a minimum clear width of 1.20 m from the Municipality entry. Choose the share from your judgement of Kuwaiti villas (published plans put circulation at roughly 8 to 12 percent of floor area; say what you chose and why), mark it provisional, and transcribe it as constants in `src/rulebook/program.ts` (or a small `circulation.ts`) with a parity test against the markdown.
2. **Which storeys get one.** A storey needs a hallway when it holds two or more rooms of the private tier, or a stair plus any room that is not a companion. State the rule in the rulebook section. The ground floor of the default two-storey program gets one (stair, family living, guest WC); the first floor gets one (bedrooms); a one-storey house with the default program gets one on the ground.
3. **The rebuild adds hallways.** `defaultProgram` adds a Hallway per storey that needs one, named "Hallway" on a one-storey house and "Ground Hallway", "First Hallway" otherwise, sized by the rule from the rooms on that storey, inserted after the stair in room order so the default connections D9, D23 to D26 pair it. Update the reference program tests (room counts and names) and the proposals reference list.
4. **Add hallway on the Bubbles tab.** A button "Add hallway" beside the controls. With the storey filter on a storey, it adds a hallway there; with All showing, it adds one on the lowest storey that has none, or asks with two buttons ("Ground", "First") when every storey has one. Sized by the rule from the rooms on that storey at that moment. The new bubble appears where the band has room (use the same starting position rule as any new room) and its default links to the stair, the bedrooms and the bathrooms on that storey are proposed at once by the existing derivation.
5. **The nudge.** On the Bubbles tab, when a storey needs a hallway by the rule in step 2 and has none, one line under the controls says "First has three private rooms and no hallway." with the Add hallway button next to it. Nothing is added by itself.
6. **The program table** gains nothing new: a hallway is an ordinary row with the kind's default storey `any`.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass; the parity test covers the circulation constants.
2. Unit tests: the area rule at its floor, ceiling and middle; the needs-a-hallway rule for the three cases in step 2 and a storey with one bedroom and no stair (none); the two-storey default program's exact room list with both hallways; the proposals for a hallway (stair, bedrooms, bathrooms on its storey, and the entry on the ground).
3. Playwright: rebuild on two storeys, the program table shows Ground Hallway and First Hallway; open Bubbles, the hallway on First has proposals to the three bedrooms; delete First Hallway, the nudge appears naming First; press Add hallway with the First filter on, a hallway returns on First and the nudge goes.
4. Usability run through Playwright, described: rebuild, delete a hallway, read the nudge, add it back, accept its proposals, drag it between the bedrooms. Say what felt wrong.
5. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms.

## Report

End with: what you built, files touched, the circulation rule as you wrote it, the test numbers, the usability run, and anything you decided that the brief left open.
