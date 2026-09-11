import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Point3, View } from '../../massing'
import { extentOf, orbitBy, type Extent } from './frame'

/** The view opens from the north-east, the quarter a Kuwaiti plot is most often read from. */
const OPENING_AZIMUTH = 45

/** How far the pointer may travel and the press still count as a click on empty ground. */
const CLICK_SLOP = 3

export type Orbit = {
  readonly view: View
  readonly azimuth: number
  readonly extent: Extent
  /** Takes hold of the empty ground: a drag from here turns the view, a press that stays still is a click. */
  readonly take: (event: ReactPointerEvent) => void
  readonly goTo: (azimuth: number) => void
  readonly fit: () => void
}

/**
 * Where the drawing is seen from and what it is framed by. A turn happens inside the frame it
 * started in, so orbiting rotates the mass rather than pumping its size; a mass that has changed
 * shape, and the Fit button, frame it afresh.
 */
export function useOrbit(corners: readonly Point3[], onPress: () => void): Orbit {
  const [azimuth, setAzimuth] = useState(OPENING_AZIMUTH)
  const [held, setHeld] = useState<Extent | null>(null)
  const [turning, setTurning] = useState(false)
  const grip = useRef<{ readonly x: number; readonly from: number; moved: boolean } | null>(null)

  const view = useMemo(() => ({ azimuth }), [azimuth])
  const fitted = useMemo(() => extentOf(corners, view), [corners, view])

  useEffect(() => {
    setHeld(null)
  }, [corners])

  const live = useRef({ azimuth, fitted, onPress })
  live.current = { azimuth, fitted, onPress }

  useEffect(() => {
    if (!turning) return
    const move = (event: PointerEvent): void => {
      const held = grip.current
      if (!held) return
      const travelled = event.clientX - held.x
      if (Math.abs(travelled) > CLICK_SLOP) held.moved = true
      setAzimuth(orbitBy(held.from, travelled))
    }
    const up = (): void => {
      const held = grip.current
      grip.current = null
      setTurning(false)
      if (held && !held.moved) live.current.onPress()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [turning])

  return {
    view,
    azimuth,
    extent: held ?? fitted,
    take(event) {
      grip.current = { x: event.clientX, from: live.current.azimuth, moved: false }
      setHeld(live.current.fitted)
      setTurning(true)
    },
    goTo(next) {
      setHeld(null)
      setAzimuth(next)
    },
    fit: () => setHeld(null),
  }
}
