import { useCallback, useEffect, useRef, useState } from 'react'
import { createState, defaultLayout, type LayoutConfig, type Position } from '../../bubbles'
import type { Commit } from '../../model'
import { browserFrames, createRun, type Frames, type Landing } from './run'
import type { BubbleLink, BubbleRoom } from './types'

type SettleControls = {
  /** What the status line says: the picture is moving, or it is resting. */
  readonly moving: boolean
  readonly settleNow: () => void
  readonly spread: () => void
  readonly hold: (id: string, at: Position) => void
  readonly release: (landing: Landing | null) => void
}

type Report = (id: string, at: Position, commit: Commit) => void

/**
 * Everything the simulation is built from, so a room added, resized, pinned or moved between
 * storeys starts a new picture while a bubble merely travelling across the sheet does not.
 */
function shapeOf(
  rooms: readonly BubbleRoom[],
  edges: readonly BubbleLink[],
  storeys: number,
): string {
  const program = rooms.map(
    (room) =>
      `${room.id}:${room.storey}:${room.storeysSpanned}:${room.targetArea}:${room.pinned}:${room.tier ?? ''}`,
  )
  return `${storeys}|${program.join(',')}|${edges.map((edge) => `${edge.a}-${edge.b}`).join(',')}`
}

export function useSettling(
  rooms: readonly BubbleRoom[],
  edges: readonly BubbleLink[],
  storeys: number,
  onMoveBubble: Report,
  config: LayoutConfig = defaultLayout,
  frames: Frames = browserFrames,
): SettleControls {
  const [moving, setMoving] = useState(false)
  const latest = useRef({ rooms, edges, storeys, onMoveBubble, config })
  latest.current = { rooms, edges, storeys, onMoveBubble, config }

  /** Every bubble moves as a preview and the last one commits, so a whole run is one step to undo. */
  const run = useRef(
    createRun({
      frames,
      state: createState(rooms, edges, storeys),
      layout: () => latest.current.config,
      report: (bodies, commit) =>
        bodies.forEach((body, index) => {
          const last = commit === 'commit' && index === bodies.length - 1
          latest.current.onMoveBubble(
            body.id,
            { x: body.x, y: body.y },
            last ? 'commit' : 'preview',
          )
        }),
      watch: setMoving,
    }),
  ).current

  const shape = shapeOf(rooms, edges, storeys)
  useEffect(() => {
    const program = latest.current
    run.begin(createState(program.rooms, program.edges, program.storeys))
  }, [run, shape])

  /** A weight moved changes the forces, so the picture is asked to answer them. */
  useEffect(() => run.look(), [run, config])

  useEffect(() => () => run.stop(), [run])

  return {
    moving,
    settleNow: useCallback(() => run.settleNow(), [run]),
    spread: useCallback(() => run.spread(), [run]),
    hold: useCallback((id: string, at: Position) => run.hold(id, at), [run]),
    release: useCallback((landing: Landing | null) => run.release(landing), [run]),
  }
}
