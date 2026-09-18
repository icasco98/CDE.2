# T4: Storeys and the mass on the Sheet

## Where you work

Worktree `/home/user/cde2-t4`, branch `t4-storeys-mass`, from
`origin/main`, dependencies linked. Read `CLAUDE.md`, `MODEL.md`,
`DECISIONS.md` (16 on the massing being drawn, not rendered),
`briefs/final-tool.md` (this task is its T4), `briefs/t1-actions.md`,
`briefs/t2-sheet.md`, and all of `src/sheet/` and `src/views/sheet/`.
Then read, in full, the frozen mock at
`/home/user/blocks-on-the-plot-v57.html`: its storey switch, `ghosts`,
`voidOn`, `zBase`/`zTop`/`heightOf`/`heightCap`, `snapHeight`,
`renderMass`, `makePrism`, `bspOrder`, `massProj`, `beginMassMove`,
`beginMassWall`, `beginMassHeight`, `beginMassTurn`, the mass foot and
the Storeys tab of its settings. The mock is the specification. Do not
copy it into the repository.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: `git push -u origin t4-storeys-mass` and open a pull request
against `main`, "T4: storeys and the mass on the Sheet", ending with
"🤖 Generated with [Claude Code](https://claude.com/claude-code)" and
the session URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`,
`PLAN.md`, `tests/guard.test.ts`, `src/geometry`, `src/model`,
`src/bubbles`, `src/zoning`, `src/views/plan`, `src/views/zoning`,
`src/views/bubbles`, `src/views/massing`. Another agent is working in
`src/views/sheet/SheetStage.tsx` at the same time on settings and
storage: keep your edits there to the smallest that works (the storey
switch and the mass beside the sheet), and say in the pull request
exactly what you changed in that file.

## Goal

The owner switches to the first storey, draws on it over the faint
ground floor, sets a room's height, and sees the whole house standing
beside the sheet — and can drag a volume in the mass and watch the
room move on the sheet. Program to massing in one sitting, which is
the tool's objective.

## What to build

**Storeys.** The switch above the sheet: Ground, First, + to the
rulebook's three, − for an empty top storey. Each storey its own
height (`storeyH`, `storeyH1`, `storeyH2`). The sheet shows the storey
in hand with the storey below drawn faint under it. A room dropped
lands on the storey in hand; its menu moves it up or down, and copies
it up. The stair is one room across storeys. A ground room taller
than its storey, and a court, show on the storey above as their
footprint with an X, "open to below": nothing lands on them, walls
snap to them, they take no door. Upstairs the setback holds
everywhere. Ctrl+C and Ctrl+V across storeys. The program column marks
each room's storey. The sentence reads per storey and both storeys
against the 210 % ratio.

**The mass.** Beside the sheet, in the same page, as `src/views/sheet/
MassView.tsx`: the storeys stacked at their heights, drawn back to
front by the mock's wall-line tree, exact from any angle; blind
boundary walls dark and red above 5 m; the four preset views; orbit
by dragging empty ground, the middle button or Space, about the
selection; wheel zoom; double-click to recentre; street names on and
off; no names on volumes, the selected one named under the view; Hide
and Show the mass.

**Edit in 3D**, on by default: drag a volume by any face and the room
moves on its storey with the sheet's snaps, a shadow under it and the
landing rule on the drop; the selected volume's top edges carry wall
handles; a post with a knob sets the height (to 15 m; the stair to
18 m, snapping to the storeys' roofs); a far knob turns it;
right-click gives the room's menu. Never up or down: a room changes
storey from its menu.

Selection and hover are shared between the sheet and the mass.

Everything that computes goes in `src/sheet/` (heights, storeys,
ghosts, the projection, the wall-line tree, the report per storey) with
its own tests; the views only draw and listen. Add actions where one is
missing rather than touching a room from a view.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` green; the
   existing suites unchanged in what they check.
2. Unit tests: `snapHeight` on each storey; a tall ground room shows
   as open to below upstairs and nothing may be placed on it; the
   ratio line for two storeys; the wall-line tree's order for a
   turned room.
3. **The ray cast**, as a Playwright test, the mock's own check: at
   about 900 sample pixels from six views (the four presets and two
   orbits), the room drawn on top is the room a ray from the eye hits
   first; zero mismatches away from edges.
4. Playwright, each named: switch to First and the ground floor shows
   faint under it; drop a room upstairs and it is held inside the
   setback; a ground room pulled taller than its storey shows an X
   upstairs; drag a volume in the mass and the room moves on the
   sheet as you drag; pull the height knob and the volume rises, the
   stair stopping at 18 m; the storey switch adds and removes a
   storey; Ctrl+Z after each.
5. Performance: a frame of the mass under 16 ms while a volume is
   dragged, with 30 rooms on two storeys; printed by the test,
   failing past double.

## Standards

Usability: the actions above in the running app. Accuracy: numbers
from `src/sheet`, the rulebook's 15 m, 5 m, 210 %, three storeys.
Performance: the budget above. Tidiness: no history in comments,
small files, nothing exported that is not imported.
