# A11: Default connections from the rulebook

## Where you work

Worktree `/home/user/cde2-a11`, branch `a11-default-connections`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `rulebook/room-types.md`, `rulebook/forces.md`, `rulebook/municipality-private-housing.md`, then `src/rulebook/*`, `src/model/types.ts`, `src/model/actions.ts`, `src/model/invariants.ts`, `src/views/bubbles/*`, `src/bubbles/simulation.ts`, `tests/e2e/bubbles-stage.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin a11-default-connections`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, `src/model/*`, `src/views/requirements/*`, or anything under `src/views/zoning` (another task owns it) or `src/views/requirements/WeightsSection.tsx` (another task owns it). The one file you share with the other tasks is `src/views/bubbles/BubblesStage.tsx`; keep your change there to passing new props and callbacks, nothing else.

## Goal

The rulebook gains a table of default connections between room kinds in a Kuwaiti villa, each with a source. On the Bubbles tab, every default the project's rooms imply and that has no edge yet is drawn as a proposed link. A click accepts one; an "Accept all proposals" button accepts them all. Nothing ever connects without one of those clicks. This is `MODEL.md`'s "the tool may propose an edge; a person accepts it", applied to the rulebook rather than to touching footprints.

## The table

`rulebook/default-connections.md`: a markdown table with columns Id, From kind, To kind, Kind of edge (`door`, `open`, `main-door`), Pairing, Source, Confidence. Draft it from your own judgement of a Kuwaiti villa, the room-type table's tiers and auxiliary flags, and the force list (U1, U3, U6, U7, U8, U9, U10 name adjacencies). Every row is `provisional` and says why in the source column; the owner corrects it later. Expected rows, at least: `EXTERIOR` to `entry-foyer` as `main-door`; `EXTERIOR` to `diwaniya` as `door` (its own entrance, U1); `EXTERIOR` to `garage`; `EXTERIOR` to `service-entrance`; `entry-foyer` to `formal-living`, `family-living`, `guest-wc`, `stair`, `hallway`; `diwaniya` to `diwaniya-wc`; `kitchen` to `dining-room`, `prep-kitchen`, `service-entrance`, `maid-room` region via `laundry`; `dining-room` to `family-living` (`open`); `master-bedroom` and `bedroom` to `ensuite-bathroom` and `dressing-room`; `maid-room` to `maid-bathroom`; `driver-room` to `driver-bathroom` and `garage`; `womens-reception` to `entry-foyer`; `hallway` to bedrooms. Do not connect across the privacy gradient without a reason in the source column.

**Pairing** says how a row picks rooms when a project has several of a kind: `each` (every room of the from-kind to every room of the to-kind, for hubs like the hallway), `one` (one to one: an auxiliary room pairs with the room of the served kind that was added immediately before it in `project.rooms` order and is not yet paired, which is how `defaultProgram` lays them out; say this rule in the table's preamble), or `nearest-name` if you find a better rule. Choose and state one rule per row; test it.

`src/rulebook/defaultConnections.ts` transcribes the table with a parity test against the markdown, like `roomTypes.ts` does for the room-type table. Export from `src/rulebook/index.ts` only what the bubbles stage imports.

## Proposals

`src/rulebook/proposals.ts` (pure): `proposedConnections(rooms, edges)` returns the list of `{ a, b, kind, storey, rowId }` the table implies for these rooms that have no edge yet between the same pair on that storey, and whose endpoints share a storey (or a stair spans it) exactly as `actions.connect` will require, so an accepted proposal is never refused. A `main-door` is proposed only while the project has none. Deterministic, tested, and never reading footprints or bubbles: the table and the graph are its only inputs.

## Screen

In the bubbles view, a proposed link between two rooms draws as a faint dotted link with a small "+" at its midpoint, `data-proposal="<a>:<b>"`, distinct from a real edge; clicking it calls `actions.connect` with the proposal's fields and says the refusal aloud if any. Proposals to `EXTERIOR` cannot draw as links (the outside is not a bubble), so they appear in a short list under the sheet, one line each ("Diwaniya: its own door from outside, accept"). An "Accept all proposals" button above the sheet accepts every proposal in one store transaction (`session.transaction`) so it is one undo step. When there are no proposals the button and the list are absent. The proposals never move a bubble: `createState` ignores them; they are drawing only.

Extend `BubblesViewProps` with `proposals` and `onAccept(proposal)`, and `BubblesStage` with the derivation and the callback. Do not change gestures, the simulation or the settle loop.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Reference cases as unit tests: the default program for the starting household on the starting plot (three bedrooms, two cars, no maid, no driver) yields the exact proposal list you state in the test, ensuite-to-bedroom pairs matching by adjacency in room order; accepting a proposal removes it from the next derivation; a project with a `main-door` gets no second one; a proposal between rooms on different storeys with no stair is not made.
3. Playwright: rebuild the program, open Bubbles, see at least one `[data-proposal]`, click it, see a `[data-edge]` appear and the proposal vanish; "Accept all proposals" leaves none and one Ctrl+Z brings them all back.
4. Usability: a person who rebuilt the program sees why each link is proposed: the row's source shows as the link's tooltip (`<title>`).
5. Tidiness: no synonyms for edge or connection in code; nothing named like the guard's forbidden names; the table's ids read `D1`, `D2`, ….

## Report

End with the table as you drafted it, the proposal list for the reference case, files touched, and anything you decided that the brief left open.
