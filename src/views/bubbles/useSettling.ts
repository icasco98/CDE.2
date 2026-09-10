import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createState,
  defaultLayout,
  step,
  type LayoutConfig,
  type SimulationState,
} from '../../bubbles'
import type { Commit } from '../../model'
import type { BubbleLink, BubbleRoom } from './types'

export type Settling = 'ready' | 'running' | 'settled' | 'stopped'

export type SettleControls = {
  readonly settling: Settling
  readonly start: () => void
  readonly stop: () => void
  /** A hand on a bubble ends a run, and makes any earlier claim that the picture had settled false. */
  readonly interrupt: () => void
}

type Report = (id: string, at: { x: number; y: number }, commit: Commit) => void

export function useSettling(
  rooms: readonly BubbleRoom[],
  edges: readonly BubbleLink[],
  storeys: number,
  onMoveBubble: Report,
  config: LayoutConfig = defaultLayout,
): SettleControls {
  const [settling, setSettling] = useState<Settling>('ready')
  const frame = useRef(0)
  const state = useRef<SimulationState | null>(null)
  const latest = useRef({ rooms, edges, storeys, onMoveBubble, config })
  latest.current = { rooms, edges, storeys, onMoveBubble, config }

  /** Every bubble moves as a preview and the last one commits, so a whole settle is one step to undo. */
  const report = useCallback((next: SimulationState, commit: Commit) => {
    const moving = next.bodies.filter((body) => !body.pinned)
    moving.forEach((body, index) => {
      const last = commit === 'commit' && index === moving.length - 1
      latest.current.onMoveBubble(body.id, { x: body.x, y: body.y }, last ? 'commit' : 'preview')
    })
  }, [])

  const halt = useCallback(
    (reason: Settling) => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
      frame.current = 0
      const current = state.current
      state.current = null
      if (current) report(current, 'commit')
      setSettling(reason)
    },
    [report],
  )

  const start = useCallback(() => {
    if (frame.current !== 0) return
    const { rooms: program, edges: links, storeys: levels, config: layout } = latest.current
    state.current = createState(program, links, levels)
    let iterations = 0
    const tick = () => {
      const current = state.current
      if (!current) return
      iterations += 1
      const next = step(current, layout)
      state.current = next
      if (next.energy < layout.energyThreshold || iterations >= layout.maxIterations) {
        halt('settled')
        return
      }
      report(next, 'preview')
      frame.current = requestAnimationFrame(tick)
    }
    setSettling('running')
    frame.current = requestAnimationFrame(tick)
  }, [halt, report])

  const stop = useCallback(() => {
    if (frame.current === 0) return
    halt('stopped')
  }, [halt])

  const interrupt = useCallback(() => {
    if (frame.current !== 0) halt('stopped')
    else setSettling('ready')
  }, [halt])

  useEffect(
    () => () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
    },
    [],
  )

  return { settling, start, stop, interrupt }
}
