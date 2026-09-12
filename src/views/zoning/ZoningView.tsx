import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  boundingBox,
  exactArea,
  outlineOf,
  snapPointToGrid,
  type Footprint,
  type Handle,
  type Point,
} from '../../geometry'
import { occupiedStoreys, type Room } from '../../model'
import {
  fitCamera,
  metresPerPixel,
  panTo,
  pointerAt,
  viewBoxOf,
  visibleExtent,
  wheelFactor,
  zoomAbout,
  ZOOM_STEP,
  type Camera,
} from '../camera'
import { alignRooms, northAngle, plotAngle } from './align'
import { defaultProportion, startingRectangle } from './defaults'
import {
  addedVertex,
  circleFootprint,
  closedFootprint,
  closesAt,
  drawnPolygon,
  movedVertex,
  removedVertex,
  snapRadius,
  targetRadius,
  SMALLEST_DRAWN_M2,
  type Corner,
} from './draw'
import { CirclePreview, DrawPreview, PickRoom, VertexHandles } from './drawing'
import { edgeMarks, proposalsFrom, vanishedWalls, wallPairs, type WallPair } from './doors'
import { extentOf } from './frame'
import { joinsOf, type Join } from './joins'
import {
  angleTo,
  carveRefusal,
  carveWith,
  droppedAt,
  landFootprint,
  landOver,
  moveFootprint,
  movedTo,
  moveSharedWall,
  resizeFootprint,
  restoredTo,
  rotateFootprint,
  sheetOf,
  snapAngle,
  wallNormal,
  type Attempt,
  type Landing,
  type Neighbour,
  type Sheet,
  type Size,
  type WallShift,
} from './gestures'
import {
  Ask,
  Door,
  DropGhost,
  Ghosts,
  Handles,
  JoinShape,
  NorthArrow,
  PendingRoom,
  PlotSheet,
  Proposal,
  RoomShape,
  ScaleBar,
  Storeys,
  Tension,
  Tray,
  VanishedWall,
  WallHandle,
} from './parts'
import type { Placement, ZoningViewProps } from './types'
import './zoning.css'

type Placed = Room & { readonly footprint: Footprint }

/** How far the hand may wander before a press on the sheet is a pan rather than a click, in pixels. */
const DRAG_PX = 3

/** Where the north arrow and the scale bar sit in from the corner of what is drawn, in pixels. */
const FURNITURE_PX = 26

const HINT = 'Drag a room to move it. Drop it on another to carve. Drag a shared wall to move it.'

/** One line for each tool, so the sheet always says what the hand is in the middle of. */
const HINTS = {
  draw: 'Click the corners. Hold A and drag to bow a wall out into a curve. Enter, or the first corner, closes it; Escape cancels.',
  circle:
    'Click for the target size, or drag a radius; a drag lands on quarter metres. Escape cancels.',
  points:
    'Drag a point to move it, + puts one in, Delete takes out the point you last held. Moving a point on a curve makes that curve straight.',
} as const

/** A gesture that reshapes one footprint, as against a drop or a grab that is going nowhere. */
type Grip =
  | { readonly kind: 'move'; readonly id: string; readonly from: Footprint; readonly at: Point }
  | { readonly kind: 'rotate'; readonly id: string; readonly from: Footprint }
  | {
      readonly kind: 'resize'
      readonly id: string
      readonly from: Footprint
      readonly sx: Handle
      readonly sy: Handle
    }
  | {
      readonly kind: 'vertex'
      readonly id: string
      readonly from: Footprint
      readonly index: number
    }

/** Two fingers on the sheet: the metre under their middle, how far apart they began, and the scale they began at. */
type Pinch = { readonly grabbed: Point; readonly span: number; readonly scale: number }

/** The wall between two rooms, taken hold of at the metre the hand grabbed it by. */
type WallGrip = {
  readonly kind: 'wall'
  readonly a: Neighbour
  readonly b: Neighbour
  readonly pair: WallPair
  readonly normal: Point
  readonly grabbed: Point
}

type Gesture =
  | Grip
  | WallGrip
  | { readonly kind: 'drop'; readonly id: string; readonly at: Point }
  | { readonly kind: 'held'; readonly name: string }
  /** The sheet slid under the hand: the metre grabbed, where the hand started, and whether a click here lets the selection go. */
  | {
      readonly kind: 'pan'
      readonly grabbed: Point
      readonly from: Point
      readonly clears: boolean
    }
  | (Pinch & { readonly kind: 'pinch' })
  | null

/**
 * A room let go over its neighbours. It is held here and nowhere else until the person answers:
 * the store hears nothing of a drop that has not been settled one way or the other.
 */
type Asked = {
  readonly id: string
  readonly name: string
  readonly targetArea: number
  readonly footprint: Footprint
  /** Every room it lies over, as they stood when it landed. */
  readonly over: readonly Neighbour[]
  readonly carve: Attempt<readonly Placement[]>
  readonly at: readonly [number, number]
  /** Whether answering uses up the outline remembered for this room, as undoing a carve does. */
  readonly forgets: boolean
}

/**
 * A tool the hand is in the middle of: a shape being walked corner by corner, a circle being
 * pulled out of its centre, or the points of a room standing open to be moved. It is view state
 * from first click to last: the store hears of it only when a shape closes.
 */
type Drawing =
  | {
      readonly kind: 'draw'
      readonly roomId: string
      readonly corners: readonly Corner[]
      /** Where the pointer is, so the wall being drawn follows it. */
      readonly at: Point | null
      /** A wall being bowed out: the corner it reaches and the point it is dragged through. */
      readonly bulge: { readonly to: Point; readonly through: Point } | null
    }
  | {
      readonly kind: 'circle'
      readonly roomId: string
      readonly centre: Point | null
      readonly radius: number
    }
  | { readonly kind: 'points'; readonly roomId: string; readonly picked: number | null }
  | null

/** What a button on the selected room would do, and the sentence standing in its way. */
type Offer = { readonly landing: Landing; readonly refusal: string | null }

/** The same sentence on the button and in the message it says, so nothing is hidden in a tooltip. */
function heldBack(name: string, doing: string, refusal: string): string {
  return `${name} cannot ${doing}: ${refusal}; move it first.`
}

