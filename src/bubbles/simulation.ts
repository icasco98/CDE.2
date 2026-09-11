export type Position = { readonly x: number; readonly y: number }

/** A room as the bubble solver needs it: the model's room without the parts the picture ignores. */
export type SimulationRoom = {
  readonly id: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly pinned: boolean
  readonly bubble?: Position
  /** The room-type table's privacy tier, where the program has one; without it the room is unaffected. */
  readonly tier?: string
}

/** An edge reduced to the pair it joins; ids that name no room, EXTERIOR among them, are dropped. */
export type SimulationEdge = { readonly a: string; readonly b: string }

export type LayoutConfig = {
  readonly springStiffness: number
  readonly restGap: number
  readonly repulsion: number
  /** What the repulsion between two rooms of different privacy tiers is multiplied by. */
  readonly tierRepulsion: number
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
  /** One: the tiers part no harder than anything else until the user-requirements weight says so. */
  tierRepulsion: 1,
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

/** A second of simulation time: how long a Spread holds before the cloud is let settle again. */
export const SPREAD_SECONDS = 1

/**
 * How many steps running the picture must read still before it is called at rest: a contact takes
 * all the speed out of a bubble for the one frame it is corrected in, while the forces behind it
 * are still pressing, so a single quiet frame is not enough to stop on.
 */
export const STILL_FRAMES = 3

/**
 * The user-requirements weight on the simulation: a house whose owner's own wishes count for more
 * gathers what belongs together harder and parts the public rooms from the private ones harder.
 */
export function layoutFor(weight: number): LayoutConfig {
  const w = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0.5
  return {
    ...defaultLayout,
    springStiffness: defaultLayout.springStiffness * (0.5 + w),
    tierRepulsion: 1 + w,
  }
}

/**
 * Spread is the same layout with the repulsion tripled. Repulsion here is two things, the push and
 * the air two bubbles keep, and tripling only the push would move nothing in a cloud already packed
 * rim to rim, so the gap goes with it and the cloud opens out before it is let settle again.
 */
export function spreadLayout(base: LayoutConfig): LayoutConfig {
  return {
    ...base,
    repulsion: base.repulsion * 3,
    spread: base.spread * 3,
    restGap: base.restGap * 3,
  }
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
  readonly tier?: string
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
      ...(room.tier === undefined ? {} : { tier: room.tier }),
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

/**
 * A pair at a time, so a bubble wedged between two others is only cleared of both after a few goes
 * round; eight is past the worst a villa's program reaches and bounds the frame either way.
 */
const CORRECTION_PASSES = 8

/** An overlap this small is a rounding error, not a bubble resting on another. */
const CLEARED = 1e-9

/** The share of a correction is by area, and π cancels in the ratio, so the radius squared stands for it. */
function areaOf(body: Body): number {
  return body.radius * body.radius
}

/** How much of a correction the first body takes: none when it is pinned, all when the other is. */
function shareOf(a: Body, b: Body): number {
  return a.pinned ? 0 : b.pinned ? 1 : areaOf(b) / (areaOf(a) + areaOf(b))
}

/** A room with no tier, or an exempt one such as a bathroom, stands outside the privacy gradient. */
function tiersApart(a: Body, b: Body): boolean {
  if (!a.tier || !b.tier || a.tier === 'exempt' || b.tier === 'exempt') return false
  return a.tier !== b.tier
}

/**
 * How far apart two bubbles are kept: their radii and the rest gap, and between two different
 * privacy tiers the gap as well as the push is scaled, because in a cloud packed rim to rim a
 * stronger push alone moves nothing and only the air kept shows on the sheet.
 */
function clearOf(a: Body, b: Body, config: LayoutConfig): number {
  const factor = tiersApart(a, b) ? config.tierRepulsion : 1
  return a.radius + b.radius + config.restGap * factor
}

/**
 * The positional correction, after the forces have moved everything: two bodies nearer than the sum
 * of their radii and the rest gap are put back to that distance along the line between their
 * centres, the move split by inverse area so the larger room gives way less. A pinned body takes
 * none of it, because pinned is the person's hand; two pinned bodies left on each other stay.
 */
function separate(work: readonly Work[], config: LayoutConfig): void {
  const from = work.map((w) => ({ x: w.x, y: w.y }))
  for (let pass = 0; pass < CORRECTION_PASSES; pass++) {
    let clear = true
    for (let i = 0; i < work.length; i++) {
      const a = work[i]
      if (!a) continue
      for (let j = i + 1; j < work.length; j++) {
        const b = work[j]
        if (!b || (a.body.pinned && b.body.pinned)) continue
        const [ux, uy, distance] = apart(b.x - a.x, b.y - a.y, i + j)
        const overlap = clearOf(a.body, b.body, config) - distance
        if (overlap <= CLEARED) continue
        clear = false
        const share = shareOf(a.body, b.body)
        a.x -= ux * overlap * share
        a.y -= uy * overlap * share
        b.x += ux * overlap * (1 - share)
        b.y += uy * overlap * (1 - share)
      }
    }
    if (clear) break
  }
  // The correction is the last word on where a bubble went, so its speed is made to say the same:
  // a bubble the forces drove into its neighbour and the correction put back has not moved at all.
  for (const [index, w] of work.entries()) {
    const was = from[index]
    if (!was || w.body.pinned) continue
    w.vx += (w.x - was.x) / config.timeStep
    w.vy += (w.y - was.y) / config.timeStep
  }
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
      const clear = clearOf(a.body, b.body, config)
      const [ux, uy, distance] = apart(b.x - a.x, b.y - a.y, i + j)
      const overlap = clear - distance
      // A soft collision below contact, and a bounded inverse-square breeze above it that spreads the cloud.
      const push =
        (tiersApart(a.body, b.body) ? config.tierRepulsion : 1) *
        ((overlap > 0 ? config.repulsion * overlap : 0) +
          (config.spread * clear * clear) / Math.max(distance, clear) ** 2)
      a.fx -= push * ux
      a.fy -= push * uy
      b.fx += push * ux
      b.fy += push * uy
    }
  }

  const interval = config.timeStep
  for (const w of work) {
    if (w.body.pinned) continue
    const mass = massOf(w.body)
    const target = bandCentreOf(
      w.body.storey,
      w.body.storeysSpanned,
      state.storeys,
      state.bandHeight,
    )
    w.fy += config.bandPull * (target - w.y)
    w.fx += config.centrePull * -w.x
    w.vx = (w.vx + (w.fx / mass) * interval) * config.damping
    w.vy = (w.vy + (w.fy / mass) * interval) * config.damping
  }

  for (const w of work) {
    if (w.body.pinned) continue
    w.x += w.vx * interval
    w.y += w.vy * interval
  }

  separate(work, config)

  let energy = 0
  for (const w of work) energy += 0.5 * massOf(w.body) * (w.vx * w.vx + w.vy * w.vy)

  const bodies = work.map((w) =>
    w.body.pinned ? w.body : { ...w.body, x: w.x, y: w.y, vx: w.vx, vy: w.vy },
  )
  return { ...state, bodies, energy: energy / count }
}

export function settle(state: SimulationState, config: LayoutConfig = defaultLayout): Settlement {
  let current = state
  let still = 0
  for (let i = 1; i <= config.maxIterations; i++) {
    current = step(current, config)
    still = current.energy < config.energyThreshold ? still + 1 : 0
    if (still >= STILL_FRAMES) return { state: current, iterations: i, settled: true }
  }
  return { state: current, iterations: config.maxIterations, settled: false }
}
