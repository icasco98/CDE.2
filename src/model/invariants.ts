import { arcRun } from '../geometry'
import {
  EXTERIOR,
  type Connection,
  type Endpoint,
  type Project,
  type Zone,
  type Violation,
} from './types'

// MODEL.md also states that footprints on one storey never overlap; that one is kept by the zoning
// gestures, which clamp a dragged zone, and is not checked here.

function say(code: string, message: string): Violation {
  return { code, message }
}

/** The storeys a zone stands on: one, or several when it is a stair. */
export function occupiedStoreys(zone: Zone): readonly number[] {
  const span = Math.max(1, Math.trunc(zone.storeysSpanned))
  return Array.from({ length: span }, (_, i) => zone.storey + i)
}

function standsOn(endpoint: Endpoint, storey: number, zones: ReadonlyMap<string, Zone>): boolean {
  if (endpoint === EXTERIOR) return true
  const zone = zones.get(endpoint)
  return zone !== undefined && occupiedStoreys(zone).includes(storey)
}

function zoneIndex(project: Project): ReadonlyMap<string, Zone> {
  return new Map(project.zones.map((zone) => [zone.id, zone]))
}

function pairKey(connection: Connection): string {
  const [first, second] =
    connection.a <= connection.b ? [connection.a, connection.b] : [connection.b, connection.a]
  return `${first}|${second}|${connection.storey}`
}

export function checkConnectionEndpoints(project: Project): readonly Violation[] {
  const zones = zoneIndex(project)
  return project.connections.flatMap((connection) =>
    [connection.a, connection.b]
      .filter((endpoint) => endpoint !== EXTERIOR && !zones.has(endpoint))
      .map((endpoint) =>
        say(
          'connection-endpoint-missing',
          `connection ${connection.id} names ${endpoint}, which is not a zone`,
        ),
      ),
  )
}

export function checkConnectionStoreys(project: Project): readonly Violation[] {
  const zones = zoneIndex(project)
  return project.connections
    .filter(
      (connection) =>
        !standsOn(connection.a, connection.storey, zones) ||
        !standsOn(connection.b, connection.storey, zones),
    )
    .map((connection) =>
      say(
        'connection-storey',
        `connection ${connection.id} joins ${connection.a} and ${connection.b} on storey ${connection.storey}, which they do not both stand on`,
      ),
    )
}

export function checkConnectionUniqueness(project: Project): readonly Violation[] {
  const seen = new Set<string>()
  const violations: Violation[] = []
  for (const connection of project.connections) {
    const key = pairKey(connection)
    if (seen.has(key))
      violations.push(
        say(
          'connection-duplicate',
          `${connection.a} and ${connection.b} are already joined on storey ${connection.storey}`,
        ),
      )
    seen.add(key)
  }
  return violations
}

export function checkExteriorIsNotAZone(project: Project): readonly Violation[] {
  return project.zones
    .filter((zone) => zone.id === EXTERIOR)
    .map(() => say('exterior-as-zone', `${EXTERIOR} is the outside, never a zone`))
}

export function checkMainDoor(project: Project): readonly Violation[] {
  const mainDoors = project.connections.filter((connection) => connection.kind === 'main-door')
  const violations: Violation[] = []
  if (mainDoors.length > 1)
    violations.push(say('main-door-count', 'a project has at most one main door'))
  for (const connection of mainDoors)
    if (connection.a !== EXTERIOR && connection.b !== EXTERIOR)
      violations.push(
        say('main-door-outside', `main door ${connection.id} does not come from ${EXTERIOR}`),
      )
  return violations
}

export function checkFootprints(project: Project): readonly Violation[] {
  return project.zones
    .filter((zone) => {
      const footprint = zone.footprint
      if (footprint === undefined) return false
      return (
        footprint.polygon.length < 3 ||
        !Number.isFinite(footprint.rotation) ||
        footprint.polygon.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))
      )
    })
    .map((zone) => say('footprint-half', `zone ${zone.id} is neither placed nor unplaced`))
}

