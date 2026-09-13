import {
  atRest,
  settle,
  SPREAD_ROUNDS,
  spreadLayout,
  squaredLie,
  step,
  type Body,
  type Bound,
  type LayoutConfig,
  type Position,
  type SimulationState,
} from '../../bubbles'
import type { Commit } from '../../model'

/** Where the next frame is asked for: the browser's own, or a fake one a test drives by hand. */
export type Frames = {
  readonly request: (run: () => void) => number
  readonly cancel: (handle: number) => void
}

export const browserFrames: Frames = {
  request: (run) => requestAnimationFrame(run),
  cancel: (handle) => cancelAnimationFrame(handle),
}

/** What a drag leaves behind, told where the bubble came to rest once the cloud has stopped. */
export type Landing = (rest: Position) => void

/**
 * The bubble under the hand: where the pointer has it, whether the person was already holding
 * that room in place, where it stood when the drag began, and where everything else stood then,
 * which is what bounds the settle that follows.
 */
type Hand = {
  readonly id: string
  readonly at: Position
  readonly held: boolean
  readonly start: Position
  readonly from: readonly Position[]
}

type RunParts = {
  readonly frames: Frames
  readonly state: SimulationState
  /** The layout as the weights have it at this moment. */
  readonly layout: () => LayoutConfig
  readonly report: (bodies: readonly Body[], commit: Commit) => void
  readonly watch: (moving: boolean) => void
}

type Run = {
  /** A new picture, because the rooms, the links or the storeys changed. */
  readonly begin: (state: SimulationState) => void
  /** Something outside the picture changed the pulls, such as a weight: settle again under them. */
  readonly look: () => void
  /** A bubble under the hand: it goes where the pointer is and the rest answer in the same frame. */
  readonly hold: (id: string, at: Position) => void
  /** The hand lets go; the run carries on to rest and the landing is recorded there. */
  readonly release: (landing: Landing | null) => void
  readonly spread: () => void
  readonly spreading: () => boolean
  /** Straight to rest, for a person in a hurry and for a test that cannot wait for frames. */
  readonly settleNow: () => void
  readonly stop: () => void
}

/**
 * The settle as it runs under the tab: a frame is asked for only while a settle is under way, so
 * a picture at rest costs nothing, and a whole run previews and records one step when it stops.
 * A settle is a fixed number of rounds, and a drag bounds the one that follows it.
 */
