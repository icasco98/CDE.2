import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { boundingBox, outlineOf, type Footprint, type Handle, type Point } from '../../geometry'
import { occupiedStoreys, type Room } from '../../model'
import {
  fitCamera,
  metresPerPixel,
  panTo,
  viewBoxOf,
  visibleExtent,
  zoomAbout,
  ZOOM_STEP,
  type Camera,
} from './camera'
import { defaultProportion, startingRectangle } from './defaults'
import { edgeMarks, proposalsFrom } from './doors'
import { extentOf, pointerAt } from './frame'
import {
  angleTo,
  carveWith,
  dropFootprint,
  moveFootprint,
  resizeFootprint,
  rotateFootprint,
  sheetOf,
  snapAngle,
  type Attempt,
  type Sheet,
} from './gestures'
import {
  Door,
  DropGhost,
  Ghosts,
  Handles,
  NorthArrow,
  PlotSheet,
  Proposal,
  RoomShape,
  ScaleBar,
  Storeys,
  Tension,
  Tray,
} from './parts'
import type { ZoningViewProps } from './types'
import './zoning.css'

type Placed = Room & { readonly footprint: Footprint }

/** How far the hand may wander before a press on the sheet is a pan rather than a click, in pixels. */
const DRAG_PX = 3

/** Where the north arrow and the scale bar sit in from the corner of what is drawn, in pixels. */
const FURNITURE_PX = 26

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

/** Two fingers on the sheet: the metre under their middle, how far apart they began, and the scale they began at. */
type Pinch = { readonly grabbed: Point; readonly span: number; readonly scale: number }

type Gesture =
  | Grip
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

const emptySheet: Sheet = { others: [], outlines: [], boundary: [] }

function isPlaced(room: Room): room is Placed {
  return room.footprint !== undefined
}

function centreOf(footprint: Footprint): Point {
  const bounds = boundingBox(footprint.polygon)
  return [bounds.left + bounds.width / 2, bounds.top + bounds.depth / 2]
}

/** A wheel notch, whether the wheel counts in pixels or in lines; a trackpad pinch counts in pixels. */
function notchesOf(event: WheelEvent): number {
  return event.deltaMode === 0 ? event.deltaY / 100 : event.deltaY / 3
}

