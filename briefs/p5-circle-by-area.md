# P5: A circle by target area

Worktree `/home/user/cde2-p5`, branch `p5-task`. Read `CLAUDE.md`, `PLAN.md` (row P5), `briefs/g5-draw-tool.md`, then `src/views/zoning/{draw.ts,drawing.tsx,ZoningView.tsx,defaults.ts}`, `src/geometry/arcs.ts`, `tests/e2e/draw.spec.ts`. **File ownership:** three other tasks run beside you. You own `draw.ts`, `drawing.tsx`, `draw.test.ts`, `tests/e2e/draw.spec.ts`, and the Circle-related lines of `ZoningView.tsx` only; do not touch any css file (P4), `src/app/*` and `src/styles.css` (P6), or the model (P7).

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

First run `git fetch origin main:refs/remotes/origin/main && git merge --no-edit origin/main`. Never read /home/user/Conceptual-Design-Engine or any other checkout. Run Playwright against your own dev server on a free port through a temporary config with `reuseExistingServer: false`, deleted before committing. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`.

## Why

The Circle tool draws whatever radius the drag gives, so a round guest WC reads "7.1 of 3 m²". A person drawing a circle for a room wants its target area unless they say otherwise.

## What changes

1. With Circle active and a tray room chosen, a single click (press and release within 3 px) draws the circle of the room's target area centred on the click: radius `sqrt(targetArea / π)` snapped to the nearest 0.05 m, area shown exact. A press and drag still sets the radius by hand as today, and the hint says both: "Click for the target size, or drag a radius."
2. While dragging, the preview label reads the live area and, faint beside it, the target ("7.1 · target 3").
3. Snapping to 0.25 m steps stays for the drag; the target circle uses 0.05 m so the area lands within 3% of target (state the arithmetic in one comment and test it for 3, 5 and 20 m²).
4. Done when: unit tests for the radius arithmetic at three areas; Playwright: pick Guest WC, Circle, one click, the label reads "3.0 of 3 m²" (or the exact formatted equivalent the label uses); a drag still gives the dragged radius.

## Report

What you changed, the three reference radii and areas, the test numbers, anything you decided that the brief left open.
