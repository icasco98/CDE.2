import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { boundingBox, outlineOf, type Footprint, type Handle, type Point } from '../../geometry'
import { occupiedStoreys, type Room } from '../../model'
import { defaultProportion, startingRectangle } from './defaults'
import { edgeMarks, proposalsFrom } from './doors'
import { extentOf, pointerAt, viewBoxOf } from './frame'
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

type Gesture =
  | Grip
  | { readonly kind: 'drop'; readonly id: string; readonly at: Point }
  | { readonly kind: 'held'; readonly name: string }
  | null

const emptySheet: Sheet = { others: [], outlines: [], boundary: [] }

function isPlaced(room: Room): room is Placed {
  return room.footprint !== undefined
}

function centreOf(footprint: Footprint): Point {
  const bounds = boundingBox(footprint.polygon)
  return [bounds.left + bounds.width / 2, bounds.top + bounds.depth / 2]
}

export function ZoningView(props: ZoningViewProps) {
  const { rooms, edges, storeys, plot, sizes, selected } = props
  const { onPlace, onCarve, onUnplace, onPin, onConnect, onDisconnect, onSelect, onRefuse } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const sheetRef = useRef<Sheet>(emptySheet)
  /** Whether the drag has already previewed, so an abandoned one only puts back what it moved. */
  const movedRef = useRef(false)
  const [gesture, setGesture] = useState<Gesture>(null)
  const [storey, setStorey] = useState(0)

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

  function movePointer(event: PointerEvent): void {
    if (!gesture) return
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
    if (!gesture) return
    setGesture(null)
    if (gesture.kind === 'held') return
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

  const live = useRef({ move: movePointer, release: releasePointer, grab: grabRoom })
  live.current = { move: movePointer, release: releasePointer, grab: grabRoom }
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

  function begin(room: Placed, start: (footprint: Footprint) => Grip): void {
    if (room.pinned) {
      onRefuse(`${room.name} is pinned.`)
      return
    }
    sheetRef.current = sheetFor(room.id)
    movedRef.current = false
    setGesture(start(room.footprint))
  }

  function grabRoom(event: ReactPointerEvent, id: string): void {
    event.stopPropagation()
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
      </div>
      <div className="zoning-body">
        <Tray rooms={tray} onGrab={grabTray} />
        <svg
          ref={svgRef}
          className="zoning-sheet"
          viewBox={viewBoxOf(extent)}
          preserveAspectRatio="xMidYMid meet"
          tabIndex={0}
          role="application"
          aria-label="Zoning plan"
          onPointerDown={() => onSelect(null)}
          onKeyDown={(event) => {
            if (event.key === 'Delete' || event.key === 'Backspace') {
              if (!selectedEdge) return
              event.preventDefault()
              onDisconnect(selectedEdge.id)
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
                svgRef.current?.focus({ preventScroll: true })
                onSelect(mark.edgeId)
              }}
            />
          ))}
          {selectedRoom && isPlaced(selectedRoom) && grabbable && !selectedRoom.pinned && (
            <Handles
              footprint={selectedRoom.footprint}
              onRotate={(event) => {
                event.stopPropagation()
                begin(selectedRoom, (footprint) => ({
                  kind: 'rotate',
                  id: selectedRoom.id,
                  from: footprint,
                }))
              }}
              onResize={(event, sx, sy) => {
                event.stopPropagation()
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
              onAccept={(event) => {
                event.stopPropagation()
                onConnect(mark.a, mark.b, storey)
              }}
            />
          ))}
          {gesture?.kind === 'drop' && <DropGhost at={gesture.at} size={dropSize()} />}
          <NorthArrow north={plot.north} at={[extent.minX + extent.width - 2, extent.minY + 2.4]} />
          <ScaleBar at={[extent.minX + 1.2, extent.minY + extent.height - 1.2]} />
        </svg>
      </div>
    </div>
  )
}