const emptySheet: Sheet = { others: [], outlines: [], boundary: [] }

function isPlaced(room: Room): room is Placed {
  return room.footprint !== undefined
}

function centreOf(footprint: Footprint): Point {
  const bounds = boundingBox(footprint.polygon)
  return [bounds.left + bounds.width / 2, bounds.top + bounds.depth / 2]
}

function keyOf(pair: WallPair): string {
  return `${pair.a}:${pair.b}`
}

export function ZoningView(props: ZoningViewProps) {
  const { projectId, rooms, edges, storeys, storey, plot, sizes, selected } = props
  const { onPlace, onPlaceAll, onUnplace, onPin, onConnect, onDisconnect } = props
  const { onSelect, onStorey, onSetEdgeKind, onRefuse, onLayOut, unplacedCount } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const sheetRef = useRef<Sheet>(emptySheet)
  /** Whether the drag has done anything yet, so an abandoned one puts back only what it moved and a press that never moved is a click. */
  const movedRef = useRef(false)
  /** The last wall the hand settled on, kept out of state so a pointer move does not draw twice. */
  const wallRef = useRef<Attempt<WallShift> | null>(null)
  /** Every pointer down on the sheet, so a second finger becomes a pinch instead of a second grab. */
  const touchesRef = useRef(new Map<number, Point>())
  /** Space turns any drag into a pan, so a room under the hand is slid past rather than picked up. */
  const spaceRef = useRef(false)
  /** `A` held: the next wall the draw tool puts down is bowed out rather than run straight. */
  const arcRef = useRef(false)
  /** Where the hand pressed to start a circle, in screen pixels, so its release can tell a click from a drag. */
  const circleDownRef = useRef<readonly [number, number] | null>(null)
  const [gesture, setGesture] = useState<Gesture>(null)
  const [asked, setAsked] = useState<Asked | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [hoveredWall, setHoveredWall] = useState<string | null>(null)
  /** What each room's outline was before its last carve. View memory: the store keeps no such thing. */
  const [beforeCarve, setBeforeCarve] = useState<ReadonlyMap<string, Footprint>>(new Map())
  const [camera, setCamera] = useState<Camera>(fitCamera)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [drawing, setDrawing] = useState<Drawing>(null)
  /** Which tool is waiting on a room, when the hand pressed it with none picked. */
  const [picking, setPicking] = useState<'draw' | 'circle' | null>(null)

  const here = useMemo(
    () => rooms.filter((room) => occupiedStoreys(room).includes(storey)),
    [rooms, storey],
  )
  const placed = useMemo(() => here.filter(isPlaced), [here])
  const tray = useMemo(() => here.filter((room) => room.footprint === undefined), [here])
  const below = useMemo(
    () =>
      rooms
        .filter(isPlaced)
        .filter(
          (room) =>
            occupiedStoreys(room).includes(storey - 1) && !occupiedStoreys(room).includes(storey),
        )
        .map((room) => room.footprint),
    [rooms, storey],
  )
  const standing = useMemo(
    () =>
      placed.map((room) => ({
        id: room.id,
        name: room.name,
        outline: outlineOf(room.footprint),
        measure: exactArea(room.footprint),
      })),
    [placed],
  )
  const joins = useMemo(
    () =>
      joinsOf(
        standing,
        edges.filter((edge) => edge.storey === storey),
      ),
    [standing, edges, storey],
  )
  /** The join each room is drawn inside, so a room knows to leave its wall and its label to it. */
  const joined = useMemo(
    () => new Map(joins.flatMap((join) => join.ids.map((id): [string, Join] => [id, join]))),
    [joins],
  )
  const marks = useMemo(() => {
    // An open edge inside a join has no wall left to hang a door on; every other edge is drawn
    // as it always was, which for an edge into the join is on the union's own outline.
    const inside = new Set(joins.flatMap((join) => join.edgeIds))
    return edgeMarks(
      standing,
      edges.filter((edge) => edge.storey === storey && !inside.has(edge.id)),
      plot,
    )
  }, [standing, edges, storey, plot, joins])
  /** An open edge inside a join has no wall to hang a door on, so what is left of its wall is drawn. */
  const vanished = useMemo(() => {
    const inside = new Set(joins.flatMap((join) => join.edgeIds))
    return vanishedWalls(
      standing,
      edges.filter((edge) => edge.storey === storey && inside.has(edge.id)),
    )
  }, [standing, edges, storey, joins])
  const pairs = useMemo(() => wallPairs(standing), [standing])
  const proposals = useMemo(() => proposalsFrom(pairs, edges, storey), [pairs, edges, storey])
  const extent = useMemo(
    () =>
      extentOf(
        plot.polygon,
        standing.map((room) => room.outline),
      ),
    [plot.polygon, standing],
  )

  const shown = visibleExtent(extent, camera)
  const perPixel = metresPerPixel(extent, camera, box)

  const selectedRoom = rooms.find((room) => room.id === selected)
  const selectedEdge = edges.find((edge) => edge.id === selected)
  const grabbable =
    selectedRoom !== undefined &&
    isPlaced(selectedRoom) &&
    here.some((r) => r.id === selectedRoom.id)
  const remembered = selected === null ? undefined : beforeCarve.get(selected)

  const at = (event: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current
    return svg ? pointerAt(svg, event.clientX, event.clientY) : [0, 0]
  }

  const neighbourOf = (room: Placed): Neighbour => ({
    id: room.id,
    name: room.name,
    footprint: room.footprint,
    pinned: room.pinned,
    sizes: sizes.get(room.type) ?? { proportion: defaultProportion },
  })

  const sheetFor = (skip: string | null): Sheet =>
    sheetOf(placed.filter((room) => room.id !== skip).map(neighbourOf), plot.on ? plot.polygon : [])

  const proportionFor = (room: Room): number =>
    sizes.get(room.type)?.proportion ?? defaultProportion

  const sizeFor = (room: Room): Size => startingRectangle(room.targetArea, proportionFor(room))

  /** Where a point on the sheet falls on the screen, in pixels: a prompt stands on its own room. */
  function onScreen(point: Point): Point {
    const screen = svgRef.current?.getScreenCTM()
    if (!screen) return point
    const at = new DOMPoint(point[0], point[1]).matrixTransform(screen)
    return [at.x, at.y]
  }

  /**
   * What a button would leave the selected room with, and why it would be refused. Worked out
   * while the hand is still, so a button says up front that it cannot do what it offers, and the
   * pointer path is never charged for it.
   */
  function offerOf(footprint: Footprint | undefined): Offer | null {
    if (!footprint || !grabbable || !selectedRoom || gesture !== null) return null
    const sheet = sheetFor(selectedRoom.id)
    const landing = landOver(footprint, sheet)
    return { landing, refusal: carveRefusal(landing, sheet) }
  }

  const restoreOffer = offerOf(
    selectedRoom && isPlaced(selectedRoom)
      ? restoredTo(selectedRoom.footprint, sizeFor(selectedRoom))
      : undefined,
  )
  const undoOffer = offerOf(remembered)

  function attemptFor(grip: Grip, pointer: Point, free: boolean): Attempt<Footprint> {
    const sheet = sheetRef.current
    if (grip.kind === 'move') {
      const delta: Point = [pointer[0] - grip.at[0], pointer[1] - grip.at[1]]
      return moveFootprint(grip.from, delta, sheet)
    }
    if (grip.kind === 'rotate') {
      return rotateFootprint(
        grip.from,
        snapAngle(angleTo(centreOf(grip.from), pointer), free),
        sheet,
      )
    }
    if (grip.kind === 'vertex') {
      return landFootprint(movedVertex(grip.from, grip.index, pointer), sheet)
    }
    return resizeFootprint(grip.from, grip.sx, grip.sy, pointer, sheet)
  }

  function forget(id: string): void {
    setBeforeCarve((memory) => {
      if (!memory.has(id)) return memory
      const next = new Map(memory)
      next.delete(id)
      return next
    })
  }

  /**
   * A landing over other rooms is neither refused nor written: the room is drawn where it came to
   * rest and the person is asked what they meant by it.
   */
  function ask(
    room: Room,
    landing: Landing,
    put: Footprint | null,
    where: Point,
    forgets = false,
  ): void {
    if (landing.over.length === 0) {
      onPlace(room.id, landing.footprint, 'commit')
      if (forgets) forget(room.id)
      return
    }
    if (put && movedRef.current) onPlace(room.id, put, 'preview')
    setAsked({
      id: room.id,
      name: room.name,
      targetArea: room.targetArea,
      footprint: landing.footprint,
      over: landing.over,
      carve: carveWith(landing.footprint, sheetRef.current),
      at: [where[0], where[1]],
      forgets,
    })
  }

  /** The carve the prompt offered: the room stays where it landed and every room under it gives way. */
  function carveHere(): void {
    if (!asked || !asked.carve.ok) return
    const cut = asked.carve.value
    setBeforeCarve((memory) => {
      const next = new Map(memory)
      if (asked.forgets) next.delete(asked.id)
      for (const piece of cut) {
        const was = asked.over.find((other) => other.id === piece.id)
        if (was) next.set(piece.id, was.footprint)
      }
      return next
    })
    onPlaceAll([{ id: asked.id, footprint: asked.footprint }, ...cut])
    setAsked(null)
  }

  function insideExtent(pointer: Point): boolean {
    return (
      pointer[0] >= extent.minX &&
      pointer[0] <= extent.minX + extent.width &&
      pointer[1] >= extent.minY &&
      pointer[1] <= extent.minY + extent.height
    )
  }

  /** Two fingers zoom about the metre their middle began on and carry it along with them. */
  function pinchTo(pinch: Pinch): void {
    const svg = svgRef.current
    const [first, second] = [...touchesRef.current.values()]
    if (!svg || !first || !second) return
    const span = Math.hypot(first[0] - second[0], first[1] - second[1])
    if (span <= 0) return
    const middle = pointerAt(svg, (first[0] + second[0]) / 2, (first[1] + second[1]) / 2)
    const factor = (pinch.scale * span) / (pinch.span * camera.scale)
    setCamera(panTo(extent, zoomAbout(extent, camera, middle, factor), pinch.grabbed, middle))
  }

  /** The wall follows the hand along its normal, both rooms showing their live areas as it goes. */
  function dragWall(grip: WallGrip, pointer: Point): void {
    const travel =
      (pointer[0] - grip.grabbed[0]) * grip.normal[0] +
      (pointer[1] - grip.grabbed[1]) * grip.normal[1]
    const attempt = moveSharedWall(grip.a, grip.b, grip.pair.wall, travel)
    wallRef.current = attempt
    if (!attempt.ok) return
    onPlace(grip.a.id, attempt.value.a.footprint, 'preview')
    onPlace(grip.b.id, attempt.value.b.footprint, 'preview')
    movedRef.current = true
  }

  function settleWall(grip: WallGrip): void {
    const attempt = wallRef.current
    wallRef.current = null
    const putBack = (): void => {
      if (!movedRef.current) return
      onPlace(grip.a.id, grip.a.footprint, 'preview')
      onPlace(grip.b.id, grip.b.footprint, 'preview')
    }
    if (!attempt) return
    if (!attempt.ok) {
      putBack()
      onRefuse(`That wall stays where it is: ${attempt.reason}.`)
      return
    }
    if (attempt.value.distance === 0) {
      putBack()
      return
    }
    onPlaceAll([
      { id: attempt.value.a.id, footprint: attempt.value.a.footprint },
      { id: attempt.value.b.id, footprint: attempt.value.b.footprint },
    ])
  }

  /** The polygon the tool has walked so far, with the wall following the hand on the end of it. */
  const drawRun =
    drawing?.kind === 'draw'
      ? drawnPolygon(
          drawing.bulge
            ? [...drawing.corners, { at: drawing.bulge.to, through: drawing.bulge.through }]
            : drawing.at
              ? [...drawing.corners, { at: drawing.at }]
              : drawing.corners,
        ).polygon
      : []

  function stopDrawing(): void {
    setDrawing(null)
    setPicking(null)
    circleDownRef.current = null
  }

  /** A shape the hand has closed lands like any other drop: clear, or asked about where it lies over. */
  function placeDrawn(roomId: string, footprint: Footprint): void {
    const room = rooms.find((entry) => entry.id === roomId)
    if (!room) return
    sheetRef.current = sheetFor(roomId)
    movedRef.current = false
    const landing = landOver(footprint, sheetRef.current)
    ask(room, landing, null, onScreen(centreOf(landing.footprint)))
  }

  function closeDrawing(roomId: string, corners: readonly Corner[]): void {
    const drawn = closedFootprint(corners)
    stopDrawing()
    if (!drawn.ok) {
      onRefuse(`That shape is not a room: ${drawn.reason}.`)
      return
    }
    placeDrawn(roomId, drawn.footprint)
  }

  /** A press on the sheet with a tool out: a corner goes down, or a circle's centre does. */
  function drawDown(event: ReactPointerEvent): void {
    if (!drawing) return
    const pointer = at(event)
    if (drawing.kind === 'circle') {
      circleDownRef.current = [event.clientX, event.clientY]
      setDrawing({ ...drawing, centre: snapPointToGrid(pointer), radius: 0 })
      return
    }
    if (drawing.kind !== 'draw') return
    const corner = snapPointToGrid(pointer)
    if (closesAt(drawing.corners, corner)) {
      closeDrawing(drawing.roomId, drawing.corners)
      return
    }
    // `A` held bows the wall that reaches this corner: the corner goes down and the hand then
    // drags the point the wall is to pass through, so one gesture leaves one arc behind it.
    if (arcRef.current && drawing.corners.length > 0) {
      setDrawing({ ...drawing, bulge: { to: corner, through: corner }, at: corner })
      return
    }
    setDrawing({ ...drawing, corners: [...drawing.corners, { at: corner }], at: corner })
  }

  function drawMove(event: ReactPointerEvent): void {
    if (!drawing) return
    const pointer = at(event)
    if (drawing.kind === 'circle') {
      const centre = drawing.centre
      if (!centre) return
      setDrawing({
        ...drawing,
        radius: snapRadius(Math.hypot(pointer[0] - centre[0], pointer[1] - centre[1])),
      })
      return
    }
    if (drawing.kind !== 'draw') return
    // The bulge is read where the hand is rather than on the grid: a curve is aimed by eye.
    if (drawing.bulge) {
      setDrawing({ ...drawing, bulge: { ...drawing.bulge, through: pointer } })
      return
    }
    setDrawing({ ...drawing, at: snapPointToGrid(pointer) })
  }

  function drawUp(event: PointerEvent): void {
    if (!drawing) return
    if (drawing.kind === 'circle') {
      const centre = drawing.centre
      if (!centre) return
      const start = circleDownRef.current
      circleDownRef.current = null
      // A press let go where it landed, within the same reach a click elsewhere on the sheet gets,
      // is the room's target size; carrying the hand further out hands the radius to the drag.
      const clicked =
        start !== null && Math.hypot(event.clientX - start[0], event.clientY - start[1]) <= DRAG_PX
      const room = rooms.find((entry) => entry.id === drawing.roomId)
      const radius = clicked && room ? targetRadius(room.targetArea) : drawing.radius
      if (radius <= 0) {
        setDrawing({ ...drawing, centre: null })
        return
      }
      const footprint = circleFootprint(centre, radius)
      const roomId = drawing.roomId
      stopDrawing()
      if (exactArea(footprint) < SMALLEST_DRAWN_M2) {
        onRefuse(`That circle is not a room: it covers less than ${SMALLEST_DRAWN_M2} m².`)
        return
      }
      placeDrawn(roomId, footprint)
      return
    }
    const bulge = drawing.kind === 'draw' ? drawing.bulge : null
    if (drawing.kind !== 'draw' || !bulge) return
    setDrawing({
      ...drawing,
      corners: [...drawing.corners, { at: bulge.to, through: bulge.through }],
      at: bulge.to,
      bulge: null,
    })
  }

  function startTool(kind: 'draw' | 'circle', roomId: string): void {
    setPicking(null)
    setGesture(null)
    onSelect(roomId)
    svgRef.current?.focus({ preventScroll: true })
    setDrawing(
      kind === 'draw'
        ? { kind, roomId, corners: [], at: null, bulge: null }
        : { kind, roomId, centre: null, radius: 0 },
    )
  }

  /**
   * The room the tool draws: the one picked out of the tray, the only room left in it, or one
   * asked for. A room already standing is not redrawn from under itself; it is unplaced first.
   */
  function openTool(kind: 'draw' | 'circle'): void {
    if (drawing?.kind === kind) {
      stopDrawing()
      return
    }
    const chosen = tray.find((room) => room.id === selected) ?? (tray.length === 1 ? tray[0] : null)
    if (chosen) {
      startTool(kind, chosen.id)
      return
    }
    if (tray.length === 0) {
      onRefuse('Every room on this storey is placed; unplace one to draw it again.')
      return
    }
    setPicking(kind)
  }

  function editPoints(): void {
    if (drawing?.kind === 'points') {
      stopDrawing()
      return
    }
    if (!selectedRoom || !isPlaced(selectedRoom) || !grabbable) {
      onRefuse('Pick a placed room to edit its points.')
      return
    }
    svgRef.current?.focus({ preventScroll: true })
    setDrawing({ kind: 'points', roomId: selectedRoom.id, picked: null })
  }

  function grabVertex(event: ReactPointerEvent, index: number): void {
    event.stopPropagation()
    if (panningWith(event)) {
      grabSheet(event, false)
      return
    }
    if (!selectedRoom || !isPlaced(selectedRoom)) return
    setDrawing(drawing?.kind === 'points' ? { ...drawing, picked: index } : drawing)
    begin(selectedRoom, (footprint) => ({
      kind: 'vertex',
      id: selectedRoom.id,
      from: footprint,
      index,
    }))
  }

  /** One edit, one undo step: the room is written once the new outline is known to stand. */
  function editVertices(room: Placed, footprint: Footprint | null): void {
    if (room.pinned) {
      onRefuse(`${room.name} is pinned.`)
      return
    }
    if (!footprint) {
      onRefuse(`${room.name} keeps its points: a room has at least three.`)
      return
    }
    const attempt = landFootprint(footprint, sheetFor(room.id))
    if (!attempt.ok) {
      onRefuse(`${room.name} keeps its points: ${attempt.reason}.`)
      return
    }
    onPlace(room.id, attempt.value, 'commit')
  }

  function addVertex(event: ReactPointerEvent, index: number): void {
    event.stopPropagation()
    if (!selectedRoom || !isPlaced(selectedRoom)) return
    editVertices(selectedRoom, addedVertex(selectedRoom.footprint, index))
  }

  function dropVertex(): void {
    if (drawing?.kind !== 'points' || drawing.picked === null) return
    if (!selectedRoom || !isPlaced(selectedRoom)) return
    const index = drawing.picked
    setDrawing({ ...drawing, picked: null })
    editVertices(selectedRoom, removedVertex(selectedRoom.footprint, index))
  }

  function movePointer(event: PointerEvent): void {
    if (touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, [event.clientX, event.clientY])
    }
    if (!gesture) return
    if (gesture.kind === 'pinch') {
      pinchTo(gesture)
      return
    }
    if (gesture.kind === 'pan') {
      const wandered = Math.hypot(event.clientX - gesture.from[0], event.clientY - gesture.from[1])
      if (wandered > DRAG_PX) movedRef.current = true
      if (!movedRef.current) return
      setCamera(panTo(extent, camera, gesture.grabbed, at(event)))
      return
    }
    if (gesture.kind === 'held') {
      onRefuse(`${gesture.name} is pinned.`)
      setGesture(null)
      return
    }
    const pointer = at(event)
    if (gesture.kind === 'wall') {
      dragWall(gesture, pointer)
      return
    }
    if (gesture.kind === 'drop') {
      setGesture({ ...gesture, at: pointer })
      return
    }
    const attempt = attemptFor(gesture, pointer, event.shiftKey)
    if (!attempt.ok) return
    onPlace(gesture.id, attempt.value, 'preview')
    movedRef.current = true
  }

  function releasePointer(event: PointerEvent): void {
    touchesRef.current.clear()
    if (!gesture) return
    setGesture(null)
    if (gesture.kind === 'held' || gesture.kind === 'pinch') return
    if (gesture.kind === 'pan') {
      // A press that never moved is the click that lets the selection go; a pan never lets it go.
      if (gesture.clears && !movedRef.current) onSelect(null)
      return
    }
    if (gesture.kind === 'wall') {
      settleWall(gesture)
      return
    }
    const room = rooms.find((entry) => entry.id === gesture.id)
    if (!room) return
    const pointer = at(event)
    const where: Point = [event.clientX, event.clientY]
    if (gesture.kind === 'drop') {
      if (!insideExtent(pointer)) return
      ask(room, landOver(droppedAt(pointer, sizeFor(room)), sheetRef.current), null, where)
      return
    }
    const attempt = attemptFor(gesture, pointer, event.shiftKey)
    if (attempt.ok) {
      onPlace(room.id, attempt.value, 'commit')
      return
    }
    if (gesture.kind !== 'move') {
      onRefuse(`${room.name} stays where it was: ${attempt.reason}.`)
      if (movedRef.current) onPlace(room.id, gesture.from, 'commit')
      return
    }
    // The room would slide no further, so it stays where the hand left it and asks what was meant.
    const delta: Point = [pointer[0] - gesture.at[0], pointer[1] - gesture.at[1]]
    ask(room, landOver(movedTo(gesture.from, delta), sheetRef.current), gesture.from, where)
  }

  /** The sheet takes the wheel whole, so the page never scrolls under it; a trackpad pinch arrives here with `ctrlKey` and zooms the same way. */
  function wheelZoom(event: WheelEvent): void {
    event.preventDefault()
    setCamera(zoomAbout(extent, camera, at(event), wheelFactor(event)))
  }

  const live = useRef({
    move: movePointer,
    release: releasePointer,
    grab: grabRoom,
    wheel: wheelZoom,
    drawUp,
  })
  live.current = {
    move: movePointer,
    release: releasePointer,
    grab: grabRoom,
    wheel: wheelZoom,
    drawUp,
  }
  const dragging = gesture !== null
  /** Whether a shape or a circle is being drawn, which is when the sheet itself takes every press. */
  const drawingOut = drawing !== null && drawing.kind !== 'points'

  /** Held steady through the ref, so a room's own group keeps its props and is not drawn again mid-drag. */
  const onGrabRoom = useCallback(
    (event: ReactPointerEvent, id: string) => live.current.grab(event, id),
    [],
  )
  const onHoverRoom = useCallback((id: string | null) => setHovered(id), [])

  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent): void => live.current.move(event)
    const up = (event: PointerEvent): void => live.current.release(event)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging])

  /** A tool's press may be let go anywhere, so the release is taken from the window, not the sheet. */
  useEffect(() => {
    if (!drawingOut) return
    const up = (event: PointerEvent): void => live.current.drawUp(event)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [drawingOut])

  /** A tool belongs to the room it was opened on; picking another room puts it away. */
  useEffect(() => {
    setDrawing((out) => (out && selected !== out.roomId ? null : out))
  }, [selected])

  /** Taken by hand rather than through React, whose own wheel listener cannot refuse the page its scroll. */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const wheel = (event: WheelEvent): void => live.current.wheel(event)
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [])

  /** Escape, or a press on anything but the prompt, is the same answer as Put back. */
  useEffect(() => {
    if (!asked) return
    const outside = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-ask]')) return
      setAsked(null)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setAsked(null)
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', key)
    }
  }, [asked])

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.key === ' ') spaceRef.current = true
      if (event.key.toLowerCase() === 'a') arcRef.current = true
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === ' ') spaceRef.current = false
      if (event.key.toLowerCase() === 'a') arcRef.current = false
    }
    const letGo = (): void => {
      spaceRef.current = false
      arcRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', letGo)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', letGo)
    }
  }, [])

  /** A room back in the tray or gone from the project has no carve left to undo. */
  useEffect(() => {
    setBeforeCarve((memory) => {
      let dropped = false
      const next = new Map(memory)
      for (const id of memory.keys()) {
        if (rooms.some((room) => room.id === id && room.footprint !== undefined)) continue
        next.delete(id)
        dropped = true
      }
      return dropped ? next : memory
    })
  }, [rooms])

  /** Another project is another set of rooms: what these were before a carve means nothing there. */
  useEffect(() => {
    setBeforeCarve(new Map())
    setAsked(null)
  }, [projectId])

  /** The sheet is measured rather than guessed, because a mark's size on the screen is a size in its box. */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setBox({ width: rect.width, height: rect.height })
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const lot = boundingBox(plot.polygon.length > 0 ? plot.polygon : [[0, 0]])
  const plotSize = `${lot.width} by ${lot.depth}`

  /** A plot of another size is another sheet, so it opens whole; a room moved about the old one leaves the camera alone. */
  useEffect(() => {
    setCamera(fitCamera)
  }, [plotSize])

  function begin(room: Placed, start: (footprint: Footprint) => Grip): void {
    if (room.pinned) {
      onRefuse(`${room.name} is pinned.`)
      return
    }
    sheetRef.current = sheetFor(room.id)
    movedRef.current = false
    setGesture(start(room.footprint))
  }

  /** Space held or the middle button: the hand is on the sheet, not on whatever it happens to be over. */
  function panningWith(event: ReactPointerEvent): boolean {
    return spaceRef.current || event.button === 1
  }

  function grabSheet(event: ReactPointerEvent, clears: boolean): void {
    svgRef.current?.focus({ preventScroll: true })
    if (event.button !== 0 && event.button !== 1) return
    if (drawingOut && event.button === 0) {
      drawDown(event)
      return
    }
    // The middle button would otherwise start the browser's own scroll, which fights the pan.
    if (event.button === 1) event.preventDefault()
    movedRef.current = false
    setGesture({ kind: 'pan', grabbed: at(event), from: [event.clientX, event.clientY], clears })
  }

  function beginPinch(): void {
    const svg = svgRef.current
    const [first, second] = [...touchesRef.current.values()]
    if (!svg || !first || !second) return
    const span = Math.hypot(first[0] - second[0], first[1] - second[1])
    if (span <= 0) return
    movedRef.current = true
    setGesture({
      kind: 'pinch',
      grabbed: pointerAt(svg, (first[0] + second[0]) / 2, (first[1] + second[1]) / 2),
      span,
      scale: camera.scale,
    })
  }

  function grabRoom(event: ReactPointerEvent, id: string): void {
    event.stopPropagation()
    if (panningWith(event)) {
      grabSheet(event, false)
      return
    }
    svgRef.current?.focus({ preventScroll: true })
    onSelect(id)
    const room = placed.find((entry) => entry.id === id)
    if (!room) return
    if (room.pinned) {
      setGesture({ kind: 'held', name: room.name })
      return
    }
    sheetRef.current = sheetFor(id)
    movedRef.current = false
    setGesture({ kind: 'move', id, from: room.footprint, at: at(event) })
  }

  function grabWall(event: ReactPointerEvent, pair: WallPair): void {
    event.stopPropagation()
    if (panningWith(event)) {
      grabSheet(event, false)
      return
    }
    svgRef.current?.focus({ preventScroll: true })
    const a = placed.find((room) => room.id === pair.a)
    const b = placed.find((room) => room.id === pair.b)
    if (!a || !b) return
    const held = a.pinned ? a : b.pinned ? b : null
    if (held) {
      onRefuse(`${held.name} is pinned.`)
      return
    }
    wallRef.current = null
    movedRef.current = false
    setGesture({
      kind: 'wall',
      a: neighbourOf(a),
      b: neighbourOf(b),
      pair,
      normal: wallNormal(pair.wall, a.footprint, b.footprint),
      grabbed: at(event),
    })
  }

  function grabTray(event: ReactPointerEvent, room: Room): void {
    if (drawingOut) return
    event.preventDefault()
    svgRef.current?.focus({ preventScroll: true })
    onSelect(room.id)
    sheetRef.current = sheetFor(null)
    movedRef.current = false
    setGesture({ kind: 'drop', id: room.id, at: at(event) })
  }

  function turn(): void {
    if (!selectedRoom || !isPlaced(selectedRoom)) {
      onRefuse('Choose a placed room to turn it.')
      return
    }
    if (selectedRoom.pinned) {
      onRefuse(`${selectedRoom.name} is pinned.`)
      return
    }
    const { footprint } = selectedRoom
    const attempt = rotateFootprint(footprint, footprint.rotation + 90, sheetFor(selectedRoom.id))
    if (!attempt.ok) onRefuse(`${selectedRoom.name} stays where it was: ${attempt.reason}.`)
    else onPlace(selectedRoom.id, attempt.value, 'commit')
  }

  /**
   * Square the room that is picked, or every placed room on the storey that is not held, to a
   * direction: one transaction, one undo step, and a room already standing that way is left
   * alone rather than written again.
   */
  function align(target: number): void {
    if (selectedRoom && grabbable && selectedRoom.pinned) {
      onRefuse(`${selectedRoom.name} is pinned.`)
      return
    }
    const turning =
      selectedRoom && grabbable && isPlaced(selectedRoom)
        ? [selectedRoom]
        : placed.filter((room) => !room.pinned)
    const aligned = alignRooms(
      turning.map(neighbourOf),
      placed.map(neighbourOf),
      plot.on ? plot.polygon : [],
      target,
    )
    for (const skip of aligned.skipped) {
      onRefuse(`${skip.name} could not be aligned: ${skip.reason}.`)
    }
    if (aligned.placements.length > 0) onPlaceAll(aligned.placements)
  }

  /** A button that reshapes the selected room, with the prompt standing on the room itself. */
  function reshape(room: Placed, offer: Offer | null, doing: string): void {
    if (!offer) return
    if (room.pinned) {
      onRefuse(`${room.name} is pinned.`)
      return
    }
    if (offer.refusal) {
      onRefuse(heldBack(room.name, doing, offer.refusal))
      return
    }
    sheetRef.current = sheetFor(room.id)
    movedRef.current = false
    ask(room, offer.landing, room.footprint, onScreen(centreOf(offer.landing.footprint)), true)
  }

  /** The room put back to the rectangle its kind opens at, about the centre it stands on now. */
  function restore(): void {
    if (!selectedRoom || !isPlaced(selectedRoom)) return
    reshape(selectedRoom, restoreOffer, 'be restored')
  }

  /** The outline the room had before the last thing that cut it, if it will stand there now. */
  function undoCarve(): void {
    if (!selectedRoom || !isPlaced(selectedRoom)) return
    reshape(selectedRoom, undoOffer, 'go back')
  }

  /** The keys zoom about the middle of what is drawn, which is the one point no hand is on. */
  function zoomBy(factor: number): void {
    const middle: Point = [shown.minX + shown.width / 2, shown.minY + shown.height / 2]
    setCamera(zoomAbout(extent, camera, middle, factor))
  }

  function dropSize(): Size {
    const room = gesture?.kind === 'drop' ? rooms.find((entry) => entry.id === gesture.id) : null
    return room ? sizeFor(room) : { width: 1, depth: 1 }
  }

  /** On the room picked, so a click finds the gesture, and under the pointer, so a sweep does too. */
  function wallShown(pair: WallPair): boolean {
    if (gesture?.kind === 'wall') return keyOf(gesture.pair) === keyOf(pair)
    if (hoveredWall === keyOf(pair)) return true
    if (selected === pair.a || selected === pair.b) return true
    return hovered === pair.a || hovered === pair.b
  }

  return (
    <div className="zoning">
      <div className="zoning-bar">
        <Storeys storeys={storeys} storey={storey} onStorey={onStorey} />
        <button
          type="button"
          onClick={onLayOut}
          disabled={unplacedCount === 0}
          title={
            unplacedCount === 0
              ? 'Every room already stands on the sheet.'
              : 'Puts every room still in the tray where its bubble says, on every storey.'
          }
        >
          Lay out from bubbles
        </button>
        <button type="button" onClick={turn} disabled={!grabbable}>
          Rotate 90°
        </button>
        <button
          type="button"
          aria-pressed={drawing?.kind === 'draw'}
          onClick={() => openTool('draw')}
        >
          Draw
        </button>
        <button
          type="button"
          aria-pressed={drawing?.kind === 'circle'}
          onClick={() => openTool('circle')}
        >
          Circle
        </button>
        <button
          type="button"
          disabled={!grabbable}
          aria-pressed={drawing?.kind === 'points'}
          onClick={editPoints}
        >
          Edit points
        </button>
        <button
          type="button"
          onClick={restore}
          disabled={!grabbable}
          aria-disabled={restoreOffer?.refusal ? true : undefined}
          title={
            restoreOffer?.refusal && selectedRoom
              ? heldBack(selectedRoom.name, 'be restored', restoreOffer.refusal)
              : undefined
          }
        >
          Restore shape
        </button>
        {remembered && grabbable && (
          <button
            type="button"
            onClick={undoCarve}
            aria-disabled={undoOffer?.refusal ? true : undefined}
            title={
              undoOffer?.refusal && selectedRoom
                ? heldBack(selectedRoom.name, 'go back', undoOffer.refusal)
                : undefined
            }
          >
            Undo carve
          </button>
        )}
        <button
          type="button"
          disabled={placed.length === 0}
          onClick={() => align(northAngle(plot))}
        >
          Align to north
        </button>
        <button type="button" disabled={placed.length === 0} onClick={() => align(plotAngle(plot))}>
          Align to plot
        </button>
        <button
          type="button"
          disabled={!selectedRoom}
          onClick={() => selectedRoom && onPin(selectedRoom.id, !selectedRoom.pinned)}
        >
          {selectedRoom?.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          type="button"
          disabled={!grabbable}
          onClick={() => selectedRoom && onUnplace(selectedRoom.id)}
        >
          Unplace
        </button>
        {selectedEdge && selectedEdge.kind !== 'main-door' && (
          <button
            type="button"
            onClick={() =>
              onSetEdgeKind(selectedEdge.id, selectedEdge.kind === 'open' ? 'door' : 'open')
            }
          >
            {selectedEdge.kind === 'open' ? 'Make it a door' : 'Make it open'}
          </button>
        )}
        <button
          type="button"
          disabled={!selectedEdge}
          onClick={() => selectedEdge && onDisconnect(selectedEdge.id)}
        >
          Disconnect
        </button>
        <button type="button" onClick={() => setCamera(fitCamera)}>
          Fit
        </button>
      </div>
      <p className="zoning-hint">{drawing ? HINTS[drawing.kind] : HINT}</p>
      <div className="zoning-body">
        <Tray rooms={tray.filter((room) => room.id !== asked?.id)} onGrab={grabTray} />
        <svg
          ref={svgRef}
          className={[
            'zoning-sheet',
            gesture?.kind === 'pan' ? 'zoning-panning' : '',
            drawingOut ? 'zoning-drawing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          viewBox={viewBoxOf(extent, camera)}
          preserveAspectRatio="xMidYMid meet"
          style={{ '--per-px': String(perPixel) } as CSSProperties}
          tabIndex={0}
          role="application"
          aria-label="Zoning plan"
          onPointerDownCapture={(event) => {
            touchesRef.current.set(event.pointerId, [event.clientX, event.clientY])
            if (touchesRef.current.size < 2) return
            // A second finger is a pinch, not a second grab, so it never reaches what it landed on.
            event.stopPropagation()
            beginPinch()
          }}
          onPointerDown={(event) => grabSheet(event, true)}
          onPointerMove={drawingOut ? drawMove : undefined}
          onKeyDown={(event) => {
            if (drawing && event.key === 'Escape') {
              event.preventDefault()
              stopDrawing()
              return
            }
            if (drawing?.kind === 'draw' && event.key === 'Enter') {
              event.preventDefault()
              closeDrawing(drawing.roomId, drawing.corners)
              return
            }
            if (
              drawing?.kind === 'points' &&
              (event.key === 'Delete' || event.key === 'Backspace')
            ) {
              event.preventDefault()
              dropVertex()
              return
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
              if (!selectedEdge) return
              event.preventDefault()
              onDisconnect(selectedEdge.id)
              return
            }
            if (event.key === '+' || event.key === '=') {
              event.preventDefault()
              zoomBy(ZOOM_STEP)
              return
            }
            if (event.key === '-' || event.key === '_') {
              event.preventDefault()
              zoomBy(1 / ZOOM_STEP)
              return
            }
            if (event.key === '0') {
              event.preventDefault()
              setCamera(fitCamera)
              return
            }
            // Space is the pan grip while the sheet has the keyboard, never the page's scroll.
            if (event.key === ' ') {
              event.preventDefault()
              return
            }
            if (event.key.toLowerCase() !== 'r') return
            event.preventDefault()
            turn()
          }}
        >
          <PlotSheet plot={plot} />
          <Ghosts footprints={below} />
          {marks.tensions.map((mark) => (
            <Tension key={mark.edgeId} mark={mark} />
          ))}
          {/* Under the rooms, which keep their own shapes to take the pointer. */}
          {joins.map((join) => (
            <JoinShape
              key={join.key}
              join={join}
              selected={selected !== null && join.ids.includes(selected)}
            />
          ))}
          {placed
            .filter((room) => room.id !== asked?.id)
            .map((room) => (
              <RoomShape
                key={room.id}
                room={room}
                sizes={sizes.get(room.type)}
                selected={room.id === selected}
                joined={joined.has(room.id)}
                onGrab={onGrabRoom}
                onHover={onHoverRoom}
              />
            ))}
          {asked && (
            <PendingRoom
              id={asked.id}
              name={asked.name}
              targetArea={asked.targetArea}
              footprint={asked.footprint}
            />
          )}
          {/* Drawn under the door marks and the proposals, which keep the middle of the wall. */}
          {pairs.map((pair) => (
            <WallHandle
              key={keyOf(pair)}
              pair={pair}
              perPixel={perPixel}
              shown={wallShown(pair)}
              onGrab={(event) => grabWall(event, pair)}
              onHover={(over) => setHoveredWall(over ? keyOf(pair) : null)}
            />
          ))}
          {vanished.map((mark) => (
            <VanishedWall
              key={mark.edgeId}
              mark={mark}
              selected={mark.edgeId === selected}
              onSelect={(event) => {
                event.stopPropagation()
                if (panningWith(event)) {
                  grabSheet(event, false)
                  return
                }
                svgRef.current?.focus({ preventScroll: true })
                onSelect(mark.edgeId)
              }}
            />
          ))}
          {marks.doors.map((mark) => (
            <Door
              key={mark.edgeId}
              mark={mark}
              selected={mark.edgeId === selected}
              onSelect={(event) => {
                event.stopPropagation()
                if (panningWith(event)) {
                  grabSheet(event, false)
                  return
                }
                svgRef.current?.focus({ preventScroll: true })
                onSelect(mark.edgeId)
              }}
            />
          ))}
          {selectedRoom &&
            isPlaced(selectedRoom) &&
            grabbable &&
            !selectedRoom.pinned &&
            !drawing && (
              <Handles
                footprint={selectedRoom.footprint}
                perPixel={perPixel}
                onRotate={(event) => {
                  event.stopPropagation()
                  if (panningWith(event)) {
                    grabSheet(event, false)
                    return
                  }
                  begin(selectedRoom, (footprint) => ({
                    kind: 'rotate',
                    id: selectedRoom.id,
                    from: footprint,
                  }))
                }}
                onResize={(event, sx, sy) => {
                  event.stopPropagation()
                  if (panningWith(event)) {
                    grabSheet(event, false)
                    return
                  }
                  begin(selectedRoom, (footprint) => ({
                    kind: 'resize',
                    id: selectedRoom.id,
                    from: footprint,
                    sx,
                    sy,
                  }))
                }}
              />
            )}
          {/* The marks are drawn over the handles: a proposal has one place to be clicked, where a room can still be resized by a corner. */}
          {proposals.map((mark) => (
            <Proposal
              key={`${mark.a}|${mark.b}`}
              mark={mark}
              perPixel={perPixel}
              onAccept={(event) => {
                event.stopPropagation()
                if (panningWith(event)) {
                  grabSheet(event, false)
                  return
                }
                onConnect(mark.a, mark.b, storey)
              }}
            />
          ))}
          {gesture?.kind === 'drop' && <DropGhost at={gesture.at} size={dropSize()} />}
          {drawing?.kind === 'draw' && (
            <DrawPreview
              run={drawRun}
              corners={drawing.corners.map((corner) => corner.at)}
              closing={drawing.at !== null && closesAt(drawing.corners, drawing.at)}
              perPixel={perPixel}
            />
          )}
          {drawing?.kind === 'circle' && drawing.centre && (
            <CirclePreview
              centre={drawing.centre}
              radius={drawing.radius}
              targetArea={rooms.find((room) => room.id === drawing.roomId)?.targetArea ?? 0}
              perPixel={perPixel}
            />
          )}
          {drawing?.kind === 'points' && selectedRoom && isPlaced(selectedRoom) && (
            <VertexHandles
              footprint={selectedRoom.footprint}
              perPixel={perPixel}
              picked={drawing.picked}
              onGrab={grabVertex}
              onAdd={addVertex}
            />
          )}
          <NorthArrow
            north={plot.north}
            at={[shown.minX + shown.width - FURNITURE_PX * perPixel, shown.minY + 44 * perPixel]}
            perPixel={perPixel}
          />
          <ScaleBar
            at={[
              shown.minX + FURNITURE_PX * perPixel,
              shown.minY + shown.height - FURNITURE_PX * perPixel,
            ]}
            perPixel={perPixel}
          />
        </svg>
      </div>
      {picking && (
        <PickRoom
          rooms={tray}
          onPick={(id) => startTool(picking, id)}
          onDrop={() => setPicking(null)}
        />
      )}
      {asked && (
        <Ask
          prompt={{
            name: asked.name,
            over: asked.over.map((other) => other.name),
            reason: asked.carve.ok ? null : asked.carve.reason,
            at: asked.at,
          }}
          onCarve={carveHere}
          onPutBack={() => setAsked(null)}
        />
      )}
    </div>
  )
}
