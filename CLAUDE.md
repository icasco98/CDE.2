# Working in this repository

Read this whole file before doing anything. It applies to every task,
every session, every agent.

## What this is

A conceptual design tool for a Kuwaiti architecture firm: from a room
program to a bubble diagram to a zoning plan to a massing, in one
sitting, with every recommendation justified. `MODEL.md` is the data
model and the only authority on what the tool is. `DECISIONS.md` is
the log of choices made and why. `PLAN.md` is the schedule.

If a task conflicts with `MODEL.md`, stop and say so. Do not resolve
the conflict by guessing.

## Removed on purpose. Never reintroduce.

An earlier tool existed. Its code, history and documents are not in
this repository and must not be consulted or recreated. The following
were removed deliberately and must not come back under any name:

- Inferring adjacency, doors or connections from geometry (walls that
  happen to coincide within a tolerance). Edges are explicit and stored.
- A layout generator based on random perturbation or annealing.
- A "training loop", "student", "evaluator" or scenario suite that
  tunes a search.
- Cost or efficiency heuristics that score a layout (gaps, overhangs,
  corridor waste, circulation ratio).
- A server for saving projects. Saving is browser storage plus a file.
- Door "liveness", "frozen" positions, or any machinery for a door
  that has lost its wall. A door is the drawing of an edge; it cannot
  go stale.
- A memo layer keyed on array identity.
- A hand-tuned sample house that satisfies the checker by construction.
- References to conversation plans in code: "Task 3", "Step 6",
  "Phase 2". None.

`tests/guard.test.ts` fails the build if any of these names reappear.
Do not edit the guard to make a build pass.

## Standards, checked on every task

1. **Usability.** Every screen has a stated user action it must make
   possible without explanation. The task is not done until that
   action works in the running app, not only in tests.
2. **Accuracy.** Anything that computes a number ships with a
   reference case: a known input and the known answer it reproduces.
   No reference case, no number. Precision matches the stage;
   uncertainty is part of every result.
3. **Performance.** Anything that runs per frame or per interaction
   has a budget stated in the task and measured before merge.
4. **Tidiness.** Comments explain a non-obvious decision in one
   sentence, never history. Export only what another file imports.
   Small files, one responsibility each. No dead code, no inert
   features left "because nothing asked to remove them".

## Workflow

- One task, one branch, one pull request. The branch name is the
  task's name. Never push to `main` directly.
- Every task brief states: goal, files, definition of done, the
  standard checks that apply. Work only from the brief and this
  repository. Do not look elsewhere for "how it was done before".
- Before a pull request: `npm run check` (typecheck, lint, unit tests,
  guard). Playwright for any change to a gesture or a screen.
- Commit messages say what changed and why, in prose.
- A change to `MODEL.md` or `DECISIONS.md` is its own pull request,
  never folded into a feature.

## Stack

TypeScript, React, Vite in the browser for everything a person
touches. Vitest for units, Playwright for gestures. No server in the
first milestone. A Python service comes later only for simulation and
CAD export, and only when `PLAN.md` says so.

## Names

Rooms, edges, walls, forces, storeys, plot, project. Use these words in
code and on screen. Do not invent synonyms.
