import { area } from '../geometry'
import type { Polygon } from '../geometry'

export type CapacityRoom = {
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
}

export type StoreyCapacity = {
  readonly storey: number
  readonly needed: number
  readonly available: number
  readonly over: boolean
}

export function storeyLabel(storey: number): string {
  return storey === 0 ? 'Ground' : `Level ${storey}`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** A stair takes floor on every storey it passes through, so it counts once per storey. */
function storeysOf(room: CapacityRoom): readonly number[] {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return Array.from({ length: span }, (_, i) => room.storey + i)
}

/**
 * Target areas per storey against the plot's own area. Setbacks are not known at this stage, so
 * the comparison is against the whole plot and the message says so.
 */
export function storeyCapacity(
  rooms: readonly CapacityRoom[],
  plot: Polygon,
  storeys: number,
): readonly StoreyCapacity[] {
  const measured = plot.length >= 3
  const available = measured ? round(area(plot)) : 0
  const levels = Math.max(1, Math.trunc(storeys))
  const needed = new Array<number>(levels).fill(0)
  for (const room of rooms)
    for (const storey of storeysOf(room))
      if (storey >= 0 && storey < levels) needed[storey] = (needed[storey] ?? 0) + room.targetArea
  return needed.map((total, storey) => ({
    storey,
    needed: round(total),
    available,
    over: measured && round(total) > available,
  }))
}

export function capacityMessage(capacity: StoreyCapacity): string {
  return `The rooms on ${storeyLabel(capacity.storey)} need ${capacity.needed} m² against the whole plot of ${capacity.available} m².`
}
