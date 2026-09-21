# The course: how the architect used the tool

Thirty runs, three for each task, each a fresh architect with its own two pages, the tool
descriptions and the desk. Every pass condition is read from the sheet the tool left behind.

| Task | Passed | Runs |
| --- | --- | --- |
| t1-give — Give a space away | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t2-court — Make a court | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t3-court-refused — A court refused | 1/3 | 1: PASS, 2: FAIL, 3: — |
| t4-against — Against a wall | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t5-carve — Settle by carving | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t6-north — Face north | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t7-open-below — Open to below | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t8-storey — Another storey, not your view | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t9-door — A door between two rooms | 3/3 | 1: PASS, 2: PASS, 3: PASS |
| t10-door-refused — A door refused | 3/3 | 1: PASS, 2: PASS, 3: PASS |

## The failures, one line each

- **t3-court-refused-2** · wrong choice · the refusal was read and then engineered around: it moved and resized all four rooms with place_rooms to widen the middle to 12.3 m² and made the court the owner could not have there

## What the course could not test

- Whether the architect designs well: every task here has one right move, and the course says nothing about the judgement behind a whole layout.
- Whether the architect writes anything into its memory: remember was never called in thirty runs, and the chat's end-of-message ask for lessons belongs to the running page, not to the desk.
- The honesty line: NOTHING_PLACED is written by the chat around a message, so a run that narrates without calling anything shows here only as a task failed with no command, not as the line the owner would see.
- Anything on screen: the desk is the tools, so a gesture, the storey switch and the drawing itself are only read back from the model, never exercised.

## The numbers behind each run

- **t1-give-1** PASS · 1 commands · the space, m² 10.24; the kitchen before, m² 33.44; the kitchen now, m² 43.68; grew by, m² 10.24; enclosed space left in the middle, m² 0
- **t1-give-2** PASS · 1 commands · the space, m² 10.24; the kitchen before, m² 33.44; the kitchen now, m² 43.68; grew by, m² 10.24; enclosed space left in the middle, m² 0
- **t1-give-3** PASS · 1 commands · the space, m² 10.24; the kitchen before, m² 33.44; the kitchen now, m² 43.68; grew by, m² 10.24; enclosed space left in the middle, m² 0
- **t2-court-1** PASS · 1 commands · the space, m² 12.25; courts at the middle 1; the court, m² 12.25
- **t2-court-2** PASS · 1 commands · the space, m² 12.25; courts at the middle 1; the court, m² 12.25
- **t2-court-3** PASS · 1 commands · the space, m² 12.25; courts at the middle 1; the court, m² 12.25
- **t3-court-refused-1** PASS · 1 commands · the space, m² 4; courts made 0; the sheet is as it was true; the tool's reason in the last result true
- **t3-court-refused-2** FAIL · 3 commands · the space, m² 4; courts made 1; the sheet is as it was false; the tool's reason in the last result false
- **t4-against-1** PASS · 1 commands · shared wall, m 4.5; overlaps 0; rooms outside the line 0
- **t4-against-2** PASS · 1 commands · shared wall, m 4.5; overlaps 0; rooms outside the line 0
- **t4-against-3** PASS · 1 commands · shared wall, m 4.5; overlaps 0; rooms outside the line 0
- **t5-carve-1** PASS · 1 commands · the overlap, m² 6; the store lost, m² 6; the family living, m² 36; overlaps left 0
- **t5-carve-2** PASS · 1 commands · the overlap, m² 6; the store lost, m² 6; the family living, m² 36; overlaps left 0
- **t5-carve-3** PASS · 1 commands · the overlap, m² 6; the store lost, m² 6; the family living, m² 36; overlaps left 0
- **t6-north-1** PASS · 1 commands · the plot's north, ° 25; the diwaniya, ° 25; its area, m² 30; its area before, m² 30
- **t6-north-2** PASS · 1 commands · the plot's north, ° 25; the diwaniya, ° 25; its area, m² 30; its area before, m² 30
- **t6-north-3** PASS · 1 commands · the plot's north, ° 25; the diwaniya, ° 25; its area, m² 30; its area before, m² 30
- **t7-open-below-1** PASS · 1 commands · the storey, m 3.5; the stair hall, m 5; the first storey reads open to below Stair Hall
- **t7-open-below-2** PASS · 1 commands · the storey, m 3.5; the stair hall, m 5; the first storey reads open to below Stair Hall
- **t7-open-below-3** PASS · 1 commands · the storey, m 3.5; the stair hall, m 5; the first storey reads open to below Stair Hall
- **t8-storey-1** PASS · 1 commands · the bedroom stands on storey 1; the storey the desk shows 0; the bedroom is on the sheet true
- **t8-storey-2** PASS · 1 commands · the bedroom stands on storey 1; the storey the desk shows 0; the bedroom is on the sheet true
- **t8-storey-3** PASS · 1 commands · the bedroom stands on storey 1; the storey the desk shows 0; the bedroom is on the sheet true
- **t9-door-1** PASS · 1 commands · doors on the shared wall 1; doors the entry counts 2; doors the family living counts 1; the walk reaches the family living true
- **t9-door-2** PASS · 1 commands · doors on the shared wall 1; doors the entry counts 2; doors the family living counts 1; the walk reaches the family living true
- **t9-door-3** PASS · 1 commands · doors on the shared wall 1; doors the entry counts 2; doors the family living counts 1; the walk reaches the family living true
- **t10-door-refused-1** PASS · 1 commands · doors on the sheet 0; the tool's reason in the last result true
- **t10-door-refused-2** PASS · 1 commands · doors on the sheet 0; the tool's reason in the last result true
- **t10-door-refused-3** PASS · 1 commands · doors on the sheet 0; the tool's reason in the last result true
