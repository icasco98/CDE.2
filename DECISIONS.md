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
