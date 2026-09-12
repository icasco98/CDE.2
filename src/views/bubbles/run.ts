import {
  correctContacts,
  restWatch,
  settle,
  SPREAD_SECONDS,
  spreadLayout,
  step,
  STILL_FRAMES,
  type Body,
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

/** The bubble under the hand, and whether the person was already holding that room in place. */
type Hand = { readonly id: string; readonly at: Position; readonly held: boolean }

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
  /** Something outside the picture changed the forces, such as a weight: look again. */
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
 * The simulation as it runs under the tab: a frame is asked for only while something is moving, so
 * a picture at rest costs nothing, and a whole run previews and records one step when it stops.
 */
export function createRun(parts: RunParts): Run {
  let state = parts.state
  let handle = 0
  let hand: Hand | null = null
  let landing: { readonly id: string; readonly tell: Landing } | null = null
  let spreadingFrames = 0
  /** Whether the picture has come to rest, read the one way the whole tool reads it. */
  const watch = restWatch()
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

  /** The hand is a pin for as long as it is down: the forces move everything but the bubble held. */
  const underHand = (): SimulationState => {
    const held = hand
    if (!held) return state
    return {
      ...state,
      bodies: state.bodies.map((body) =>
        body.id === held.id
          ? { ...body, x: held.at.x, y: held.at.y, vx: 0, vy: 0, pinned: true }
          : body,
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
    const next = letGo(step(underHand(), config))
    state = next
    if (spreadingFrames > 0) spreadingFrames -= 1
    const stopped = watch.read(next.energy, config.energyThreshold)
    if (!watch.quiet()) stepped = true
    const resting = stopped && spreadingFrames === 0
    if (resting && !hand) {
      // Only when the picture has stopped: a link that has not closed is walked round to a free
      // wall and the cloud let settle again, and only then is the picture called at rest.
      const fixed = correctContacts(next, parts.layout())
      // Whatever the correction leaves is what the store is told, or the tab would be opened again
      // on the places the picture had before it and set off moving from them. A hair's breadth is
      // not a move: a picture already at rest is left alone and nothing is recorded.
      if (fixed.state.bodies.some((body, index) => moved(body, next.bodies[index]))) stepped = true
      state = fixed.state
      finish(state, false)
      return false
    }
    if (stepped || hand) parts.report(loose(next), 'preview')
    return !resting
  }

  function tick(): void {
    handle = 0
    if (advance()) handle = parts.frames.request(tick)
    else announce(false)
  }

  function wake(): void {
    watch.wake()
    if (handle !== 0) return
    announce(true)
    handle = parts.frames.request(tick)
  }

  /**
   * Looks before asking for a frame: the steps that would prove the picture still are taken here
   * and nothing is scheduled, so a project whose bubbles were left at rest opens at rest.
   */
  function look(): void {
    watch.wake()
    if (handle !== 0) return
    for (let taken = 0; taken < STILL_FRAMES; taken++)
      if (!advance()) {
        announce(false)
        return
      }
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
      look()
    },
    look,
    hold(id, at) {
      // A second drag closes the first: the bubble it left is recorded where it lies rather than later.
      if (landing) finish(state, false)
      hand = hand?.id === id ? { ...hand, at } : { id, at, held: heldInPlace(state, id) }
      wake()
    },
    release(next) {
      const held = hand
      hand = null
      landing = next && held ? { id: held.id, tell: next } : null
      wake()
    },
    spread() {
      spreadingFrames = Math.max(1, Math.round(SPREAD_SECONDS / parts.layout().timeStep))
      wake()
    },
    spreading: () => spreadingFrames > 0,
    settleNow() {
      cancel()
      spreadingFrames = 0
      const out = settle(underHand(), parts.layout())
      const fixed = correctContacts(out.state, parts.layout())
      if (out.iterations > STILL_FRAMES || fixed.corrected > 0) stepped = true
      state = letGo(fixed.state)
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
    was !== undefined && (Math.abs(body.x - was.x) > A_HAIR || Math.abs(body.y - was.y) > A_HAIR)
  )
}

function heldInPlace(state: SimulationState, id: string): boolean {
  return state.bodies.find((body) => body.id === id)?.pinned ?? false
}
