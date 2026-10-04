import { EXTERIOR, type ConnectionKind, type Endpoint } from '../model'
import { defaultConnections, type DefaultConnection } from './defaultConnections'

/** A zone as the table reads one: its kind and the storeys it stands on, never its bubble or footprint. */
export type ConnectionZone = {
  readonly id: string
  readonly type: string
  readonly storey: number
  readonly storeysSpanned: number
}

/** A connection as the table reads one: the pair it joins, on which storey, and whether it is the front door. */
export type HeldConnection = {
  readonly a: Endpoint
  readonly b: Endpoint
  readonly kind: ConnectionKind
  readonly storey: number
}

/** A connection the table implies and the graph does not hold. `rowId` names the row that asked. */
export type ImpliedConnection = {
  readonly a: Endpoint
  readonly b: Endpoint
  readonly kind: ConnectionKind
  readonly storey: number
  readonly rowId: string
}

function occupiedStoreys(zone: ConnectionZone): readonly number[] {
  const span = Math.max(1, Math.trunc(zone.storeysSpanned))
  return Array.from({ length: span }, (_, i) => zone.storey + i)
}

/**
 * The storey the connection would land on, or nothing when the two never meet. `undefined` stands for the
 * outside, which is on every storey, so it meets a zone on the lowest one that zone stands on.
 */
function sharedStorey(
  a: ConnectionZone | undefined,
  b: ConnectionZone | undefined,
): number | undefined {
  if (!a) return b?.storey
  if (!b) return a.storey
  const onB = occupiedStoreys(b)
  return occupiedStoreys(a).find((storey) => onB.includes(storey))
}

function pairKey(a: Endpoint, b: Endpoint, storey: number): string {
  return a <= b ? `${a}|${b}|${storey}` : `${b}|${a}|${storey}`
}

/**
 * Every default connection these zones imply that the graph does not hold yet, in the table's order.
 * Endpoints are checked to share a storey exactly as `connect` checks them, so a connection made
 * from this list is never refused.
 */
export function impliedConnections(
  zones: readonly ConnectionZone[],
  connections: readonly HeldConnection[],
): readonly ImpliedConnection[] {
  const held = new Set(
    connections.map((connection) => pairKey(connection.a, connection.b, connection.storey)),
  )
  let frontDoor = connections.some((connection) => connection.kind === 'main-door')
  /** Zones already taken as the served side of a one-to-one row; a zone is served by one row only. */
  const served = new Set<string>()
  const implied: ImpliedConnection[] = []

  const offer = (
    row: DefaultConnection,
    from: ConnectionZone | undefined,
    to: ConnectionZone | undefined,
  ): void => {
    const storey = sharedStorey(from, to)
    if (storey === undefined) return
    const a = from?.id ?? EXTERIOR
    const b = to?.id ?? EXTERIOR
    const key = pairKey(a, b, storey)
    if (held.has(key)) return
    if (row.kind === 'main-door') {
      if (frontDoor) return
      frontDoor = true
    }
    held.add(key)
    implied.push({ a, b, kind: row.kind, storey, rowId: row.id })
  }

  const zonesOfKind = (kind: string): readonly (ConnectionZone | undefined)[] =>
    kind === EXTERIOR ? [undefined] : zones.filter((zone) => zone.type === kind)

  for (const row of defaultConnections) {
    if (row.pairing === 'each') {
      for (const from of zonesOfKind(row.from))
        for (const to of zonesOfKind(row.to)) offer(row, from, to)
      continue
    }
    const takenByRow = new Set<string>()
    for (const to of zonesOfKind(row.to)) {
      if (!to || served.has(to.id)) continue
      const before = zones.slice(0, zones.indexOf(to))
      let from: ConnectionZone | undefined
      for (let i = before.length - 1; i >= 0; i--) {
        const candidate = before[i]
        if (candidate && candidate.type === row.from && !takenByRow.has(candidate.id)) {
          from = candidate
          break
        }
      }
      if (!from) continue
      takenByRow.add(from.id)
      served.add(to.id)
      offer(row, from, to)
    }
  }

  return implied
}
