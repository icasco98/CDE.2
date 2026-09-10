# Conceptual Design Engine

A conceptual design tool for houses in Kuwait: from a room program to a
bubble diagram to a zoning plan to a massing, in one sitting, with every
recommendation justified. The graph is the truth and geometry is a view
of it: a house at this stage is a set of rooms and the connections
between them, and where the rooms sit on the sheet is only how that
graph is being drawn right now. Nothing ever infers a connection from
where two walls happen to land.

## Run

Node 22.

```
npm ci
npm run dev
```

## Check

```
npm run check      # typecheck, lint, unit tests, guard
npm run test:e2e   # browser tests; starts the dev server itself
npm run build
```

## Read first

`CLAUDE.md` (how to work here), `MODEL.md` (the data model, the only
authority on what the tool is), `DECISIONS.md` (choices made and why),
`PLAN.md` (the ordered task list).
