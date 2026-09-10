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

const checks = [
  checkEdgeEndpoints,
  checkEdgeStoreys,
  checkEdgeUniqueness,
  checkExteriorIsNotARoom,
  checkMainDoor,
  checkFootprints,
  checkRoomStoreys,
]

export function checkProject(project: Project): readonly Violation[] {
  return checks.flatMap((check) => check(project))
}
