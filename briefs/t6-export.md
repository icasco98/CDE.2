# T6: Export from the Sheet, and the old Plan tab removed

## Where you work

Worktree `/home/user/cde2-t6`, branch `t6-export`, from `origin/main`,
dependencies linked. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`,
`briefs/final-tool.md` (this task is its T6 and the removal that
follows it), `briefs/t1-actions.md`, `briefs/t2-sheet.md`,
`briefs/t4-storeys-mass.md`, all of `src/sheet/` and
`src/views/sheet/`, and `src/export/` with its tests.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`,
prose messages, ending with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Tvrq4PHCRbHAxpgBrYVtB
```

Finish: push `t6-export` and open a pull request against `main`,
"T6: export from the Sheet, and the old Plan tab removed", ending with
"🤖 Generated with [Claude Code](https://claude.com/claude-code)" and
the session URL. Do not touch `main`, `MODEL.md`, `DECISIONS.md`,
`PLAN.md`, `tests/guard.test.ts`, `src/geometry`, `src/model`.

## Goal

The owner prints the plan they drew on the Sheet, to scale, and opens
it in AutoCAD; and there is one zoning tool in the app, not two.

## What to build

**Export.** PDF to scale and DXF per storey, produced in the browser
from a `Sheet` in `src/sheet/`, reusing `src/export/` where it already
does the work and replacing what assumed the old project. One sheet
per storey, the plot, the setback line, the rooms with their names and
areas, the doors where they exist, north, a scale bar, the title. A
printed sheet measures true at its stated scale; the DXF opens with a
layer per storey.

**The removal.** Delete the Plan (old) tab and everything only it
used: `src/views/plan`, `src/views/zoning`, `src/views/massing`, the
parts of `src/zoning` and `src/massing` nothing else imports, their
tests, and their Playwright suites. Keep whatever the Bubbles stage,
the Requirements screen, `src/sheet` or `src/export` still import; say
in the pull request what you kept and why. The app's stages become
Requirements, Bubbles, Sheet.

Work in this order and commit separately: export first, green, then
the removal, so the removal's diff is only deletions and the tests
that went with them.

## Definition of done

1. `npm run check`, `npm run test:e2e`, `npm run build` green.
2. The export reference cases from A8 still hold, re-pointed at the
   Sheet: a 20 m plot edge drawn 200 mm wide to better than half a
   percent, and the DXF's layers per storey.
3. Playwright: from the Sheet, Export PDF produces a file and Export
   DXF produces a file; the app has three tabs and no Plan.
4. Nothing exported that nothing imports; no file left that only the
   deleted views used.

## Standards

Usability: printing works from the Sheet in the running app.
Accuracy: the scale reference cases. Tidiness: the removal leaves no
dead code and no inert feature.
