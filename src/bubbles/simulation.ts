export type Position = { readonly x: number; readonly y: number }

/** A room as the bubble solver needs it: the model's room without the parts the picture ignores. */
export type SimulationRoom = {
  readonly id: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly pinned: boolean
  readonly bubble?: Position
}

/** An edge reduced to the pair it joins; ids that name no room, EXTERIOR among them, are dropped. */
export type SimulationEdge = { readonly a: string; readonly b: string }

export type LayoutConfig = {
  readonly springStiffness: number
  readonly restGap: number
  readonly repulsion: number
  readonly spread: number
  readonly bandPull: number
  readonly centrePull: number
  readonly damping: number
  readonly timeStep: number
  readonly energyThreshold: number
  readonly maxIterations: number
}

export const defaultLayout: LayoutConfig = {
  /** A wanted link pulls hard enough to gather a household and softly enough to lose to a collision. */
  springStiffness: 6,
  /** The air a bubble keeps around itself: both a link's rest length and how far collision parts two circles. */
  restGap: 1.5,
  /** Twenty times the springs, so a wanted link never buys itself an overlap. */
  repulsion: 120,
  /** A breeze, not a force: enough to open the cloud out, too weak to undo a link. */
  spread: 2,
  /** Storeys must read at a glance, so the vertical pull outranks the springs. */
  bandPull: 10,
  /** Holds the cloud on the sheet's middle without bunching it. */
  centrePull: 1.5,
  /** Near critical for a link on a room-sized mass: settles in a couple of seconds without ringing. */
  damping: 0.9,
  /** Short enough that the stiffest force, collision, stays stable in a semi-implicit step. */
  timeStep: 0.1,
  /** Mean kinetic energy per room; below it nothing moves far enough to see. */
  energyThreshold: 1e-3,
  /** Thirty rooms settle in about a hundred and sixty; the rest is headroom before the animation is cut off. */
  maxIterations: 600,
}

export type Body = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly radius: number
  readonly storey: number
  readonly storeysSpanned: number
  readonly pinned: boolean
}

export type Link = { readonly a: number; readonly b: number }

export type SimulationState = {
  readonly bodies: readonly Body[]
  readonly links: readonly Link[]
  readonly storeys: number
  readonly bandHeight: number
  /** Mean kinetic energy per room after the last step; Infinity before the first. */
  readonly energy: number
}

export type Band = { readonly top: number; readonly bottom: number; readonly centre: number }

export type Settlement = {
  readonly state: SimulationState
  readonly iterations: number
  readonly settled: boolean
}

export const DEFAULT_BAND_HEIGHT = 12

export function radiusOf(area: number): number {
  return Math.sqrt(Math.max(area, 0) / Math.PI)
}

/** Ground sits at the bottom of the sheet, so storey 0 is the last strip down. */
export function bandOf(storey: number, storeys: number, height = DEFAULT_BAND_HEIGHT): Band {
  const levels = Math.max(1, Math.trunc(storeys))
  const top = (levels - 1 - storey) * height
  return { top, bottom: top + height, centre: top + height / 2 }
}

function spanOf(storeysSpanned: number): number {
  return Math.max(1, Math.trunc(storeysSpanned))
}

/**
 * Wide enough for the largest room and a neighbour side by side, and for the busiest storey's
 * rooms to lie in a rough square, so nothing has to spill into the storey above.
 */
export function bandHeightFor(rooms: readonly SimulationRoom[]): number {
  let largest = 0
  const perStorey = new Map<number, number>()
  for (const room of rooms) {
    largest = Math.max(largest, radiusOf(room.targetArea))
    const base = room.storey
    perStorey.set(base, (perStorey.get(base) ?? 0) + Math.max(room.targetArea, 0))
  }
  let busiest = 0
  for (const total of perStorey.values()) busiest = Math.max(busiest, total)
  return Math.max(DEFAULT_BAND_HEIGHT, largest * 4, Math.sqrt(busiest) * 1.2)
}

/** FNV-1a over the room id: a fixed starting place per room, and never Math.random. */
function hash01(id: string, salt: number): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return ((hash >>> 0) % 100000) / 100000
}

/** The centre of a room's own band, or the boundary its bands share when it is a stair. */
function bandCentreOf(storey: number, span: number, storeys: number, bandHeight: number): number {
  return (Math.max(1, storeys) - storey - span / 2) * bandHeight
}

function spreadWidth(rooms: readonly SimulationRoom[]): number {
  let total = 0
  for (const room of rooms) total += Math.max(room.targetArea, 0)
  return Math.max(10, Math.sqrt(total) * 2)
}

