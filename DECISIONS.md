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
    never run on Fable, to conserve it for review. Amended 13 Sep 2026
    on the owner's word: where a task is judgement over craft, the
    morph, the settle, anything a client will see and judge, the
    cofounder says up front that it would outperform an agent and, on
    the owner's word, builds it itself; agents keep the work a brief
    fully determines.

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
    faint over the ground. The stacked bands go. The site forces act
    here, on coordinates, which is the only place they can; the
    environmental ones wait for milestone 3.

18. **Bubbles at true area, overlapping up to a quarter.** A bubble
    is drawn at its target area. Two bubbles may overlap by up to a
    quarter of the smaller one's area, the slack between packed
    circles and packed rectangles, and never wholly; the repulsion is
    soft inside that quarter and a wall beyond it. While settling,
    bubbles are held inside the buildable line. A hallway is a
    corridor of its area, 1.8 m wide (the top of the room-type band;
    at 2.4 m it was all end-caps, at 1.2 m longer than the plot), its
    near end on the entry or the stair, turning toward the rooms it
    serves, touched along its sides; a stair stays a circle, drawn on
    every storey it reaches at one spot. A link rests at touching, not
    inside the quarter, or the spring and the wall fight and the
    picture never rests. A bubble the hand drops is held where it was
    dropped until let go, because the forces are now strong enough to
    undo the hand otherwise (this reverses F3's drag-holds-only-while-
    held). Z2 found these; Z1 and Z2 built them.

