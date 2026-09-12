# P7: Storey count under undo

Worktree `/home/user/cde2-p7`, branch `p7-task`. Read `CLAUDE.md`, `MODEL.md` (Operations: undo now covers storeys), `PLAN.md` (row P7), `briefs/a7-massing.md`, `briefs/f1-storeys-companions.md`, then `src/model/{project,actions,store,invariants}.ts` and their tests, `src/views/requirements/{storeys.ts,storeys.test.ts,ProgramSection.tsx}`, `tests/e2e/requirements.spec.ts`. **File ownership:** three other tasks run beside you. You own `src/model/*`, `src/views/requirements/storeys.ts` and its test, and `tests/e2e/requirements.spec.ts`; do not touch any css, any other view, or `src/app/*`.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

First run `git fetch origin main:refs/remotes/origin/main && git merge --no-edit origin/main`. Never read /home/user/Conceptual-Design-Engine or any other checkout. Run Playwright against your own dev server on a free port through a temporary config with `reuseExistingServer: false`, deleted before committing. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`.

## Why

The storey count sat outside undo while heights sat inside it, so `restore` fits heights to the count in hand and undoing Add storey restores the stair's span but not the count. Two tasks bumped into this. The model now says undo covers storeys.

## What changes

1. `Snapshot` in `project.ts` gains `storeys`; `snapshotOf` and `restore` carry it; `fitHeights` and its comment go, since heights and storeys now travel together and always agree. `addStorey` and `removeStorey` record an undo step like any other action (they may already; make sure a snapshot is taken).
2. `removeStorey` keeps refusing while rooms stand on the top storey; undo of an Add storey that stretched a stair (the transaction in `storeys.ts`) restores count, heights and the stair in one step, and redo brings all three back.
3. Invariant: after any undo or redo, `heights.length === storeys` and every room's storey and span lie inside the count; add this to `checkProject` if not already there and test it through undo.
4. Done when: unit tests for undo and redo of Add storey with a stair (count, heights and span all revert together), of Remove storey, and of a sequence add, add, undo, undo; the requirements Playwright test gains: Add storey, Undo, the storey selector offers only Ground and the stair row reads From Ground To Ground (or whatever a one-storey stair reads).

## Report

What you changed, the test numbers, anything you decided that the brief left open.