export function createState(
  rooms: readonly SimulationRoom[],
  edges: readonly SimulationEdge[],
  storeys: number,
): SimulationState {
  const levels = Math.max(1, Math.trunc(storeys))
  const bandHeight = bandHeightFor(rooms)
  const width = spreadWidth(rooms)
  const bodies = rooms.map((room) => {
    const span = spanOf(room.storeysSpanned)
    const centre = bandCentreOf(room.storey, span, levels, bandHeight)
    return {
      id: room.id,
      x: room.bubble ? room.bubble.x : (hash01(room.id, 1) - 0.5) * width,
      y: room.bubble ? room.bubble.y : centre + (hash01(room.id, 2) - 0.5) * bandHeight * 0.6,
      vx: 0,
      vy: 0,
      radius: radiusOf(room.targetArea),
      storey: room.storey,
      storeysSpanned: span,
      pinned: room.pinned,
    }
  })
  const at = new Map(bodies.map((body, index) => [body.id, index]))
  const links: Link[] = []
  for (const edge of edges) {
    const a = at.get(edge.a)
    const b = at.get(edge.b)
    if (a === undefined || b === undefined || a === b) continue
    links.push({ a, b })
  }
  return { bodies, links, storeys: levels, bandHeight, energy: Infinity }
}

type Work = {
  readonly body: Body
  x: number
  y: number
  vx: number
  vy: number
  fx: number
  fy: number
}

/** Two circles exactly on top of each other need a direction to part along; their indices fix one. */
function apart(dx: number, dy: number, seed: number): readonly [number, number, number] {
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance > 1e-9) return [dx / distance, dy / distance, distance]
  return [Math.cos(seed), Math.sin(seed), 0]
}

function massOf(body: Body): number {
  return Math.max(body.radius, 0.5)
}

export function step(
  state: SimulationState,
  config: LayoutConfig = defaultLayout,
): SimulationState {
  const count = state.bodies.length
  if (count === 0) return { ...state, energy: 0 }
  const work: Work[] = state.bodies.map((body) => ({
    body,
    x: body.x,
    y: body.y,
    vx: body.vx,
    vy: body.vy,
    fx: 0,
    fy: 0,
  }))

  for (const link of state.links) {
    const a = work[link.a]
    const b = work[link.b]
    if (!a || !b) continue
    const [ux, uy, distance] = apart(b.x - a.x, b.y - a.y, link.a + link.b)
    const rest = a.body.radius + b.body.radius + config.restGap
    const pull = config.springStiffness * (distance - rest)
    a.fx += pull * ux
    a.fy += pull * uy
    b.fx -= pull * ux
    b.fy -= pull * uy
  }

  for (let i = 0; i < count; i++) {
    const a = work[i]
    if (!a) continue
    for (let j = i + 1; j < count; j++) {
      const b = work[j]
      if (!b) continue
      const clear = a.body.radius + b.body.radius + config.restGap
      const [ux, uy, distance] = apart(b.x - a.x, b.y - a.y, i + j)
      const overlap = clear - distance
      // A soft collision below contact, and a bounded inverse-square breeze above it that spreads the cloud.
      const push =
        (overlap > 0 ? config.repulsion * overlap : 0) +
        (config.spread * clear * clear) / Math.max(distance, clear) ** 2
      a.fx -= push * ux
      a.fy -= push * uy
      b.fx += push * ux
      b.fy += push * uy
    }
  }

  const interval = config.timeStep
  let energy = 0
  const bodies = work.map((w) => {
    if (w.body.pinned) return w.body
    const mass = massOf(w.body)
    const target = bandCentreOf(
      w.body.storey,
      w.body.storeysSpanned,
      state.storeys,
      state.bandHeight,
    )
    w.fy += config.bandPull * (target - w.y)
    w.fx += config.centrePull * -w.x
    const vx = (w.vx + (w.fx / mass) * interval) * config.damping
    const vy = (w.vy + (w.fy / mass) * interval) * config.damping
    energy += 0.5 * mass * (vx * vx + vy * vy)
    return { ...w.body, x: w.x + vx * interval, y: w.y + vy * interval, vx, vy }
  })

  return { ...state, bodies, energy: energy / count }
}

export function settle(state: SimulationState, config: LayoutConfig = defaultLayout): Settlement {
  let current = state
  for (let i = 1; i <= config.maxIterations; i++) {
    current = step(current, config)
    if (current.energy < config.energyThreshold)
      return { state: current, iterations: i, settled: true }
  }
  return { state: current, iterations: config.maxIterations, settled: false }
}
