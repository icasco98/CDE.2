import { arcRun } from '../geometry'
import {
  EXTERIOR,
  type Edge,
  type Endpoint,
  type Project,
  type Room,
  type Violation,
} from './types'

// MODEL.md also states that footprints on one storey never overlap; that one is kept by the zoning
// gestures, which clamp a dragged room, and is not checked here.

function say(code: string, message: string): Violation {
  return { code, message }
}

/** The storeys a room stands on: one, or several when it is a stair. */
export function occupiedStoreys(room: Room): readonly number[] {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return Array.from({ length: span }, (_, i) => room.storey + i)
}

function standsOn(endpoint: Endpoint, storey: number, rooms: ReadonlyMap<string, Room>): boolean {
  if (endpoint === EXTERIOR) return true
  const room = rooms.get(endpoint)
  return room !== undefined && occupiedStoreys(room).includes(storey)
}

function roomIndex(project: Project): ReadonlyMap<string, Room> {
  return new Map(project.rooms.map((room) => [room.id, room]))
}

function pairKey(edge: Edge): string {
  const [first, second] = edge.a <= edge.b ? [edge.a, edge.b] : [edge.b, edge.a]
  return `${first}|${second}|${edge.storey}`
}

export function checkEdgeEndpoints(project: Project): readonly Violation[] {
  const rooms = roomIndex(project)
  return project.edges.flatMap((edge) =>
    [edge.a, edge.b]
      .filter((endpoint) => endpoint !== EXTERIOR && !rooms.has(endpoint))
      .map((endpoint) =>
        say('edge-endpoint-missing', `edge ${edge.id} names ${endpoint}, which is not a room`),
      ),
  )
}

export function checkEdgeStoreys(project: Project): readonly Violation[] {
  const rooms = roomIndex(project)
  return project.edges
    .filter(
      (edge) => !standsOn(edge.a, edge.storey, rooms) || !standsOn(edge.b, edge.storey, rooms),
    )
    .map((edge) =>
      say(
        'edge-storey',
        `edge ${edge.id} joins ${edge.a} and ${edge.b} on storey ${edge.storey}, which they do not both stand on`,
      ),
    )
}

export function checkEdgeUniqueness(project: Project): readonly Violation[] {
  const seen = new Set<string>()
  const violations: Violation[] = []
  for (const edge of project.edges) {
    const key = pairKey(edge)
    if (seen.has(key))
      violations.push(
        say(
          'edge-duplicate',
          `${edge.a} and ${edge.b} are already joined on storey ${edge.storey}`,
        ),
      )
    seen.add(key)
  }
  return violations
}

export function checkExteriorIsNotARoom(project: Project): readonly Violation[] {
  return project.rooms
    .filter((room) => room.id === EXTERIOR)
    .map(() => say('exterior-as-room', `${EXTERIOR} is the outside, never a room`))
}

export function checkMainDoor(project: Project): readonly Violation[] {
  const mainDoors = project.edges.filter((edge) => edge.kind === 'main-door')
  const violations: Violation[] = []
  if (mainDoors.length > 1)
    violations.push(say('main-door-count', 'a project has at most one main door'))
  for (const edge of mainDoors)
    if (edge.a !== EXTERIOR && edge.b !== EXTERIOR)
      violations.push(
        say('main-door-outside', `main door ${edge.id} does not come from ${EXTERIOR}`),
      )
  return violations
}

export function checkFootprints(project: Project): readonly Violation[] {
  return project.rooms
    .filter((room) => {
      const footprint = room.footprint
      if (footprint === undefined) return false
      return (
        footprint.polygon.length < 3 ||
        !Number.isFinite(footprint.rotation) ||
        footprint.polygon.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))
      )
    })
    .map((room) => say('footprint-half', `room ${room.id} is neither placed nor unplaced`))
}

/** How far a vertex may sit off the circle its arc names, in metres. */
const ARC_TOLERANCE = 1e-6

/**
 * An arc has to name vertices the polygon has, and those vertices have to lie on the circle it
 * names: the polygon is what every calculation reads, so an arc that does not match it would
 * make the exact area and the exported curve disagree with the room on the sheet.
 */
export function checkArcs(project: Project): readonly Violation[] {
  const violations: Violation[] = []
  for (const room of project.rooms) {
    const footprint = room.footprint
    if (!footprint?.arcs) continue
    const vertices = footprint.polygon.length
    for (const arc of footprint.arcs) {
      const named = [arc.from, arc.to].every(
        (index) => Number.isInteger(index) && index >= 0 && index < vertices,
      )
      if (!named || !Number.isFinite(arc.radius) || arc.radius <= 0) {
        violations.push(
          say('arc-range', `room ${room.id} has an arc on vertices its polygon does not have`),
        )
        continue
      }
      const off = arcRun(arc, vertices).some((index) => {
        const at = footprint.polygon[index]
        if (!at) return true
        const reach = Math.hypot(at[0] - arc.centre[0], at[1] - arc.centre[1])
        return Math.abs(reach - arc.radius) > ARC_TOLERANCE
      })
      if (off)
        violations.push(
          say('arc-off-circle', `room ${room.id} has an arc whose vertices are off its circle`),
        )
    }
  }
  return violations
}

export function checkRoomStoreys(project: Project): readonly Violation[] {
  const violations: Violation[] = []
  for (const room of project.rooms) {
    if (room.storeysSpanned < 1)
      violations.push(say('storeys-spanned', `room ${room.id} spans fewer than one storey`))
    if (room.storey < 0 || room.storey + Math.max(1, room.storeysSpanned) > project.storeys)
      violations.push(
        say(
          'storey-range',
          `room ${room.id} stands outside the project's ${project.storeys} storeys`,
        ),
      )
  }
  return violations
}

export function checkHeights(project: Project): readonly Violation[] {
  const { heights, storeys } = project
  if (heights.length !== storeys)
    return [
      say(
        'heights-count',
        `the project has ${storeys} storeys and ${heights.length} heights, one is wanted per storey`,
      ),
    ]
  return heights
    .filter((height) => !Number.isFinite(height) || height <= 0)
    .map(() => say('height-size', 'a storey height is a positive number of metres'))
}

const checks = [
  checkEdgeEndpoints,
  checkEdgeStoreys,
  checkEdgeUniqueness,
  checkExteriorIsNotARoom,
  checkMainDoor,
  checkFootprints,
  checkArcs,
  checkRoomStoreys,
  checkHeights,
]

export function checkProject(project: Project): readonly Violation[] {
  return checks.flatMap((check) => check(project))
}