/** How far a vertex may sit off the circle its arc names, in metres. */
const ARC_TOLERANCE = 1e-6

/**
 * An arc has to name vertices the polygon has, and those vertices have to lie on the circle it
 * names: the polygon is what every calculation reads, so an arc that does not match it would
 * make the exact area and the exported curve disagree with the zone on the sheet.
 */
export function checkArcs(project: Project): readonly Violation[] {
  const violations: Violation[] = []
  for (const zone of project.zones) {
    const footprint = zone.footprint
    if (!footprint?.arcs) continue
    const vertices = footprint.polygon.length
    for (const arc of footprint.arcs) {
      const named = [arc.from, arc.to].every(
        (index) => Number.isInteger(index) && index >= 0 && index < vertices,
      )
      if (!named || !Number.isFinite(arc.radius) || arc.radius <= 0) {
        violations.push(
          say('arc-range', `zone ${zone.id} has an arc on vertices its polygon does not have`),
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
          say('arc-off-circle', `zone ${zone.id} has an arc whose vertices are off its circle`),
        )
    }
  }
  return violations
}

export function checkZoneStoreys(project: Project): readonly Violation[] {
  const violations: Violation[] = []
  for (const zone of project.zones) {
    if (zone.storeysSpanned < 1)
      violations.push(say('storeys-spanned', `zone ${zone.id} spans fewer than one storey`))
    if (zone.storey < 0 || zone.storey + Math.max(1, zone.storeysSpanned) > project.storeys)
      violations.push(
        say(
          'storey-range',
          `zone ${zone.id} stands outside the project's ${project.storeys} storeys`,
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

/** A keep-apart pair names two different zones, once per unordered pair, on any storeys. */
export function checkApart(project: Project): readonly Violation[] {
  const zones = zoneIndex(project)
  const seen = new Set<string>()
  const violations: Violation[] = []
  for (const pair of project.apart) {
    for (const end of [pair.a, pair.b])
      if (!zones.has(end))
        violations.push(
          say('apart-endpoint', `keep-apart ${pair.id} names ${end}, which is not a zone`),
        )
    if (pair.a === pair.b)
      violations.push(say('apart-self', 'a zone cannot be kept apart from itself'))
    const key = pair.a <= pair.b ? `${pair.a}|${pair.b}` : `${pair.b}|${pair.a}`
    if (seen.has(key))
      violations.push(say('apart-duplicate', 'those two zones are already kept apart'))
    seen.add(key)
  }
  return violations
}

/** A declined suggestion names two different ends, each a zone or the outside, once per pair. */
export function checkDeclined(project: Project): readonly Violation[] {
  const zones = zoneIndex(project)
  const seen = new Set<string>()
  const violations: Violation[] = []
  for (const pair of project.declined) {
    for (const end of [pair.a, pair.b])
      if (end !== EXTERIOR && !zones.has(end))
        violations.push(
          say('declined-endpoint', `a declined connection names ${end}, which is not a zone`),
        )
    if (pair.a === pair.b)
      violations.push(say('declined-self', 'a zone is not connected to itself'))
    const key = pair.a <= pair.b ? `${pair.a}|${pair.b}` : `${pair.b}|${pair.a}`
    if (seen.has(key))
      violations.push(say('declined-duplicate', 'that connection is already declined'))
    seen.add(key)
  }
  return violations
}

const checks = [
  checkConnectionEndpoints,
  checkConnectionStoreys,
  checkConnectionUniqueness,
  checkApart,
  checkDeclined,
  checkExteriorIsNotAZone,
  checkMainDoor,
  checkFootprints,
  checkArcs,
  checkZoneStoreys,
  checkHeights,
]

export function checkProject(project: Project): readonly Violation[] {
  return checks.flatMap((check) => check(project))
}
