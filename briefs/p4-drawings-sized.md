# P4: Drawings sized to the space left

Worktree `/home/user/cde2-p4`, branch `p4-task`. Read `CLAUDE.md`, `PLAN.md` (row P4), `briefs/g3-plan-tab.md`, `briefs/a12-zoom-pan.md`, then `src/views/plan/*`, `src/views/zoning/{ZoningView.tsx,frame.ts,zoning.css}`, `src/views/massing/{MassingView.tsx,frame.ts,massing.css}`, `src/views/bubbles/{BubblesView.tsx,bubbles.css}`, `src/views/camera.ts`, `src/app/Shell.tsx`, `tests/e2e/plan.ts`. **File ownership:** three other tasks run beside you. You own `src/views/plan/*`, `zoning.css`, `massing.css`, `bubbles.css`, the three views' sheet sizing code and `tests/e2e/plan.spec.ts`; do not edit `src/styles.css`, `src/app/Shell.tsx` (P6 owns them), the draw files (P5), or the model (P7).

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

First run `git fetch origin main:refs/remotes/origin/main && git merge --no-edit origin/main`. Never read /home/user/Conceptual-Design-Engine or any other checkout. Run Playwright against your own dev server on a free port through a temporary config with `reuseExistingServer: false`, deleted before committing. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`.

## Why

Each sheet is 65vh tall, so on a 1280 × 720 window the Plan tab and the Bubbles tab scroll and the bottom of the drawing is below the fold; the G3 agent tried a smaller share and backed it out because screen-sized marks are computed from the sheet's size.

## What changes

1. The three sheets (bubbles, zoning, massing) take the height left under their bars: the page's main area fills the viewport below the shell header (flex column, `min-height: 0`), each stage's bar takes its natural height, and the sheet fills the rest. No fixed vh anywhere. A minimum of 320 px so a very short window still shows something, and then the page may scroll.
2. The sheets already measure themselves through a ResizeObserver for the camera and screen-sized marks; confirm every mark keeps its screen size when the sheet's height changes (resize the window in a Playwright test and read a handle's rendered size before and after: equal to 1 px).
3. The Plan tab's split handle and the Sheet/Both/Massing buttons keep working; at phone width the halves stack and each takes at least 320 px.
4. Done when: on a 1280 × 720 window with the default two-storey program laid out, no part of the Plan tab's drawings, bars or the street edge of the plot is below the fold (assert `document.documentElement.scrollHeight <= innerHeight + 1` on Requirements-free tabs, or that the sheet's bounding box bottom is within the viewport); the same on Bubbles; every existing Playwright test passes unchanged in behaviour (update only what asserted a vh height).

## Report

What you changed, the measured scroll height before and after on 1280 × 720 and 1440 × 900, the test numbers, anything you decided that the brief left open.
