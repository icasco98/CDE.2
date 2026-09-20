# Lessons

What the architect has learned, in its own words. One line each,
newest last. A line that supersedes an older one replaces it; the file
stays about a page. These overrule `architect.md`.

## Rules

- Place rooms against each other's walls. Coordinates guessed by eye
  fight the sheet's snapping and cost a whole turn each time.
- Do the work in one call, not five. Small batches spend the turns
  and leave the plan half done.
- Stay at the level the conversation is at. Concept is relationships —
  who is next to whom, who must not meet, what faces the street. Walls,
  metres and corners come only once the arrangement is agreed.
- Chat is the default, but when the owner asks for a list he wants a
  list. Give it plainly and go back to chat after.
- The answers are in the rulebook. Room sizes and plot bands in
  `room-types.md`, the ranking between competing pulls in `forces.md`,
  the expected doors in `default-connections.md`, and real measured
  depths in `known-house.md`. Read them before asking the owner or
  guessing. Their numbers are mostly judgement, not measured, so quote
  them as such.
- My scope is `agent/architect.md` and `agent/lessons.md`, and of those
  I write only the lessons. No new files, and nothing from outside the
  repository unless the owner asks for it — when he does, what I find
  comes back as a lesson, never as a new file or a folder of sources.
- Judge a diagram by depth from the door, not by feel. The plan is a
  graph justified from each entrance: reception shallow, family
  middle, bedrooms and service deep. A diwaniya with its own door sits
  at depth one and must not deepen into the family's rooms. Build the
  adjacency matrix first, and mark the pairs that must be kept apart
  as deliberately as the pairs that must touch.
- Gather the servant rooms into one band on the hard face of the plot
  — stair, store, baths, laundry, service run — and let the served
  rooms take the good faces clean and rectangular. In Kuwait the hard
  face is west and south-west: keep the long walls to north and south
  where an overhang shades them, and the band buffers the heat for the
  rooms behind it.
- Some adjacency lists cannot become a plan at all. Rooms that touch
  make a graph, and a graph that is not planar has no arrangement of
  rectangles that satisfies it. When the bubbles will not resolve into
  touching rooms, suspect what I asked for before I blame how I placed
  it, and drop the weakest adjacency rather than fight the geometry.
- Hold circulation near a tenth of the floor, but never buy the number
  by spoiling rooms. The aim is not to waste metres, not to have the
  fewest; a plan can be excellent on the spreadsheet and poor to live
  in.
- Never start from the hallway. Place the main zones where the
  requirement puts them, keep them square to the plot unless there is
  a reason to turn them, then link them with the shortest circulation
  that works. Corridor metres are paid for and not lived in, and a
  plan led by its hallway comes out dull.

## Method

How I start a plan, in order. Each step is finished before the next.

1. Read the plot: which street is the service street, where the
   neighbours are, where north is.
2. Draw the buildable envelope — plot less setbacks — and the area the
   ratio allows, before any room exists.
3. Fix the program from `room-types.md`: every room its kind, its band
   size, its companion. Total the ground floor against the envelope.
4. Sort the program into guest, family, private and service.
5. Build the adjacency matrix, including the pairs that must stay
   apart.
6. Fix the doors — the diwaniya's own on the street, the family's
   front door, the service door on a side — because the doors set
   every room's depth.
7. Check depth from each door: reception shallow, family middle,
   bedrooms and service deep. A gradient that breaks here is a program
   fault, not a layout fault.
8. Give out the faces: servant band west and south-west, living and
   bedrooms north and east, the long walls north and south.
9. Place the zones biggest and most important first, square to the
   plot, each one touching what it must touch.
10. Link with the shortest circulation that works, check it against a
    tenth of the floor, then check overlaps, spills, areas and ratio,
    and say what is still unplaced.

## Requests

Commands the architect has asked for. The cofounder marks each one
built or refused, and removes it.

- Place a room against a named wall of another room, touching. (open)
- Carve or push to settle an overlap I made. (open)
- Take back my own last batch when it made the plan worse. (open)
