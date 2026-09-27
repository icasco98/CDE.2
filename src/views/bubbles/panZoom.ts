/**
 * The bubble diagram's camera by hand: the wheel (and a trackpad's pinch, which arrives as one)
 * zooms about the pointer, and a drag on the diagram's background pans. A press on the background
 * that never becomes a drag is a click, which the diagram reads as letting the selection go.
 */

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  metresPerPixel,
  panTo,
  pointerAt,
  wheelFactor,
  zoomAbout,
  type Camera,
  type Extent,
} from '../camera'

/** How far the hand may wander before a press is a drag rather than a click, in pixels. */
export const DRAG_PX = 3

type Pan = { readonly from: readonly [number, number]; readonly start: Camera; moved: boolean }

export function usePanZoom(
  svg: RefObject<SVGSVGElement | null>,
  extent: Extent,
  camera: Camera,
  onCamera: (next: (was: Camera) => Camera) => void,
  onClick: () => void,
): (event: ReactPointerEvent) => void {
  const pan = useRef<Pan | null>(null)
  const live = useRef({ extent, camera, onCamera, onClick })
  live.current = { extent, camera, onCamera, onClick }

  useEffect(() => {
    const sheet = svg.current
    if (!sheet) return
    // Not React's wheel handler: the page must not scroll under the diagram, and React's is passive.
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      const at = pointerAt(sheet, event.clientX, event.clientY)
      const factor = wheelFactor(event)
      live.current.onCamera((was) => zoomAbout(live.current.extent, was, at, factor))
    }
    const move = (event: PointerEvent): void => {
      const held = pan.current
      if (!held) return
      const dx = event.clientX - held.from[0]
      const dy = event.clientY - held.from[1]
      if (!held.moved && Math.hypot(dx, dy) <= DRAG_PX) return
      held.moved = true
      const { extent: whole } = live.current
      const per = metresPerPixel(whole, held.start, sheet.getBoundingClientRect())
      live.current.onCamera(() => panTo(whole, held.start, [0, 0], [dx * per, dy * per]))
    }
    const up = (): void => {
      const held = pan.current
      pan.current = null
      if (held && !held.moved) live.current.onClick()
    }
    const cancel = (): void => {
      pan.current = null
    }
    sheet.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      sheet.removeEventListener('wheel', wheel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [svg])

  return (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    pan.current = { from: [event.clientX, event.clientY], start: live.current.camera, moved: false }
  }
}