export function ZoningView(props: ZoningViewProps) {
  const { rooms, edges, storeys, plot, sizes, selected } = props
  const { onPlace, onCarve, onUnplace, onPin, onConnect, onDisconnect, onSelect, onRefuse } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const sheetRef = useRef<Sheet>(emptySheet)
  /** Whether the drag has done anything yet, so an abandoned one puts back only what it moved and a press that never moved is a click. */
  const movedRef = useRef(false)
  /** Every pointer down on the sheet, so a second finger becomes a pinch instead of a second grab. */
  const touchesRef = useRef(new Map<number, Point>())
  /** Space turns any drag into a pan, so a room under the hand is slid past rather than picked up. */
  const spaceRef = useRef(false)
  const [gesture, setGesture] = useState<Gesture>(null)
  const [storey, setStorey] = useState(0)
  const [camera, setCamera] = useState<Camera>(fitCamera)
  const [box, setBox] = useState({ width: 0, height: 0 })

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
    () => placed.map((room) => ({ id: room.id, outline: outlineOf(room.footprint) })),
    [placed],
  )
  const marks = useMemo(
    () =>
      edgeMarks(
        standing,
        edges.filter((edge) => edge.storey === storey),
        plot,
      ),
    [standing, edges, storey, plot],
  )
  const proposals = useMemo(() => proposalsFrom(standing, edges, storey), [standing, edges, storey])
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

  const at = (event: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current
    return svg ? pointerAt(svg, event.clientX, event.clientY) : [0, 0]
  }

  const sheetFor = (skip: string | null): Sheet =>
    sheetOf(
      placed
        .filter((room) => room.id !== skip)
        .map((room) => ({
          id: room.id,
          name: room.name,
          footprint: room.footprint,
          pinned: room.pinned,
        })),
      plot.on ? plot.polygon : [],
    )

  const proportionFor = (room: Room): number =>
    sizes.get(room.type)?.proportion ?? defaultProportion

  function attemptFor(grip: Grip, pointer: Point, alt: boolean, free: boolean): Attempt<Footprint> {
    const sheet = sheetRef.current
    if (grip.kind === 'move') {
      const delta: Point = [pointer[0] - grip.at[0], pointer[1] - grip.at[1]]
      return moveFootprint(grip.from, delta, sheet, alt)
    }
    if (grip.kind === 'rotate') {
      return rotateFootprint(
        grip.from,
        snapAngle(angleTo(centreOf(grip.from), pointer), free),
        sheet,
      )
    }
    return resizeFootprint(grip.from, grip.sx, grip.sy, pointer, sheet)
  }

  /** Places the room, or carves every room it lies over, as one step to undo. */
  function settle(
    room: Room,
    footprint: Footprint,
    carving: boolean,
    from: Footprint | null,
  ): void {
    if (!carving) {
      onPlace(room.id, footprint, 'commit')
      return
    }
    const carved = carveWith(footprint, sheetRef.current)
    if (!carved.ok) {
      onRefuse(`${room.name} cannot carve here: ${carved.reason}.`)
      if (from && movedRef.current) onPlace(room.id, from, 'commit')
      return
    }
    onCarve([{ id: room.id, footprint }, ...carved.value])
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
    if (gesture.kind === 'drop') {
      setGesture({ ...gesture, at: pointer })
      return
    }
    const attempt = attemptFor(gesture, pointer, event.altKey, event.shiftKey)
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
    const room = rooms.find((entry) => entry.id === gesture.id)
    if (!room) return
    const pointer = at(event)
    if (gesture.kind === 'drop') {
      if (!insideExtent(pointer)) return
      const size = startingRectangle(room.targetArea, proportionFor(room))
      const dropped = dropFootprint(pointer, size, sheetRef.current, event.altKey)
      if (!dropped.ok) {
        onRefuse(`${room.name} cannot go there: ${dropped.reason}.`)
        return
      }
      settle(room, dropped.value, event.altKey, null)
      return
    }
    const attempt = attemptFor(gesture, pointer, event.altKey, event.shiftKey)
    if (!attempt.ok) {
      onRefuse(`${room.name} stays where it was: ${attempt.reason}.`)
      if (movedRef.current) onPlace(room.id, gesture.from, 'commit')
      return
    }
    settle(room, attempt.value, gesture.kind === 'move' && event.altKey, gesture.from)
  }

  /** The sheet takes the wheel whole, so the page never scrolls under it; a trackpad pinch arrives here with `ctrlKey` and zooms the same way. */
  function wheelZoom(event: WheelEvent): void {
    event.preventDefault()
    setCamera(zoomAbout(extent, camera, at(event), Math.pow(ZOOM_STEP, -notchesOf(event))))
  }

  const live = useRef({
    move: movePointer,
    release: releasePointer,
    grab: grabRoom,
    wheel: wheelZoom,
  })
  live.current = { move: movePointer, release: releasePointer, grab: grabRoom, wheel: wheelZoom }
  const dragging = gesture !== null

  /** Held steady through the ref, so a room's own group keeps its props and is not drawn again mid-drag. */
  const onGrabRoom = useCallback(
    (event: ReactPointerEvent, id: string) => live.current.grab(event, id),
    [],
  )

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

  /** Taken by hand rather than through React, whose own wheel listener cannot refuse the page its scroll. */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const wheel = (event: WheelEvent): void => live.current.wheel(event)
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [])

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.key === ' ') spaceRef.current = true
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === ' ') spaceRef.current = false
    }
    const letGo = (): void => {
      spaceRef.current = false
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

  function grabTray(event: ReactPointerEvent, room: Room): void {
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

  /** The keys zoom about the middle of what is drawn, which is the one point no hand is on. */
  function zoomBy(factor: number): void {
    const middle: Point = [shown.minX + shown.width / 2, shown.minY + shown.height / 2]
    setCamera(zoomAbout(extent, camera, middle, factor))
  }

  function dropSize(): { readonly width: number; readonly depth: number } {
    const room = gesture?.kind === 'drop' ? rooms.find((entry) => entry.id === gesture.id) : null
    return room ? startingRectangle(room.targetArea, proportionFor(room)) : { width: 1, depth: 1 }
  }

  return (
    <div className="zoning">
      <div className="zoning-bar">
        <Storeys storeys={storeys} storey={storey} onStorey={setStorey} />
        <button type="button" onClick={turn} disabled={!grabbable}>
          Rotate 90°
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
      <div className="zoning-body">
        <Tray rooms={tray} onGrab={grabTray} />
        <svg
          ref={svgRef}
          className={gesture?.kind === 'pan' ? 'zoning-sheet zoning-panning' : 'zoning-sheet'}
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
          onKeyDown={(event) => {
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
          {placed.map((room) => (
            <RoomShape
              key={room.id}
              room={room}
              sizes={sizes.get(room.type)}
              selected={room.id === selected}
              onGrab={onGrabRoom}
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
          {selectedRoom && isPlaced(selectedRoom) && grabbable && !selectedRoom.pinned && (
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
    </div>
  )
}
