import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { frameOf, type Footprint, type Point } from '../../geometry'
import { levelsOf, unproject, type View } from '../../massing'
import { occupiedStoreys, type Commit, type Plot, type Room } from '../../model'
import { pointerAt } from '../camera'
import { defaultProportion, type RoomSizes } from '../zoning/defaults'
import {
  angleTo,
  landOver,
  moveFootprint,
  movedTo,
  rotateFootprint,
  sheetOf,
  snapAngle,
  type Neighbour,
  type Sheet,
} from '../zoning/gestures'

/** A room taken hold of in the massing: what it was, where the hand took it, and over what plane. */
type Grip = {
  readonly kind: 'move' | 'turn'
  readonly id: string
  readonly name: string
  readonly from: Footprint
  /** Where the hand first landed on the room's own plane, in sheet metres. */
  readonly at: Point
  /** The height of the plane the drag is read on: the room's floor to move it, its roof to turn it. */
  readonly z: number
  readonly view: View
  /** Where the hand went down on the screen, so a press that never travels is a click and not a move. */
  readonly x: number
  readonly y: number
}

/** How far the hand may travel and the press still count as picking the room rather than moving it. */
const CLICK_SLOP = 3

type Editing = {
  /** Takes hold of a prism's roof: a drag from here slides the room across its floor. */
  readonly grabTop: (event: ReactPointerEvent, id: string) => void
  /** Takes hold of the handle above the roof: a drag from here turns the room. */
  readonly grabTurn: (event: ReactPointerEvent, id: string) => void
}

const emptySheet: Sheet = { others: [], outlines: [], boundary: [] }

/**
 * Moving and turning a room from the massing. The pointer is read back onto the room's own floor
 * plane, so the hand moves the room where the hand is; from there the gesture is the sheet's own,
 * with its neighbours, its snapping and its plot. Nothing else about a room is edited here: a
 * resize, a carve or a wall belongs to the drawing that shows walls.
 */
export function useEditing(input: {
  readonly rooms: readonly Room[]
  readonly sizes: ReadonlyMap<string, RoomSizes>
  readonly plot: Plot
  readonly storeys: number
  readonly heights: readonly number[]
  readonly view: View
  readonly sheet: RefObject<SVGSVGElement | null>
  readonly onPlace: (id: string, footprint: Footprint, commit: Commit) => void
  readonly onSelect: (id: string) => void
  readonly onRefuse: (reason: string) => void
  /** Called as a gesture begins, so the frame is held while the mass changes under it. */
  readonly onHold: () => void
}): Editing {
  const [grip, setGrip] = useState<Grip | null>(null)
  const sheetRef = useRef<Sheet>(emptySheet)
  /** Whether the drag has written a preview yet, so an abandoned one puts back only what it moved. */
  const movedRef = useRef(false)
  /** Whether the hand has travelled at all, so a press that picks a room never also nudges it. */
  const travelledRef = useRef(false)

  const live = useRef(input)
  live.current = input

  function at(event: { clientX: number; clientY: number }, view: View, z: number): Point {
    const svg = live.current.sheet.current
    if (!svg) return [0, 0]
    return unproject(pointerAt(svg, event.clientX, event.clientY), view, z)
  }

  function neighboursOf(room: Room): readonly Neighbour[] {
    const { rooms, sizes } = live.current
    const here = new Set(occupiedStoreys(room))
    return rooms.flatMap((other): Neighbour[] => {
      if (other.id === room.id || !other.footprint) return []
      if (!occupiedStoreys(other).some((storey) => here.has(storey))) return []
      return [
        {
          id: other.id,
          name: other.name,
          footprint: other.footprint,
          pinned: other.pinned,
          sizes: sizes.get(other.type) ?? { proportion: defaultProportion },
        },
      ]
    })
  }

  function begin(event: ReactPointerEvent, id: string, kind: Grip['kind']): void {
    event.stopPropagation()
    const { rooms, plot, storeys, heights, view, onSelect, onRefuse, onHold } = live.current
    onSelect(id)
    const room = rooms.find((entry) => entry.id === id)
    const footprint = room?.footprint
    if (!room || !footprint) return
    if (room.pinned) {
      onRefuse(`${room.name} is pinned.`)
      return
    }
    const levels = levelsOf(room, storeys, heights)
    if (!levels) return
    const z = kind === 'move' ? levels.floor : levels.ceiling
    sheetRef.current = sheetOf(neighboursOf(room), plot.on ? plot.polygon : [])
    movedRef.current = false
    travelledRef.current = false
    onHold()
    setGrip({
      kind,
      id,
      name: room.name,
      from: footprint,
      at: at(event, view, z),
      z,
      view,
      x: event.clientX,
      y: event.clientY,
    })
  }

  useEffect(() => {
    if (!grip) return
    const centre = frameOf(grip.from)

    const attemptAt = (event: PointerEvent) => {
      const pointer = at(event, grip.view, grip.z)
      if (grip.kind === 'turn') {
        const turned = snapAngle(angleTo([centre.cx, centre.cy], pointer), event.shiftKey)
        return rotateFootprint(grip.from, turned, sheetRef.current)
      }
      const delta: Point = [pointer[0] - grip.at[0], pointer[1] - grip.at[1]]
      return moveFootprint(grip.from, delta, sheetRef.current)
    }

    const move = (event: PointerEvent): void => {
      if (Math.hypot(event.clientX - grip.x, event.clientY - grip.y) > CLICK_SLOP)
        travelledRef.current = true
      if (!travelledRef.current) return
      const attempt = attemptAt(event)
      if (!attempt.ok) return
      live.current.onPlace(grip.id, attempt.value, 'preview')
      movedRef.current = true
    }

    const putBack = (reason: string): void => {
      live.current.onRefuse(`${grip.name} stays where it was: ${reason}.`)
      if (movedRef.current) live.current.onPlace(grip.id, grip.from, 'commit')
    }

    const up = (event: PointerEvent): void => {
      setGrip(null)
      // A press that never travelled picked the room and nothing more: it is not a gesture to settle.
      if (!travelledRef.current) return
      const attempt = attemptAt(event)
      if (attempt.ok) {
        live.current.onPlace(grip.id, attempt.value, 'commit')
        return
      }
      if (grip.kind === 'turn') {
        putBack(attempt.reason)
        return
      }
      // A room let go over its neighbours is refused here and said out loud: the question of
      // carving is asked on the sheet, which is the drawing that can answer it.
      const pointer = at(event, grip.view, grip.z)
      const delta: Point = [pointer[0] - grip.at[0], pointer[1] - grip.at[1]]
      const landing = landOver(movedTo(grip.from, delta), sheetRef.current)
      const over = landing.over.map((other) => other.name).join(' and ')
      putBack(
        over === ''
          ? attempt.reason
          : `that would overlap ${over}; drop it there on the sheet to carve`,
      )
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [grip])

  return {
    grabTop: (event, id) => begin(event, id, 'move'),
    grabTurn: (event, id) => begin(event, id, 'turn'),
  }
}