export function createRun(parts: RunParts): Run {
  let state = parts.state
  let handle = 0
  let hand: Hand | null = null
  /** The bound the last drag left on the settle after it, until that settle has run its rounds. */
  let bound: Bound | null = null
  let landing: { readonly id: string; readonly tell: Landing } | null = null
  let spreadingFrames = 0
  /** Whether anything has moved since the run last came to rest, so a still picture records no step. */
  let stepped = false
  let moving = false

  const announce = (next: boolean): void => {
    if (next === moving) return
    moving = next
    parts.watch(next)
  }

  /** The bubbles whose place the store is told about: the free ones, and the one under the hand. */
  const loose = (next: SimulationState): readonly Body[] =>
    next.bodies.filter((body) => !body.pinned || body.id === hand?.id)

  /**
   * The hand is a pin for as long as it is down: the rounds move everything but the bubble held.
   * A corridor is the exception: its near end is a wall on its anchor, so the hand turns it about
   * that end rather than carrying it, and the round lays it along the way the hand points.
   */
  const underHand = (): SimulationState => {
    const held = hand
    if (!held) return state
    const corridor = state.corridors.find(
      (each) => state.bodies[each.body]?.id === held.id && each.anchor !== undefined,
    )
    const anchor = corridor?.anchor === undefined ? undefined : state.bodies[corridor.anchor]
    return {
      ...state,
      bodies: state.bodies.map((body) =>
        body.id !== held.id
          ? body
          : anchor
            ? { ...body, angle: Math.atan2(held.at.y - anchor.y, held.at.x - anchor.x) }
            : { ...body, x: held.at.x, y: held.at.y, pinned: true },
      ),
    }
  }

  /** That pin is the hand's and not the room's, so it comes off again the moment the step is over. */
  const letGo = (next: SimulationState): SimulationState => {
    const held = hand
    if (!held || held.held) return next
    return {
      ...next,
      bodies: next.bodies.map((body) => (body.id === held.id ? { ...body, pinned: false } : body)),
    }
  }

  const boundOf = (): Bound | undefined => {
    if (!hand) return bound ?? undefined
    const moved = Math.hypot(hand.at.x - hand.start.x, hand.at.y - hand.start.y)
    return { id: hand.id, moved, from: hand.from }
  }

  const placeOf = (next: SimulationState, id: string): Position | null => {
    const body = next.bodies.find((each) => each.id === id)
    return body ? { x: body.x, y: body.y } : null
  }

  /**
   * A run that nobody asked for is a consequence of an edit, not an edit, so it moves the bubbles
   * as a preview and records nothing; what the person did ask for — a drag let go, Settle now —
   * records, and the previews since fold into that one step.
   */
  function finish(next: SimulationState, record: boolean): void {
    const land = landing
    landing = null
    if (stepped) parts.report(loose(next), record && !land ? 'commit' : 'preview')
    stepped = false
    if (!land) return
    const rest = placeOf(next, land.id)
    if (rest) land.tell(rest)
  }

  function advance(): boolean {
    const base = parts.layout()
    const config = spreadingFrames > 0 ? spreadLayout(base) : base
    let next = letGo(step(underHand(), config, boundOf()))
    if (spreadingFrames > 0) {
      spreadingFrames -= 1
      // The cloud opened, the settle after it starts from its first round.
      if (spreadingFrames === 0) next = { ...next, round: 0 }
    }
    if (next.bodies.some((body, index) => moved(body, state.bodies[index]))) stepped = true
    state = next
    const resting = !hand && spreadingFrames === 0 && next.round >= config.rounds
    if (resting) {
      bound = null
      finish(state, false)
      return false
    }
    if (stepped || hand) parts.report(loose(next), 'preview')
    return true
  }

  function tick(): void {
    handle = 0
    if (advance()) handle = parts.frames.request(tick)
    else announce(false)
  }

  /** A settle from its first round: the picture has something new to answer. */
  function wake(): void {
    state = { ...state, round: 0 }
    if (handle !== 0) return
    announce(true)
    handle = parts.frames.request(tick)
  }

  function cancel(): void {
    if (handle !== 0) parts.frames.cancel(handle)
    handle = 0
  }

  return {
    begin(next) {
      state = next
      bound = null
      // A picture left at rest opens at rest: it is asked whether it holds still with the pulls
      // off, and only a picture that would move is settled.
      if (atRest(state, parts.layout())) {
        announce(false)
        return
      }
      wake()
    },
    look() {
      // The pulls changed: the picture is asked whether they move it now, and settled if they do.
      if (atRest(state, parts.layout(), true)) {
        announce(false)
        return
      }
      wake()
    },
    hold(id, at) {
      // A second drag closes the first: the bubble it left is recorded where it lies rather than later.
      if (landing) finish(state, false)
      if (hand?.id === id) hand = { ...hand, at }
      else {
        const start = placeOf(state, id) ?? at
        hand = {
          id,
          at,
          held: heldInPlace(state, id),
          start,
          from: state.bodies.map((body) => ({ x: body.x, y: body.y })),
        }
      }
      wake()
    },
    release(next) {
      const held = hand
      hand = null
      bound = held ? (boundOf() ?? null) : null
      if (held) {
        bound = {
          id: held.id,
          moved: Math.hypot(held.at.x - held.start.x, held.at.y - held.start.y),
          from: held.from,
        }
        // A corridor the hand turned is set on one of the plot's two ways when the hand comes off.
        state = {
          ...state,
          bodies: state.bodies.map((body) =>
            body.id === held.id && body.half > 0
              ? { ...body, angle: squaredLie(state.ground, body.angle) }
              : body,
          ),
        }
      }
      landing = next && held ? { id: held.id, tell: next } : null
      wake()
    },
    spread() {
      spreadingFrames = SPREAD_ROUNDS
      wake()
    },
    spreading: () => spreadingFrames > 0,
    settleNow() {
      cancel()
      spreadingFrames = 0
      // Settle now is the person's own asking, so nothing bounds it.
      bound = null
      const out = settle(underHand(), parts.layout())
      state = letGo(out.state)
      stepped = true
      finish(state, true)
      announce(false)
    },
    stop() {
      cancel()
      finish(state, false)
      announce(false)
    },
  }
}

/** Whether a bubble really went anywhere, in metres; below this it stood still. */
const A_HAIR = 1e-4

function moved(body: Body, was: Body | undefined): boolean {
  return (
    was !== undefined &&
    (Math.abs(body.x - was.x) > A_HAIR ||
      Math.abs(body.y - was.y) > A_HAIR ||
      Math.abs(body.angle - was.angle) > A_HAIR)
  )
}

function heldInPlace(state: SimulationState, id: string): boolean {
  return state.bodies.find((body) => body.id === id)?.pinned ?? false
}
