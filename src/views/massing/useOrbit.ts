import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { Point } from '../../geometry'
import { ELEVATION_DEG, type Point3, type View } from '../../massing'
import {
  fitCamera,
  panTo,
  pointerAt,
  viewBoxOf,
  zoomAbout,
  type Camera,
  type Extent,
} from '../camera'
import { extentOf, frameAbout, orbitBy, tiltBy } from './frame'

/** The view opens from the north-east, the quarter a Kuwaiti plot is most often read from. */
const OPENING_AZIMUTH = 45

/** How far the pointer may travel and the press still count as a click on empty ground. */
const CLICK_SLOP = 3

/** The ground taken hold of: a drag from here turns and tilts the view about one point of the mass. */
type Turn = {
  readonly kind: 'turn'
  readonly x: number
  readonly y: number
  readonly view: View
  readonly frame: Extent
  readonly camera: Camera
  readonly pivot: Point3
  moved: boolean
}

/** Two fingers on the sheet: the metre under their middle, how far apart they began, and the scale they began at. */
type Pinch = {
  readonly kind: 'pinch'
  readonly grabbed: Point
  readonly span: number
  readonly scale: number
}

type Orbit = {
  readonly view: View
  /** The part of the drawing the sheet shows: the frame it is held in, as the camera has it. */
  readonly viewBox: string
  /** Takes hold of the empty ground: a drag from here turns the view, a press that stays still is a click. */
  readonly take: (event: ReactPointerEvent) => void
  /** Every pointer down on the sheet, so a second finger becomes a pinch rather than a second grab. */
  readonly track: (event: ReactPointerEvent) => void
  readonly goTo: (view: View) => void
  readonly fit: () => void
  /** Freezes the frame, so a gesture that moves the mass does not reframe the sheet under the hand. */
  readonly hold: () => void
  readonly zoom: (at: Point, factor: number) => void
}

/**
 * Where the drawing is seen from and what it is framed by. A turn happens inside the frame it
 * started in and about one point of the mass, so orbiting revolves the building rather than
 * swinging it across the sheet; the camera sits over that frame, so a wheel or a pinch draws the
 * mass closer without touching the angle it is seen from.
 */
export function useOrbit(input: {
  readonly corners: readonly Point3[]
  readonly pivot: Point3
  readonly sheet: RefObject<SVGSVGElement | null>
  readonly onPress: () => void
}): Orbit {
  const { corners, pivot, sheet, onPress } = input
  const [view, setView] = useState<View>({
    azimuth: OPENING_AZIMUTH,
    elevation: ELEVATION_DEG,
  })
  const [frame, setFrame] = useState<Extent | null>(null)
  const [camera, setCamera] = useState<Camera>(fitCamera)
  const [gripping, setGripping] = useState(false)
  const grip = useRef<Turn | Pinch | null>(null)
  const touches = useRef(new Map<number, Point>())

  const fitted = useMemo(() => extentOf(corners, view), [corners, view])
  const extent = frame ?? fitted

  const live = useRef({ view, extent, camera, pivot, onPress })
  live.current = { view, extent, camera, pivot, onPress }

  /** A finger lifted anywhere is a finger off the sheet, so the next press is never read as a pinch. */
  useEffect(() => {
    const forget = (event: PointerEvent): void => {
      touches.current.delete(event.pointerId)
    }
    window.addEventListener('pointerup', forget)
    window.addEventListener('pointercancel', forget)
    return () => {
      window.removeEventListener('pointerup', forget)
      window.removeEventListener('pointercancel', forget)
    }
  }, [])

  useEffect(() => {
    if (!gripping) return

    /** Two fingers zoom about the metre their middle began on and carry it along with them. */
    const pinchTo = (pinch: Pinch): void => {
      const svg = sheet.current
      const [first, second] = [...touches.current.values()]
      if (!svg || !first || !second) return
      const span = Math.hypot(first[0] - second[0], first[1] - second[1])
      if (span <= 0) return
      const middle = pointerAt(svg, (first[0] + second[0]) / 2, (first[1] + second[1]) / 2)
      const { extent: over, camera: held } = live.current
      const factor = (pinch.scale * span) / (pinch.span * held.scale)
      setCamera(panTo(over, zoomAbout(over, held, middle, factor), pinch.grabbed, middle))
    }

    const turnTo = (held: Turn, event: PointerEvent): void => {
      const across = event.clientX - held.x
      const down = event.clientY - held.y
      if (Math.hypot(across, down) > CLICK_SLOP) held.moved = true
      const now: View = {
        azimuth: orbitBy(held.view.azimuth, across),
        elevation: tiltBy(held.view.elevation, down),
      }
      const moved = frameAbout(held.frame, held.pivot, held.view, now)
      setView(now)
      setFrame(moved)
      // The camera reads its corner in the same metres as the frame, so it travels with it and a
      // mass drawn close keeps the point it turns about under the same pixel.
      setCamera({
        scale: held.camera.scale,
        x: held.camera.x + moved.minX - held.frame.minX,
        y: held.camera.y + moved.minY - held.frame.minY,
      })
    }

    const move = (event: PointerEvent): void => {
      const held = grip.current
      if (!held) return
      if (held.kind === 'pinch') {
        if (touches.current.has(event.pointerId))
          touches.current.set(event.pointerId, [event.clientX, event.clientY])
        pinchTo(held)
        return
      }
      turnTo(held, event)
    }
    const up = (): void => {
      const held = grip.current
      grip.current = null
      touches.current.clear()
      setGripping(false)
      if (held?.kind === 'turn' && !held.moved) live.current.onPress()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gripping, sheet])

  return {
    view,
    viewBox: viewBoxOf(extent, camera),
    take(event) {
      const held = live.current
      grip.current = {
        kind: 'turn',
        x: event.clientX,
        y: event.clientY,
        view: held.view,
        frame: held.extent,
        camera: held.camera,
        pivot: held.pivot,
        moved: false,
      }
      setFrame(held.extent)
      setGripping(true)
    },
    track(event) {
      touches.current.set(event.pointerId, [event.clientX, event.clientY])
      if (touches.current.size < 2) return
      const svg = sheet.current
      const [first, second] = [...touches.current.values()]
      if (!svg || !first || !second) return
      const span = Math.hypot(first[0] - second[0], first[1] - second[1])
      if (span <= 0) return
      // A second finger is a pinch, not a second grab, so it never reaches what it landed on.
      event.stopPropagation()
      setFrame(live.current.extent)
      grip.current = {
        kind: 'pinch',
        grabbed: pointerAt(svg, (first[0] + second[0]) / 2, (first[1] + second[1]) / 2),
        span,
        scale: live.current.camera.scale,
      }
      setGripping(true)
    },
    goTo(next) {
      setView(next)
      setFrame(null)
      setCamera(fitCamera)
    },
    fit() {
      setFrame(null)
      setCamera(fitCamera)
    },
    hold() {
      setFrame(live.current.extent)
    },
    zoom(at, factor) {
      const { extent: over, camera: held } = live.current
      setFrame(over)
      setCamera(zoomAbout(over, held, at, factor))
    },
  }
}
