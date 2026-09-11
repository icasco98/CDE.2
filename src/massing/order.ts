import { depthOf, type View } from './projection'
import type { Face } from './solids'

/**
 * The painter's rule: a face is drawn before every face nearer the viewer than it is, measured by
 * the mean depth of its corners; and a prism's top is drawn after its own walls, so a roof is never
 * covered by the wall it sits on. Enough for the convex-ish masses a villa makes; a mass that wraps
 * around itself would want the faces cut against one another, which decision 16 does not ask for.
 */
export function orderFaces(faces: readonly Face[], view: View): readonly Face[] {
  const ranked = faces.map((face, at) => ({ face, at, depth: meanDepth(face, view) }))
  ranked.sort((a, b) => b.depth - a.depth || a.at - b.at)

  const lastWall = new Map<string, number>()
  ranked.forEach((entry, at) => {
    if (entry.face.kind === 'side') lastWall.set(entry.face.roomId, at)
  })

  const held = new Map<string, Face[]>()
  for (const entry of ranked) {
    if (entry.face.kind !== 'top' || !lastWall.has(entry.face.roomId)) continue
    const waiting = held.get(entry.face.roomId) ?? []
    waiting.push(entry.face)
    held.set(entry.face.roomId, waiting)
  }

  const drawn: Face[] = []
  ranked.forEach((entry, at) => {
    if (entry.face.kind === 'top' && held.has(entry.face.roomId)) return
    drawn.push(entry.face)
    if (lastWall.get(entry.face.roomId) !== at) return
    drawn.push(...(held.get(entry.face.roomId) ?? []))
  })
  return drawn
}

export type RoomFaces = { readonly roomId: string; readonly faces: readonly Face[] }

/**
 * The same order, gathered into one group per room, each room standing where its nearest face falls,
 * so the drawing keeps a room in one `<g>` and still puts the nearest room last.
 */
export function roomsInOrder(faces: readonly Face[], view: View): readonly RoomFaces[] {
  const ordered = orderFaces(faces, view)
  const gathered = new Map<string, Face[]>()
  const nearest = new Map<string, number>()
  ordered.forEach((face, at) => {
    const held = gathered.get(face.roomId) ?? []
    held.push(face)
    gathered.set(face.roomId, held)
    nearest.set(face.roomId, at)
  })
  return [...gathered.entries()]
    .sort((a, b) => (nearest.get(a[0]) ?? 0) - (nearest.get(b[0]) ?? 0))
    .map(([roomId, held]) => ({ roomId, faces: held }))
}

function meanDepth(face: Face, view: View): number {
  if (face.corners.length === 0) return 0
  let sum = 0
  for (const corner of face.corners) sum += depthOf(corner, view)
  return sum / face.corners.length
}
