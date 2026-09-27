/**
 * A menu opened at the pointer, kept whole inside the window: measured once it is drawn, turned
 * up or to the left where it would run off, and capped with a scroll where the window is shorter.
 */

import { useLayoutEffect, useRef } from 'react'

/** The clear space kept between a menu and the window's edge, in pixels. */
const MARGIN = 4

/**
 * How far a menu opened at `start` along one axis moves to lie within the window of `size`: to the
 * other side of the point it opened at when it runs past the far edge and fits there, else only as
 * far back as it must.
 */
export function shiftOnScreen(start: number, length: number, size: number): number {
  const far = size - MARGIN
  if (start < MARGIN) return MARGIN - start
  if (start + length <= far) return 0
  const flipped = start - length
  return (flipped >= MARGIN ? flipped : Math.max(MARGIN, far - length)) - start
}

/**
 * A ref for a menu's box; after each render the box is lifted out of any panel that would clip it,
 * then moved and capped to fit the window.
 */
export function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    box.style.position = ''
    box.style.transform = ''
    box.style.maxHeight = ''
    box.style.overflowY = ''
    box.style.boxSizing = ''
    const opened = box.getBoundingClientRect()
    box.style.position = 'fixed'
    const tallest = window.innerHeight - 2 * MARGIN
    if (box.getBoundingClientRect().height > tallest) {
      box.style.boxSizing = 'border-box'
      box.style.maxHeight = `${tallest}px`
      box.style.overflowY = 'auto'
    }
    const rect = box.getBoundingClientRect()
    const dx = opened.left - rect.left + shiftOnScreen(opened.left, rect.width, window.innerWidth)
    const dy = opened.top - rect.top + shiftOnScreen(opened.top, rect.height, window.innerHeight)
    box.style.transform = `translate(${dx}px, ${dy}px)`
  })
  return ref
}
