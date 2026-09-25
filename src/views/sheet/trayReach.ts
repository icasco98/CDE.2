/**
 * Where each of Check's lines to a room still in the program ends, in the pixels of the box both the
 * sheet and the program stand in: at the room's block when the program's list shows it, else at a
 * tag on the list's top or bottom edge that points the way to it.
 */

export type TrayReach = {
  readonly key: string
  /** The room in the program the line goes to. */
  readonly to: string
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  /** Which way the room lies when the list is scrolled past it; absent while its block shows. */
  readonly off?: 'up' | 'down'
  /** The tag's offsets from the box's right and top edges, while `off` is set. */
  readonly tag?: { readonly right: number; readonly top: number }
}

/** A tag's height and the gap between two stacked on one edge, in pixels. */
export const TAG_HEIGHT = 20
const TAG_GAP = 3
const TAG_INSET = 6

export function measureTray<R extends { readonly id: string }>(
  lines: readonly { readonly from: string; readonly to: string }[],
  rooms: readonly R[],
  centreOf: (room: R) => readonly [number, number],
  svg: SVGSVGElement,
  box: HTMLElement,
): readonly TrayReach[] {
  const screen = svg.getScreenCTM()
  const tray = box.querySelector('.tray')
  if (!screen || !tray || lines.length === 0) return []
  const frame = box.getBoundingClientRect()
  const list = tray.getBoundingClientRect()
  const tags = new Map<string, { off: 'up' | 'down'; index: number }>()
  const counts = { up: 0, down: 0 }
  const measured: TrayReach[] = []
  for (const line of lines) {
    const room = rooms.find((each) => each.id === line.from)
    const entry = tray.querySelector(`.item[data-room="${line.to}"]`)
    if (!room || !entry) continue
    const [wx, wy] = centreOf(room)
    const at = new DOMPoint(wx, wy).matrixTransform(screen)
    const item = entry.getBoundingClientRect()
    const middle = item.top + item.height / 2
    const base = {
      key: `${line.from}-${line.to}`,
      to: line.to,
      x1: at.x - frame.left,
      y1: at.y - frame.top,
    }
    if (middle >= list.top && middle <= list.bottom) {
      measured.push({ ...base, x2: item.right - frame.left, y2: middle - frame.top })
      continue
    }
    const off = middle < list.top ? 'up' : 'down'
    // One tag a room however many lines reach it, stacked inward from the edge it stands on.
    let tag = tags.get(line.to)
    if (!tag) {
      tag = { off, index: counts[off]++ }
      tags.set(line.to, tag)
    }
    const step = tag.index * (TAG_HEIGHT + TAG_GAP)
    const top =
      off === 'up' ? list.top + TAG_INSET + step : list.bottom - TAG_INSET - TAG_HEIGHT - step
    const right = list.right - TAG_INSET - frame.left
    measured.push({
      ...base,
      x2: right,
      y2: top + TAG_HEIGHT / 2 - frame.top,
      off,
      tag: { right: frame.width - right, top: top - frame.top },
    })
  }
  return measured
}

/** The list scrolled so a room's block stands in its middle, smoothly. */
export function scrollTrayTo(box: HTMLElement, id: string): void {
  const tray = box.querySelector('.tray')
  const entry = tray?.querySelector(`.item[data-room="${id}"]`)
  if (!tray || !entry) return
  const list = tray.getBoundingClientRect()
  const item = entry.getBoundingClientRect()
  const top = tray.scrollTop + item.top - list.top - (list.height - item.height) / 2
  tray.scrollTo({ top, behavior: 'smooth' })
}
