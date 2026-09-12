import { EXTERIOR, type EdgeKind, type Endpoint } from '../model'
import { defaultConnections, type DefaultConnection } from './defaultConnections'

/** A room as the table reads one: its kind and the storeys it stands on, never its bubble or footprint. */
export type ConnectionRoom = {
  readonly id: string
  readonly type: string
  readonly storey: number
  readonly storeysSpanned: number
}

/** An edge as the table reads one: the pair it joins, on which storey, and whether it is the front door. */
export type ConnectionEdge = {
  readonly a: Endpoint
  readonly b: Endpoint
  readonly kind: EdgeKind
  readonly storey: number
}

/** A connection the table implies and the graph does not hold. `rowId` names the row that asked. */
export type ImpliedConnection = {
  readonly a: Endpoint
  readonly b: Endpoint
  readonly kind: EdgeKind
  readonly storey: number
  readonly rowId: string
}

function occupiedStoreys(room: ConnectionRoom): readonly number[] {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return Array.from({ length: span }, (_, i) => room.storey + i)
}

/**
 * The storey the edge would land on, or nothing when the two never meet. `undefined` stands for the
 * outside, which is on every storey, so it meets a room on the lowest one that room stands on.
 */
function sharedStorey(
  a: ConnectionRoom | undefined,
  b: ConnectionRoom | undefined,
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
 * Every default connection these rooms imply that the graph does not hold yet, in the table's order.
 * Endpoints are checked to share a storey exactly as `connect` checks them, so a connection made
 * from this list is never refused.
 */
export function impliedConnections(
  rooms: readonly ConnectionRoom[],
  edges: readonly ConnectionEdge[],
): readonly ImpliedConnection[] {
  const held = new Set(edges.map((edge) => pairKey(edge.a, edge.b, edge.storey)))
  let frontDoor = edges.some((edge) => edge.kind === 'main-door')
  /** Rooms already taken as the served side of a one-to-one row; a room is served by one row only. */
  const served = new Set<string>()
  const implied: ImpliedConnection[] = []

  const offer = (
    row: DefaultConnection,
    from: ConnectionRoom | undefined,
    to: ConnectionRoom | undefined,
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

  const roomsOfKind = (kind: string): readonly (ConnectionRoom | undefined)[] =>
    kind === EXTERIOR ? [undefined] : rooms.filter((room) => room.type === kind)

  for (const row of defaultConnections) {
    if (row.pairing === 'each') {
      for (const from of roomsOfKind(row.from))
        for (const to of roomsOfKind(row.to)) offer(row, from, to)
      continue
    }
    const takenByRow = new Set<string>()
    for (const to of roomsOfKind(row.to)) {
      if (!to || served.has(to.id)) continue
      const before = rooms.slice(0, rooms.indexOf(to))
      let from: ConnectionRoom | undefined
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
