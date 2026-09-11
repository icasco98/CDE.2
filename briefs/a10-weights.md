# A10: Weights as the three families

## Where you work

Worktree `/home/user/cde2-a10`, branch `a10-weights`, created from `origin/main`, dependencies installed. Work only there. Read `CLAUDE.md`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `rulebook/forces.md`, then `src/model/types.ts`, `src/model/persistence.ts`, `src/model/parse.ts`, `src/model/project.ts`, `src/views/requirements/WeightsSection.tsx`, `tests/e2e/requirements.spec.ts`. Never read anything outside this worktree.

Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`. Messages in prose saying what changed and why, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AWEechCMNuCDVKnwnK5VGR
```

When done, `git push -u origin a10-weights`. No pull request. Do not touch `main`, `MODEL.md`, `DECISIONS.md`, `PLAN.md`, `tests/guard.test.ts`, or any file under `src/views/bubbles`, `src/views/zoning`, `src/rulebook`.

## Goal

The three placeholder sliders (client, climate, budget) become the three families of forces the tool balances: **user requirements**, **site constraints**, **environmental factors**, as `rulebook/forces.md` names them. A project saved with the placeholder keys opens without loss.

## What changes

1. **Keys.** In `src/model/types.ts` add `export const families = ['userRequirements', 'siteConstraints', 'environmentalFactors'] as const` and `export type Family = (typeof families)[number]`. `Weights` stays `Readonly<Record<string, number>>` so the store is not widened; the screen and the migration use `families`. Export `families` and `Family` from `src/model/index.ts`.
2. **Migration.** Bump `PROJECT_VERSION` to 3. Add the migration from 2: `client` becomes `userRequirements`, `climate` becomes `environmentalFactors`, `budget` is dropped (budget is force U13 inside the user family now), `siteConstraints` is absent, which the screen reads as the middle value. Any other key is dropped. A test round-trips a version 2 document with the three old keys and checks the result; another checks a version 1 document still migrates through both steps.
3. **Screen.** `WeightsSection.tsx` lists the three families with labels "User requirements", "Site constraints", "Environmental factors". Replace the note with one sentence: the three families the tool balances; the forces inside each are listed in the rulebook. Range and step unchanged. Slider inputs get `aria-label` equal to the family label so the e2e test can address them by role and name.
4. **Tests.** Update `tests/e2e/requirements.spec.ts` if it names the old labels; add a Playwright step that moves the "Site constraints" slider and sees its number change and survive a reload (autosave). `tests/app.test.tsx` if it names them.

Nothing else. Do not add a weight for anything but the three families. Do not rename `Weights`.

## Definition of done

- `npm run check`, `npm run test:e2e`, `npm run build` pass.
- The three names are on screen; the old keys never appear in `src/`.
- Reference case: the document `{"version":2,"weights":{"client":0.8,"climate":0.2,"budget":0.4}, ...}` opens as `{"userRequirements":0.8,"environmentalFactors":0.2}` and the site slider shows 0.50.
- Usability: on the Requirements tab the three sliders read as the families with no explanation needed.

## Report

End with what changed, files touched, the migration test's exact input and output, and anything you decided that the brief left open.
