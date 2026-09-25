/**
 * Check's faint lines from a room on the sheet to the rooms it has an edge with that still wait in
 * the program: the program is beside the sheet, not on it, so these are drawn over both in screen
 * pixels, measured after every render that could move either end.
 */

import { useLayoutEffect, useState } from 'react'
import { centreOfFootprint, toWorld, type Room } from '../../sheet'
import type { Camera } from '../camera'

type Segment = {
  readonly key: string
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

export function TrayLines(props: {
  readonly lines: readonly { readonly from: string; readonly to: string }[]
  readonly rooms: readonly Room[]
  readonly svg: SVGSVGElement | null
  readonly box: HTMLElement | null
  readonly camera: Camera
}) {
  const { lines, rooms, svg, box, camera } = props
  const [segments, setSegments] = useState<readonly Segment[]>([])

  useLayoutEffect(() => {
    const screen = svg?.getScreenCTM()
    const frame = box?.getBoundingClientRect()
    if (!screen || !frame || lines.length === 0) {
      setSegments((was) => (was.length ? [] : was))
      return
    }
    const measured: Segment[] = []
    for (const line of lines) {
      const room = rooms.find((each) => each.id === line.from)
      const entry = box?.querySelector(`.tray .item[data-room="${line.to}"]`)
      if (!room || !entry) continue
      const [cx, cy] = centreOfFootprint(room)
      const [wx, wy] = toWorld(room, cx, cy)
      const at = new DOMPoint(wx, wy).matrixTransform(screen)
      const item = entry.getBoundingClientRect()
      measured.push({
        key: `${line.from}-${line.to}`,
        x1: at.x - frame.left,
        y1: at.y - frame.top,
        x2: item.right - frame.left,
        y2: item.top + item.height / 2 - frame.top,
      })
    }
    setSegments(measured)
  }, [lines, rooms, svg, box, camera])

  if (segments.length === 0) return null
  return (
    <svg className="tray-lines" aria-hidden="true">
      {segments.map((segment) => (
        <line
          key={segment.key}
          data-tray-line={segment.key}
          x1={segment.x1}
          y1={segment.y1}
          x2={segment.x2}
          y2={segment.y2}
        />
      ))}
    </svg>
  )
}