19. **The morph is two halves, partition then straightening; a
    proposal, deterministic, and it may spill.** First the partition:
    the buildable area is divided among the bubbles, each point of the
    floor to the bubble whose reach covers it most, reaches adjusted
    until every room holds its target, a metre of shared wall seeded
    at every bubble contact so the division reshapes rooms but never
    separates them, the corridor first from the front door, and every
    room checked for a route from the entry. Then the straightening,
    the hard half: walls that run, one straight shared line per
    boundary on the 0.25 m grid, jogs a whole metre or more and
    aligned with a wall elsewhere; every zone a rectangle plus at most
    one arm, anything else a defect; area met by carving along shared
    walls with the tool's own carve, not by outline; the hallway drawn
    last as the spine, 1.20 m or more, taking what the corridor's
    length gives it. The storyboard proved the shape of the second
    half: a column either side of the corridor, bands from the kerb up
    in the bubbles' order, twin bays side by side, small rooms stacked
    in a narrow pocket on the corridor, an auxiliary carved from a
    corner of its owner, columns balanced by moving a room with no
    link into the column it leaves. Inflating rectangles was tried and
    rejected; a raster partition alone gave the right places and
    unarchitectural shapes. Moving a bubble by hand and morphing again
    gives a different plan with the same links, and that is the
    designer's hand as the one source of variation; the same bubbles
    always give the same plan. Half one (Z4a) measures a bubble's reach
    in the square metric, along the longer axis, not as the crow flies:
    with Euclidean distance an uncontested zone came out a circle and
    the proposal read as bubbles; in the square metric an uncontested
    reach is a square and a contested boundary a grid line. A metre and
    a half of wall is seeded at every bubble contact and the driveway in
    front of a garage bay is the bay's or nobody's. The corridor snaps
    to the nearer grid axis in half two; a diagonal wall appears only
    when the designer draws one by hand, since orthogonal lines are
    preferred (the owner's ruling). Half two (Z4b) straightened the
    cells into rectangles and Ls with running walls, stacked the stair
    across storeys and gave small rooms their exact target, at a cost
    it declared: room areas up to a third off, centroids up to 6 m from
    their bubbles, the hallway the leftover, and one rest in three
    costing the family living its door to the corridor. A cell
    partition repaired into rooms is at its limit there, so Z6 rebuilt
    the second half around the spine, keeping Z4b's test harness: the
    corridor fixed first from the entry on the kerb or the placed
    stair, a column either side filled with bands from the kerb
    inward, every room a link ties together on one side, a room the
    corridor does not serve behind the room it is reached through,
    the bays in a tandem strip, the stair and the guest WC pockets the
    next room wraps, a companion cut from its owner's corner or set
    past its end, small rooms exact on the grid, a crowded column
    drawn deeper and shorter, and a storey that cannot fit run past
    the line as spill. On the five suite houses every link is a door
    and every room reached but one, declared: where the bay, the
    entry and the diwaniya fill the kerb, the driver's room gives up
    its bay wall so the formal living keeps its wall on the entry. A
    link to a tandem bay is the door onto the bay in front. Zones can
    stand up to twelve metres from bubbles the settle laid across the
    corridor from their linked room; Z7 brings that down. The default
    household has one car. The result is shown dashed with Accept
    and Back to bubbles; Accept commits the store once, so one undo
    returns to the bubbles; Back plays the morph in reverse and writes
    nothing. A plan that does not fit is never refused: rooms past the
    buildable line are drawn hatched outside it with the overflow in
    m², the rooms with slack above the bottom of their range are
    offered for reduction one click each, and when every room at its
    minimum still does not fit the sheet says the storey's program is
    too big for the plot by that much. The tool never shrinks a room on
    its own. The same fit line stands on the Requirements totals,
    before a bubble is drawn. Z5 built the reduction and the manual
    check: the rooms offered are the fewest by largest slack whose
    slack covers the spill, a stair and a lift are never offered, and
    the spill is a packing result, so a click can move it up before
    the next brings it down; the offer is remade after every click.
    On the accepted plan a room past the top or under the bottom of
    its range, a storey past its buildable area, and a house past the
    Municipality's allowed floor area are each named in one sentence,
    never refused; the check speaks only after a hand has moved
    something, so a saved project opens silent. The allowed area reads
    the ratio table (210%; plus 120 m² from 350 to 400 m²; 800 m² from
    250 to 349 m²; under 250 m² the plain 210%), the known house its
    reference case. Open: the lift and the courtyard are counted in
    the ratio everywhere though the table says not to.

20. **Links are strong, walls are strict, the start is fixed.** A
    link's rest length is touching and its pull is strong, and the
    no-overlap wall is stronger still, so links never make piles. The
    default connections are real edges from the first frame; the
    designer removes what is not wanted rather than adding what is.
    The entry on the street frontage, the garage at the kerb and the
    diwaniya's own street door are walls, not forces: the bubble sits
    on the kerb line inside the setback, may slide along the frontage
    and never leaves it. The owner's O7 ruling refines it: the entry
    and the garage are walls; the diwaniya is a strong pull (S1)
    inside a band one room's depth from the kerb. Frontage is claimed
    in order of who needs a street door: the diwaniya first (at the
    corner when the client says so), then the entry, then the women's
    reception, then the garage bays with what is left, backed on to
    the boundary away from the diwaniya; a bay the frontage will not
    hold stands in tandem behind the bay before it, along the same
    driveway, never behind another room. A frontage that cannot hold
    the diwaniya and one bay side by side is a finding on the brief,
    not a hidden bay. The garage is a ground-floor placeholder until
    the basement storey (milestone 2, B0). The first arrangement is derived from the
    program, never random, and every re-settle starts from where the
    bubbles are, so the same program settles the same way twice and
    the designer's hand is the only source of variation. What pushes
    the bedrooms away from the street is the privacy gradient, a user
    requirement, not the sun; sun, wind and views are environmental
    factors and wait for milestone 3.

21. **A missed link is diagnosed, never shrugged at.** A link can
    fail for three reasons and the tool says which. The program asked
    for what geometry cannot give: the graph is not planar, a room is
    linked to more rooms than its wall at target aspect can touch, or
    two rooms claim the same kerb. This is checked on the brief before
    a bubble moves and reported there with the fix. The settle got
    stuck: the bubbles never touched. After settling, any linked pair
    not touching gets a discrete correction, the smaller walked round
    the larger's perimeter to the nearest free wall. The morph broke a
    contact: the bubbles touched and the zones do not. The morph
    treats a touching linked pair as one body while it pushes overlaps
    apart; it may reshape, it may not separate. Auxiliary rooms (the
    diwaniya WC, an ensuite) never settle alone: they ride their
    owner's perimeter from the first frame and morph with it. Every
    link is in one of three states, realized (a door), unrealized but
    possible (the tension line, with a sentence naming what is in the
    way) or impossible (a finding on the brief). A suite of programs
    known to be feasible, every link realized after the morph, is a
    test that ships with the tool. Z7 took the discrete correction
    out: the settle projects every link to touching itself, and a
    pair the walls keep apart is declared, not walked (see 22).

22. **The settle is ranked, not balanced.** One function a round,
    in order: the walls first and absolute (the buildable line, the
    kerb claims, the diwaniya's band, the corridor's near end on its
    anchor, a bay in tandem, a companion on its owner's perimeter),
    then every link projected to touching, then the overlap past the
    quarter projected back, three passes; then the site rows and the
    gradient as pulls inside what is left, each row a vector of at
    most one that lets go as its goal nears, the sum capped at a
    quarter metre a round and fading to nothing by the last round. A
    pull never undoes a link, a link never crosses a wall: a linked
    pair with the corridor between them has the freer one mirrored
    across it. No springs, no velocities, no damping and no tuned
    threshold: a settle is ninety rounds from wherever the bubbles
    are, so it is the same twice, and at rest means three rounds
    within a millimetre. The corridor's lie is stored on its bubble
    (`angle`), given once (in from the street on the ground, toward
    the rooms it serves on a floor above, on one of the plot's two
    ways) and turned after that only by the hand or by the line. The
    hand bounds a settle: a drag frees the room it moved, its linked
    neighbours, its companions and whatever it overlaps, holds every
    other room and every other storey, and lets nothing move further
    than the drag did, so a nudge is a nudge. The canonical start is
    a villa before a round has run: the corridor in from the entry,
    the rooms in two columns beside it by their links, the entry's
    group across from the bays, the family group across from the
    diwaniya. On a plot where the bays take the frontage beside the
    entry, one link on the default program stays open, the entry to
    the formal living, and is declared with the kerb named as what
    holds them; the feasible suite carries that one open link and no
    other. Z7 built it, by the cofounder; the springs of 18 and the
    walk of 21 are gone.

23. **The bubble diagram is the connection graph, and nothing else.**
    The owner's ruling: circles settled on the plot gave nothing that
    carried into zoning, and what lasts from the stage is the edges,
    which is where every layout method starts. So the bubbles have no
    plot, no setbacks, no physics and no scale; a circle's size may
    hint at its area. The default connections arrive as edges from
    the program as before, each saying its source (the rulebook row,
    or by hand). A drag from one room to another connects them, a
    click on an edge changes its kind or disconnects it, and a pair
    disconnected is not offered again in the project. Reverses 17,
    18 and 22, the kerb walls and the canonical start of 20, and the
    settle's part in 21; the settle, its forces and the weights panel
    go from the bubble tab. Amends 7: storeys are assigned in the
    program and shown as columns.

24. **The arrangement is computed, not settled.** One column per
    storey, every storey side by side; inside a column one row per
    tier of the room-type table, public at the bottom, semi-public in
    the middle, private at the top, an exempt room in the row of the
    first room it is joined to. The same program always draws the
    same diagram. A nudge by the hand is kept on the room so the
    diagram stays readable; it is an offset from the computed place
    and means nothing for the plan. Clicking a storey's name brings it
    forward; the others fade and stay visible.

25. **A stair is one room in every column it spans.** A stair or lift
    is drawn in each storey it reaches, and it is the only way an edge
    crosses from one storey to another. On the zoning sheet a stair
    placed stands on every storey (the sheet's `stairAcross`, on by
    default), so moving it on one storey moves it on all.

26. **Keep apart is the opposite of a connection.** A pair of rooms
    the program wants apart: no edge between them, and neither reached
    only through the other (on the edge graph, `b` is not on every
    route from the front door to `a`, nor `a` to `b`). They may share
    a wall or stand far apart; geometry is not read. It is stored as
    its own list on the project, not as an edge, under undo, in the
    file, and a room deleted takes its pairs with it. It is set in the
    diagram like a connection and drawn as a line unlike any edge. It
    only warns: a keep-apart pair may still be connected, and nothing
    is refused or moved for it. The diwaniya and the family living,
    the diwaniya and the women's reception, the maid's room and the
    master bedroom, the garage and the bedrooms are the cases.

27. **The graph is checked beside the diagram, on every edit.** Rooms
    not reached from the front door; a private room joined straight
    to the outside or to a public room (a tier skip); a storey whose
    edges cannot be drawn without crossing (the planarity test the
    brief already used); keep-apart pairs broken, either way. Each
    check names its rule and its source and ships with a reference
    case. They warn; they never change the graph.

28. **The matrix is a second window on the same graph.** An optional
    window lists every pair of rooms once, a half grid, each cell
    connected (door or open), keep apart, or nothing, and a click on a
    cell changes it through the same actions and the same undo as the
    diagram, which stays the main view.

29. **The zoning sheet shows the edges when asked, and a door knows
    its edge.** Check, off by default, draws each edge as a dashed
    line from a room hovered or selected, including to a room still
    in the program. An edge is ready in the zoning step when its two
    rooms share a run of wall a door wide, corners not counting, and
    met in the Openings step only when a door drawing it is placed.
    A door records its two rooms when it is placed: reading the pair
    off whichever room lies across the wall would be an edge inferred
    from geometry, which decision 2 forbids. A door placed between
    two rooms with no edge asks to add the connection; yes is one
    undo step for the edge and the door, no places nothing. Doors
    saved before this carry no pair and count for nothing until
    placed again. Keep-apart pairs broken are marked on the sheet
    while Check is on. Replaces the proposal of an edge on touch in 2
    and in MODEL.md: the door's question is the only way zoning adds
    an edge.

30. **A solver is an option that proposes.** When one comes it is a
    feature a person turns to, and what it gives is a proposal for
    the zoning; it never overrides a zoning made by hand. Until then
    the weights stay on the project, in undo and in the file, and are
    not on screen, since nothing reads them.
