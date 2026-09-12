# Z2: Walls and site forces act; the hallway is a corridor; a missed link is diagnosed

## Where you work

Worktree `/home/user/cde2-z2`, branch `z2-task`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md` (17 to 21), `PLAN.md` (rows Z2 and Z3; this brief covers both), `rulebook/forces.md` (the status paragraphs and every row marked `owner`, `project choice` or `dropped`), `rulebook/room-types.md` (tiers, auxiliary, companion), `briefs/z1-plot-under-bubbles.md`, `briefs/f3-live-forces.md`, then `src/bubbles/*`, `src/views/bubbles/*`, `src/rulebook/*`, `src/app/{defaultLinks,sendToStorey}.ts`, `src/model/{types,persistence,project,actions}.ts`, `src/views/requirements/*`, `tests/e2e/{bubbles,bubbles-stage,requirements}.spec.ts`, `tests/guard.test.ts`. Never read anything outside this worktree. No other task runs beside you.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin z2-task`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`. The model changes named in step 4 are the only model changes; the cofounder writes them into `MODEL.md` at merge.

## Why

Z1 put the bubbles on the plot. Nothing yet puts them where a Kuwaiti villa puts its rooms: the site slider is a label, the entry can float anywhere, the hallway is a disc that cannot touch the seven rooms it serves, and a link that fails is silent. This task makes the settled picture mean something, so that the morph (Z4) has the right places to work from. The storyboard that proved the shape of this task lives outside the repository; its lessons are written into decisions 20 and 21 and into this brief.

## What changes

1. **Walls on the kerb.** Three kinds stand on the buildable line's street side and slide along it, never off it: the **Entry** (service street frontage), each **Garage** bay (at the kerb, bays side by side, nearest the side boundary), and the **Service Entrance** when the program has one (a side boundary near the Kitchen: the side street's kerb where there is one, else the service street beside the garage). A wall is a hard constraint applied after every step, like the buildable line. The **Diwaniya** is not a wall: a strong pull to the service street (S1) that may leave it up to one room's depth back; its own street door is drawn as the front-door mark on the kerb at the nearest point. A dragged walled bubble follows the hand along the kerb only.

2. **The forces, with coordinates.** A new `src/rulebook/forces.ts` transcribes the `owner` rows of `forces.md` as code, one entry per row with its id, the kinds it acts on, its strength (0.3, 0.6, 0.9) and a rule that turns it into a pull on the plot: S1 diwaniya to the service street; S2 garage along the frontage toward the nearer side boundary; S6 Laundry, Storage, Maid Room to a side boundary (medium); S8 Kitchen, Laundry, Maid Room, Storage away from the frontage (strong); U2 privacy gradient: public tier toward the street side, private toward the far side, semi-public between, strong, and **a link always wins over it**; U1 diwaniya and its WC away from Family Living and bedrooms; U5 bedrooms away from Diwaniya, Formal Living, Kitchen and the street; U9 and U10 as written. "The street side" is the plot sides marked street; "the back" the side opposite the service street; "a side" the others. The site slider multiplies the S rows and the user slider the U rows, as F3 does today for tiers; the "acts in zoning" label on the site slider goes, the environmental slider's label becomes "waits for milestone 3". S3 is dropped and does not appear.

3. **Two project choices.** S4 (diwaniya at the corner of two streets) and S5 (garden to the rear or a side) are the client's: a `site` block on the Requirements screen under Plot with two controls, "Diwaniya at the corner" (only offered when two sides are streets) and "Garden: rear / side / none". S4 pulls the diwaniya to that corner; S5 pulls Family Living (and a Courtyard if present) to that boundary. Stored on the project; see step 4.

4. **Model.** `Project.site = { diwaniyaAtCorner: boolean; garden: 'rear' | 'side' | 'none' }`, defaults `false` and `'rear'`; `PROJECT_VERSION` 7 with a migration adding the defaults; undo covers it. Nothing else in the model changes.

5. **The canonical start.** The first arrangement is derived from the program, never random: the walled rooms on the kerb in order (diwaniya's side first, then entry at the middle of the frontage, garage bays toward the other side), the hallway's corridor just inside the entry pointing into the plot, private-tier rooms across the back, service rooms (S8) to the back corner away from the diwaniya, everything else in the middle band in program order. Every re-settle starts from where the bubbles are. The same program on the same plot gives the same picture twice from a fresh project; a bubble the designer moves is the only source of variation.

6. **The hallway is a corridor.** In the physics a hallway is a capsule: a segment of half-width 1.20 m and a length that gives its target area, not a disc. Contacts are measured to the nearest point of the segment, so rooms touch it along its sides. Its near end is held on the room it starts from (the Entry on the ground, the Stair on an upper storey) as a wall; it turns toward the centroid of the other rooms it serves. It is drawn as its capsule with its name along it. Every other room stays a disc; a stair stays a disc drawn on each storey it reaches. (This is the Z3 row; the ellipse of decision 18 becomes a capsule here because contacts along straight sides are what a plan needs; the cofounder amends the decision at merge.)

7. **Links strong, the overlap wall stronger, auxiliaries ride.** A link's rest length is touching (radius plus radius, less the quarter overlap decision 18 allows); its pull is strong. The overlap beyond the quarter is a wall: after the forces of each step, project the constraints directly, a few rounds per frame: every linked pair pulled to touching, every overlap past the quarter pushed back, then the kerb walls, the corridor's anchor and the buildable line re-applied in full. A room's companions (`companionsOf`) ride its perimeter from the first frame and never settle alone.

8. **Contact correction.** When the picture rests, any linked pair still not touching is corrected: the movable one (never a walled room's kerb line, never a companion) is walked round the other to the nearest free spot; a pair on opposite sides of the corridor has its member on the busier side cross to the quieter; then a short settle and projection. Up to three rounds. Only then is the picture "Resting".

9. **Feasibility on the brief.** `src/rulebook/feasibility.ts` checks a storey's program before anything settles and the Requirements screen shows the findings under the totals with the fix: the storey's link graph must be planar; each room's link count must be within what its wall can hold at target aspect (each link needs 1.0 m of wall, 0.9 m for a small room; use the kind's proportion range); the walled rooms' widths along the kerb must fit the frontage (with the quarter overlap). A finding reads like "Diwaniya WC is linked to four rooms; at 5 m² it can touch two. Remove a link." or "The kerb is 14 m and the diwaniya, entry and two garage bays need 19 m; move a bay or narrow the diwaniya." A finding does not stop settling.

10. **Three link states, each said.** Realized: touching, drawn as the link is today. Unrealized but possible: drawn as a dashed tension line with a title sentence naming what is in the way ("Family Living cannot reach Dining Room: the hallway is between them" or "Kitchen is held at the back by S8"), and listed once under the sheet. Impossible: the feasibility finding on the brief. A room a storey move drops a link from says so in a fading message ("its door to the Ground Hallway was let go").

11. **The feasible suite.** `src/bubbles/feasible.test.ts`: four programs known to be feasible on their plots (the default program on the starting plot for one and for two storeys; with maid and driver; on a corner plot with two streets), each settled from the canonical start; every link touching after correction, every walled room on its kerb, every bubble inside the buildable line, and the same picture on a second run.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` pass.
2. Unit tests: each force's rule gives the direction the row says on the starting plot; the canonical start places the walled rooms on the kerb in order and is identical on two calls; the corridor's contact point and anchor; the projection closes a link and opens an overlap past the quarter; the correction walks a room to a free spot and crosses the corridor; feasibility's three checks with one failing case each and the sentence; the migration to v7; the feasible suite of step 11.
3. Playwright: (a) raising the site weight moves a garage bay to the kerb nearest a side and the kitchen to the back; (b) the entry cannot be dragged off the kerb, it slides; (c) the same program settles to the same picture twice from a fresh project (compare every bubble's position to 1 cm); (d) a brief asking a 5 m² WC to touch four rooms shows the finding on the Requirements screen with the sentence; (e) the hallway is drawn as a capsule touching at least five of the rooms it serves on the default two-storey program; (f) a bedroom moved to First reports the link it let go; (g) the two site choices change where the diwaniya and the family living settle.
4. Usability run through Playwright, described: new project, two storeys, rebuild, settle from the start, read the picture as an architect (where is the diwaniya, the entry, the garages, the kitchen, the bedrooms), move the family living across the corridor, settle again, raise and lower the site weight. Count gestures, say what a person would need explained, and say honestly whether the settled picture is where a Kuwaiti villa puts these rooms.
5. Performance: settle under 2 s for 30 rooms including correction; a frame with projection under 1 ms; the pointer-move path under 2 ms.
6. Tidiness: comments explain one decision each; export only what another file imports; no names the guard forbids; no synonyms for one thing; force strengths live in `forces.ts` and nowhere else.

## Report

Push, then report: what changed by file, the numbers from the checks, the usability run with your honest reading of the picture, and anything you decided that the brief left open.
