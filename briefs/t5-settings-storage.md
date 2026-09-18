# T5: Settings, saving, and the page

## Where you work

Worktree `/home/user/cde2-t5`, branch `t5-settings-storage`, from
`origin/main`, dependencies linked. Read `CLAUDE.md`, `MODEL.md`,
`DECISIONS.md`, `briefs/final-tool.md` (this task is its T5),
`briefs/t1-actions.md`, `briefs/t2-sheet.md`, and all of `src/sheet/`
and `src/views/sheet/`. Then read, in full, the frozen mock at
`/home/user/blocks-on-the-plot-v57.html`: its settings window (the
nine tabs, every row and its one-line explanation), `setSetting`,
`DEFAULTS`, `migrate`, `save`, `load`, `start`, "Back to the sample",
"This is it", "Clear the plan", and its page layout (the fixed-height
sentence, the sheet taking the height left). The mock is the
specification. Do not copy it into the repository.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: `git push -u origin t5-settings-storage` and open a pull
request against `main`, "T5: settings, saving, and the page", ending
with "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
and the session URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`,
`PLAN.md`, `tests/guard.test.ts`, `src/geometry`, `src/model`,
`src/bubbles`, `src/zoning`, `src/views/plan`, `src/views/zoning`,
`src/views/bubbles`, `src/views/massing`. Another agent is working in
`src/views/sheet/SheetStage.tsx` at the same time on storeys and the
mass: keep your edits there to the smallest that works, and say in the
pull request exactly what you changed in that file. Storeys, heights
and the mass are that task's, not yours: leave the Storeys tab of the
settings window to it, or add the tab with only the rows that already
have settings in `src/sheet`.

## Goal

The owner opens the tool from a link, sees the sheet fitted to the
window with the sentence in view, changes any setting where they
expect to find it, and comes back tomorrow to the plan they left.

## What to build

**Settings.** One window, the mock's nine tabs with every row and its
one-line plain explanation: Landing and overlaps, Snapping, Drawing
and Reshape, Doors and windows, Labels, Spaces and boundary, Motion,
Colours, Storeys. Nothing settable stays only in code. The few in
daily use stay on the surface as the mock's behaviour strip has them
(the landing rule, Build to the boundary); everything else lives in
the window, which opens on the tab for the step in use. "Reset to the
spec" puts back the settings saved as the spec. Colours: a swatch per
category with a picker, and the room's own colour from its menu, as
the actions already allow.

**The spec.** The owner's settings of 17 September are in the mock's
artifact store as `settings/spec`; the values in the mock's `DEFAULTS`
are the same numbers. Ship `DEFAULTS` as the defaults and let "This is
it" write the current settings and sheet as the spec and the sample.

**Saving.** The sheet, the settings and the storey count autosave to
browser storage and, where the page is served from claude.ai, to the
artifact store (`sheet/current`, `settings/current`), debounced; they
load on start, the embedded sample sheet when there is nothing saved.
"Back to the sample" restores the sample; "Clear the plan" empties the
sheet and it stays empty across reloads. If E1's `src/views/sheet/
store.ts` is already in `main`, build on it rather than beside it.

**The page.** The stage takes the height of the window: the sheet and
the mass beside it fill what is left under the toolbars, the sentence
is a fixed-height line always in view, and nothing falls below the
fold on a 1280 × 720 window. The program column scrolls on its own.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` green; the
   existing suites unchanged in what they check.
2. Unit tests: every setting in `DEFAULTS` is reachable from the
   window (a test that reads the rendered rows and fails if a setting
   has no row); `setSetting` validation for each kind; the spec round
   trips.
3. Playwright, each named: nothing on the Sheet tab is below the fold
   at 1280 × 720 and the sentence is visible; change the grid in the
   window and a nudge moves by the new step; change a category colour
   and the rooms and the program blocks take it; "Clear the plan"
   survives a reload; "Back to the sample" restores the owner's
   sheet; a sheet edited, reloaded, comes back as it was.
4. Every exported name is imported by another file or a test.

## Standards

Usability: the actions above in the running app. Accuracy: the mock's
numbers. Performance: the T2 render budget still met. Tidiness: no
history in comments, small files, one responsibility each.
