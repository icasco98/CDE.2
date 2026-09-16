# The zoning mock, stage 2

The brief for the next stage of the zoning mock ("Blocks on the Plot",
the artifact the owner plays with), written with the owner on
16 September 2026 after stage 1 was judged complete for its purpose.
Stage 1's settings are saved as the spec in the artifact's store
(`settings/spec`) and are the standing brief for the real zoning sheet.

The interface still needs work; the features of stage 1 are done. The
order below is the owner's. Windows, circulation and fog of war come
last, after storeys and massing exist, so daylight and sight lines
have heights to work with.

## 1. Overlaps by importance, exhaustive settings, colours, two steps

**Overlaps.** The Fix overlaps button goes. The landing switch has two
positions, Wait and Push, Wait the default. Wait: the dropped room lands
where it was put, the overlap is tinted and nothing moves. Push: the room
lower in the program slides aside at once, never shrinking. An overlap is
settled by right-click on either room: the menu offers, for each of the
two, "gives way: pushed, trimmed or carved", for that pair only. The
program's order is the order of importance, changed by dragging a block's
grip; Push uses it. (Owner's decision, 16 September 2026: Wait was cut in
the first pass and brought back as the default; Trim and Carve live only
in the right-click menu.)

- The program order is the order of importance. When two rooms
  overlap, the lower one gives way, pushed, trimmed or carved as the
  landing rule says; the higher one never moves. The program is
  reordered by dragging blocks in the column.
- Right-click an overlapping pair and the menu offers "Kitchen gives
  way" or "Dining gives way", each with the three ways. Nothing waits
  for a button.
- The landing rule strip stays as the default for a drop.

**Settings, exhaustive.** Every setting of every feature lives in the
settings window, each with a one-line plain explanation, grouped by
tab: Landing and overlaps, Snapping, Drawing and Reshape, Doors and
windows, Labels, Spaces and boundary, Motion, Colours. Nothing settable
stays hidden in code. The window opens on the tab for the step in use.
Reset to the spec stays.

**Colours.** A Colours tab with a swatch per category (reception,
shared, private, service, circulation, open ground), each a colour
picker, plus a per-room override from the room's right-click menu,
with a row to go back to the category colour. The program block takes
the room's colour. Colours save with the sheet and go into the spec.

**Two steps.** A segmented switch at the top left: Zoning · Openings.
Sheet, program and settings persist; the tools and the sentence change.
Esc never changes step. Z and O switch; D still opens Openings.

- *Zoning toolbar*, grouped by what it acts on: Sheet (Undo, Redo, Fit,
  Measure, Settings, ?), Room (Rotate 90°, Reshape, Restore shape,
  Group, Lock), Clear the sheet apart at the right. The behaviour strip
  under it: landing rule, Build to the boundary. Sheet: names only. The
  sentence: placed of asked, spills, shortfalls, boundary reading.
- *Openings toolbar*: Sheet as above; Place (Door, Double, Sliding,
  Opening, Open wall, Street door, Double street, and later Window,
  with the width field); Selected (Swing, Hinge, − width +, Remove)
  when something is selected. No behaviour strip. The program column
  becomes a room list without areas; clicking a room lights its walls.
  Rooms fade to outlines; every click is about a wall or an opening.
  The sentence: walk reached of total, unreached rooms, entry and
  diwaniya doors, corridors' door counts. No areas anywhere.

## 2. Storeys and massing in the mock

**First objective, above all others: the mass is the plan.** Dragging
a volume in the 3D view moves that room on its storey's sheet, with the
same snaps, the same rule on landing and the same pushing of
neighbours, and the sheet redraws as you drag. Both views are one
model with two windows on it; either window can be the one you work
in. The first artifact's objective, the brief for a layout the owner
makes himself, is met; this one tests stacking and the mass.

**Moving zones in the mass, kept to intuition.**

- One switch, Edit in 3D, on by default. On, the mass takes the
  sheet's gestures and no others; off, volumes only select.
- One gesture to move: take a volume by any face and drag; the room
  slides on its storey, its footprint moving on the sheet at the same
  time, and the landing rule applies on the drop. Never up or down;
  storeys change from the program or the menu.
- One gesture for height: drag the post's knob, or the zone's height
  slider. The only vertical gesture.
- The knob and the wall handles appear on the selected volume's top
  edges. A pulled wall lines up with a neighbour's wall or corner
  within snapping reach, as on the sheet, with the guide drawn on the
  ground. Right-click a volume for the room's menu, the overlap rows
  included. No new tools; nothing lives only in 3D.
- Selection is shared between the windows; hover in one lights the
  other. Volumes carry no names; the selected one is named under the
  view.
- The camera: drag on empty ground, or anywhere with the middle
  button or Space held, turns the view; the wheel zooms and turning
  never does; four preset views (plan, from the service street, from
  the side street, from the neighbours' corner). A ground shadow under
  a dragged volume says where it sits. Faces are drawn far to near,
  so a near volume always covers a far one.

**Zone height and open to below.** Each zone has a height slider. A
zone taller than its storey shows on the storey above as its footprint
with an X, "open to below": it takes that space, nothing can be placed
over it, and it counts once. Shortening it back removes the X.

**Doors.** The Openings step stays as it is so the tool feels whole;
nothing new is built on it in this stage.

**Rulebook correction (owner, 16 September).** The ground floor may
stand on a neighbour boundary for at most half that side's length, not
the whole side; the street side keeps half the frontage and the 15 m
cap. Every side gets its own budget, read under the sheet and red when
spent. `rulebook/municipality-private-housing.md` is corrected with
this brief.


A storey switch beside the step switch: Ground · First · Second,
later. Each storey is its own sheet on the same plot, with the storey
below drawn faint under it for alignment. The program column shows the
storey's rooms, and a block can be sent to another storey. The stair is
one block standing on every storey it reaches: moved on one, moved on
all. Upper storeys never build to the boundary and keep the setback
line hard. The sentence reads per storey and in total against the
Municipality ratio for this plot. The planned second storey is a
checkbox: drawn, counted and marked planned (P8).

## 3. Massing beside the plan

A 3D view alongside the sheet: the storeys stacked at the heights the
rulebook allows, the 15 m limit, the 5 m limit on boundary walls, the
first floor stepping back to the setback line, the planned storey
ghosted. Turned by dragging. The plan and the massing stay in step.

## 4. Windows, circulation, fog of war

On the massing, once it exists.

- A window is placed like a door: pick Window, click an outside wall.
  It refuses on a shared wall and on a boundary wall, since those are
  blind. Drawn as a thin double line with a sill tick; it has a width
  and slides like a door. A room with no window, and no open wall to a
  room that has one, is listed as unlit: the first daylight check.
- Circulation and fog of war: what a guest sees from the diwaniya
  door, what the family sees from the family living, read off the
  doors and windows with heights known.

## Standing rules that carry over

- Everything manual; physics sleeps. The interaction is shaped in the
  mock first; the saved settings become the brief for the real sheet.
- Every change is tested on the owner's saved layout, not on a fresh
  one, before it is published.
- The gesture the owner describes is the gesture that is built.
