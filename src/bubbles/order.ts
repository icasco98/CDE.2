/**
 * The order of the rooms inside each row of one storey's column, chosen so fewer lines cross: a few
 * sweeps of the barycentre rule (each room placed at the mean place of the rooms it is joined to),
 * ties broken by program order, and the order with the fewest crossings kept, then the shortest
 * lines, the program's own when nothing beats it. Nothing here is random, so the same program orders
 * the same way twice.
 */

type Point = { readonly x: number; readonly y: number }

/** Two sweeps down the rows and two back up: enough for a house, and a fixed amount of work. */
const SWEEPS = 4

/** Where the room at `index` of a row of `count` stands, the column's own frame. */
type Place<K> = (row: K, index: number, count: number) => Point

type Rows<K, R> = ReadonlyMap<K, readonly R[]>

function positions<K, R extends { readonly id: string }>(
  rows: Rows<K, R>,
  place: Place<K>,
): Map<string, Point> {
  const at = new Map<string, Point>()
  for (const [key, row] of rows)
    for (const [index, room] of row.entries()) at.set(room.id, place(key, index, row.length))
  return at
}

/** Which side of the line through `a` and `b` the point `c` is on: the sign of the cross product. */
function turn(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
}

/** How many pairs of straight segments cross, not counting two that meet at an end they share. */
export function crossings(segments: readonly (readonly [Point, Point])[]): number {
  let count = 0
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i]!
    for (let j = i + 1; j < segments.length; j++) {
      const [c, d] = segments[j]!
      const shared =
        (a.x === c.x && a.y === c.y) ||
        (a.x === d.x && a.y === d.y) ||
        (b.x === c.x && b.y === c.y) ||
        (b.x === d.x && b.y === d.y)
      if (shared) continue
      if (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) count += 1
    }
  }
  return count
}

/**
 * Rows reordered to uncross the `links` between them. A link to an id not in any row ends at
 * `fixed`'s point for it (the outside), and `side` keeps a room at the left (-1) or right (1) end of
 * its row whatever its neighbours say.
 */
export function uncross<K, R extends { readonly id: string }>(
  rows: Rows<K, R>,
  links: readonly (readonly [string, string])[],
  place: Place<K>,
  fixed: ReadonlyMap<string, Point>,
  side: (room: R) => number,
): Rows<K, R> {
  const program = new Map<string, number>()
  for (const row of rows.values()) for (const room of row) program.set(room.id, program.size)
  const neighbours = new Map<string, string[]>()
  for (const [a, b] of links) {
    if (a === b) continue
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  /** Crossings first; the lines' total length only between orders that cross as often. */
  const cost = (order: Rows<K, R>): readonly [number, number] => {
    const at = positions(order, place)
    const where = (id: string) => at.get(id) ?? fixed.get(id)
    const segments: [Point, Point][] = []
    let length = 0
    for (const [a, b] of links) {
      const from = where(a)
      const to = where(b)
      if (!from || !to || a === b) continue
      segments.push([from, to])
      length += Math.hypot(to.x - from.x, to.y - from.y)
    }
    return [crossings(segments), length]
  }
  const keys = [...rows.keys()]
  let best = rows
  let lowest = cost(rows)
  let current = rows
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (const key of sweep % 2 === 0 ? keys : [...keys].reverse()) {
      const at = positions(current, place)
      const row = current.get(key)!
      const centre = new Map<string, number>()
      for (const room of row) {
        const xs = (neighbours.get(room.id) ?? []).flatMap((id) => {
          const point = at.get(id) ?? fixed.get(id)
          return point ? [point.x] : []
        })
        // A room joined to nothing in view keeps the place it has.
        centre.set(
          room.id,
          xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : at.get(room.id)!.x,
        )
      }
      const sorted = [...row].sort(
        (one, other) =>
          side(one) - side(other) ||
          centre.get(one.id)! - centre.get(other.id)! ||
          program.get(one.id)! - program.get(other.id)!,
      )
      current = new Map(current).set(key, sorted)
    }
    const [crossed, length] = cost(current)
    // A little slack, so rounding never picks between two orders of one length.
    if (crossed < lowest[0] || (crossed === lowest[0] && length < lowest[1] - 1e-3)) {
      best = current
      lowest = [crossed, length]
    }
  }
  return best
}
