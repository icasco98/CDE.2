# Decisions

Each entry: what was decided, why, and what it replaced. Newest last.
A reversal is a new entry, never an edit.

1. **The graph is the truth; geometry is a view.** Rooms and explicit
   edges are stored. Bubble diagram, zoning and massing render the
   same graph. Replaces a tool where geometry was primary and
   adjacency was inferred from walls within 4 cm, which made the
   analysis fragile and the generator blind.

2. **Moving a room never changes an edge.** Only connect and
   disconnect edit the graph. The tool may propose an edge when rooms
   come to touch; a person accepts it. Reason: an inferred edge is
   the failure mode we are escaping.

3. **Walls and forces.** Hard constraints are walls, never traded.
   Soft preferences are forces with a name, direction, magnitude,
   source and default strength for Kuwait. Weights are set by a person
   and always visible. Replaces one blended score.

4. **The output is a short list, not one answer.** The feasible region
   is ranked by forces; several typologies are settled and shown side
   by side with trade-offs. "Perfect" is not a word the tool uses.

5. **Rooms are rigid, rotatable polygons** with position, rotation and
   size, solved by forces with collision. Chosen over a cell grid
   because rotation of a single room is valued and a grabbable room is
   friendlier than painted cells. Complex footprints come from
   rotation, carves, the union of rooms, and hand-drawn shapes the
   solver treats as pinned.

6. **The solver never fights the hand.** A room a person has touched is
   pinned until released, and pinned rooms are marked.

7. **Storeys are assigned at the bubble stage**, visibly, by a vertical
   force or a layered view. The massing step never invents them.

8. **Accuracy is layered under a clean surface.** Verdict on the
   surface; rule, number, source, assumption and confidence one click
   down; assumptions editable where shown; no number without a
   reference case; precision matches the stage.

9. **Provisional rules can only recommend.** A rule without a source is
   never a hard problem.

10. **Fresh repository, no old history.** Salvaged files are copied in
    stripped of narrative comments. The old repository is an archive
    and is never consulted by an agent.

11. **No server in the first milestone.** Autosave to browser storage,
    export and import a project file. PDF and DXF are produced in the
    browser. Python arrives only with simulation and IFC.

12. **Visual design is deferred.** The reference is hand-drawn,
    cut-paper, warm and restrained; two registers, one for the story
    and bubbles, one for the plan and numbers. Decided after the model
    and the first loop exist.

13. **Kuwait first.** Compliance and comfort sell; energy savings do
    not, because electricity is subsidised. Verify the current MEW
    energy code and Kuwait Municipality editions before the rulebook.

14. **The Municipality page is the regulation.** The tool follows the
    private and model housing rules as published on baladia.gov.kw
    (amended by Resolution 451/2016, retrieved 10 September 2026).
    News reports of later resolutions are not a source. When the
    website changes, the owner supplies the new text and the rulebook
    entry is updated with a new retrieval date.

15. **Models.** The cofounder (Claude, on Fable) writes briefs and
    reviews every diff. Agents that implement tasks run on Opus for
    work that needs judgement (geometry, solver, rule engine, any
    screen a person uses) and on Sonnet for mechanical work fully
    determined by the brief (tooling, scaffolding, formatting). Agents
    never run on Fable, to conserve it for review.

16. **Massing is drawn, not rendered.** The massing view is a
    parallel-projection (axonometric) SVG of each storey's footprints
    extruded to that storey's height, in the same DOM as the other
    views: a room is a `<g data-room>` like everywhere else, selection
    and hover are ordinary events, the printed sheet reuses the SVG,
    and there is no WebGL and no 3D library. Four fixed view
    directions and a horizontal orbit are enough to read a mass. A
    true 3D viewer, if ever wanted, arrives with IFC in milestone 5.

17. **The bubbles sit on the plot.** The bubble sheet draws the plot,
    the buildable line from the Municipality setbacks, north and the
    street sides at the zoning scale through the shared camera. A
    bubble's position is in plot metres, the frame a footprint uses,
    so a bubble and the zone it becomes are the same point. One plot
    per storey, chosen by tab; All shows the upper storey's bubbles
    faint over the ground. The stacked bands go. The site and
    environmental forces act here, on coordinates, which is the only
    place they can.

18. **Bubbles at true area, overlapping up to a quarter.** A bubble
    is drawn at its target area. Two bubbles may overlap by up to a
    quarter of the smaller one's area, the slack between packed
    circles and packed rectangles, and never wholly; the repulsion is
    soft inside that quarter and a wall beyond it. While settling,
    bubbles are held inside the buildable line. A hallway is an
    ellipse of its area, long axis along the rooms it serves; a stair
    stays a circle, and its twins settle to the same spot on every
    storey.

19. **The morph is a proposal, deterministic, and may spill.** The
    zones are the bubbles inflated in place: each circle into a
    rectangle of its area within the proportion range of its kind,
    the ellipse into a corridor, links into doors, then joins and
    alignment. The same bubbles always give the same plan. The result
    is shown dashed with Accept and Back to bubbles; Accept commits
    the store once, so one undo returns to the bubbles; Back plays
    the morph in reverse and writes nothing. Slivers left between
    rooms go to the rooms up to the top of their range, the rest to
    circulation. A plan that does not fit is never refused: rooms
    past the buildable line are drawn hatched outside it with the
    overflow in m², the rooms with slack above the bottom of their
    range are offered for reduction one click each, and when every
    room at its minimum still does not fit the sheet says the storey's
    program is too big for the plot by that much. The tool never
    shrinks a room on its own. The same fit line stands on the
    Requirements totals, before a bubble is drawn.
