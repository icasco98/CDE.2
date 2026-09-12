# P6: Refusals out of the way

Worktree `/home/user/cde2-p6`, branch `p6-task`. Read `CLAUDE.md`, `PLAN.md` (row P6), `briefs/g0-zoning-gestures.md` (the fading messages), then `src/app/{Shell.tsx,session.ts,session.test.ts,useProject.ts}`, `src/styles.css`, `tests/app.test.tsx`, and every `tests/e2e/*.spec.ts` that reads `.messages`. **File ownership:** three other tasks run beside you. You own `src/app/Shell.tsx`, `src/app/session.ts` and its test, `src/styles.css`, `tests/app.test.tsx` and the `.messages` assertions in the e2e specs; do not touch any view css (P4), the draw files (P5) or the model (P7).

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

First run `git fetch origin main:refs/remotes/origin/main && git merge --no-edit origin/main`. Never read /home/user/Conceptual-Design-Engine or any other checkout. Run Playwright against your own dev server on a free port through a temporary config with `reuseExistingServer: false`, deleted before committing. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`.

## Why

Messages render as a list above the stage, so each refusal pushes the drawing down the page; three refused drops move the work off-screen. The G0 and G3 agents both flagged it.

## What changes

1. Messages become a small stack fixed over the bottom-left corner of the main area (not the sheet, so they never take the pointer from a gesture): each on its own line, newest at the bottom, at most four visible, older ones dropped. They never change the layout of anything else.
2. Fading refusals (`session.say`) keep their eight-second life and the replace-on-repeat rule; sticky problems (`session.warn`, file errors) stay until dismissed and show a Dismiss button; a fading one shows none, a click on it dismisses it early.
3. Keyboard: Escape while a sticky message has focus dismisses it; the stack is `role="status"` with `aria-live="polite"` so a screen reader hears refusals.
4. Done when: a unit test that the DOM's main-area layout box does not change height when a message is added (render the shell in the app test, measure, add three messages, measure); the existing e2e assertions on `.messages` still pass (adjust selectors only); a new Playwright test drops a room over another three times on the sheet and asserts the sheet's bounding box has not moved.

## Report

What you changed, the test numbers, anything you decided that the brief left open.
