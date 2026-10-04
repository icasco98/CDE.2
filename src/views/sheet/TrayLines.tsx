/**
 * Show connections' faint lines from a zone on the sheet to the zones it has a connection with that still wait in
 * the program: the program is beside the sheet, not on it, so these are drawn over both in screen
 * pixels, measured after every render and again whenever anything under them scrolls or resizes.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { centreOfFootprint, toWorld, type Zone } from '../../sheet'
import type { Camera } from '../camera'
import { TAG_HEIGHT, measureTray, scrollTrayTo, type TrayReach } from './trayReach'

const centreOf = (zone: Zone): readonly [number, number] => {
  const [cx, cy] = centreOfFootprint(zone)
  return toWorld(zone, cx, cy)
}

export function TrayLines(props: {
  readonly lines: readonly { readonly from: string; readonly to: string }[]
  readonly zones: readonly Zone[]
  readonly svg: SVGSVGElement | null
  readonly box: HTMLElement | null
  readonly camera: Camera
  readonly nameOf: (id: string) => string
}) {
  const { lines, zones, svg, box, camera } = props
  const [reaches, setReaches] = useState<readonly TrayReach[]>([])
  const measure = (): readonly TrayReach[] =>
    svg && box ? measureTray(lines, zones, centreOf, svg, box) : []
  const live = useRef(measure)
  live.current = measure

  useLayoutEffect(() => {
    setReaches(live.current())
  }, [lines, zones, svg, box, camera])

  /** A scroll of the list, the page or any box between, or a resize, measures again once a frame. */
  useEffect(() => {
    if (!svg || !box) return
    let frame = 0
    const schedule = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setReaches(live.current())
      })
    }
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(box)
    observer.observe(svg)
    const tray = box.querySelector('.tray')
    if (tray) observer.observe(tray)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [svg, box])

  if (reaches.length === 0) return null
  const tagged = [
    ...new Map(reaches.flatMap((each) => (each.tag ? [[each.to, each]] : []))).values(),
  ]
  return (
    <>
      <svg className="tray-lines" aria-hidden="true">
        {reaches.map((reach) => (
          <line
            key={reach.key}
            data-tray-line={reach.key}
            x1={reach.x1}
            y1={reach.y1}
            x2={reach.x2}
            y2={reach.y2}
          />
        ))}
      </svg>
      {tagged.map((reach) => (
        <button
          key={reach.to}
          type="button"
          className="tray-tag"
          data-tray-tag={reach.to}
          style={{ right: reach.tag!.right, top: reach.tag!.top, height: TAG_HEIGHT }}
          onClick={() => box && scrollTrayTo(box, reach.to)}
        >
          {reach.off === 'up' ? '↑' : '↓'} {props.nameOf(reach.to)}
        </button>
      ))}
    </>
  )
}
