import {
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

/** What a drag leaves behind: told to the store once the cloud around the bubble has stopped. */
export type Landing = () => void

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
  readonly wake: () => void
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
  let hand: { readonly id: string; readonly at: Position } | null = null
  let landing: Landing | null = null
  let spreadingFrames = 0
  /** Quiet frames in a row; a contact goes quiet for one while the forces behind it still press. */
  let still = 0
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

  const underHand = (): SimulationState => {
    const held = hand
    if (!held) return state
    return {
      ...state,
      bodies: state.bodies.map((body) =>
        body.id === held.id ? { ...body, x: held.at.x, y: held.at.y, vx: 0, vy: 0 } : body,
      ),
    }
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
    land?.()
  }

  function advance(): boolean {
    const base = parts.layout()
    const config = spreadingFrames > 0 ? spreadLayout(base) : base
    const next = step(underHand(), config)
    state = next
    if (spreadingFrames > 0) spreadingFrames -= 1
    const quiet = next.energy < config.energyThreshold
    still = quiet ? still + 1 : 0
    if (!quiet) stepped = true
    const resting = still >= STILL_FRAMES && spreadingFrames === 0
    if (resting && !hand) {
      finish(next, false)
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
    still = 0
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
      wake()
    },
    wake,
    hold(id, at) {
      // A second drag closes the first: the bubble it left is recorded where it lies rather than later.
      if (landing) finish(state, false)
      hand = { id, at }
      wake()
    },
    release(next) {
      hand = null
      landing = next
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
      state = out.state
      still = STILL_FRAMES
      if (out.iterations > STILL_FRAMES) stepped = true
      finish(out.state, true)
      announce(false)
    },
    stop() {
      cancel()
      const land = landing
      landing = null
      land?.()
      announce(false)
    },
  }
}
