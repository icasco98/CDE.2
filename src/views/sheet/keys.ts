/**
 * The mock's keys, read as one pure function so the same table serves the screen and its test.
 * Nothing here touches the sheet: it says what the key asks for, and the stage does it.
 */

type KeyCommand =
  | { kind: 'copy' }
  | { kind: 'paste' }
  | { kind: 'apply-reshape' }
  | { kind: 'clear-polygon' }
  | { kind: 'cancel-reshape' }
  | { kind: 'escape' }
  | { kind: 'close-polygon' }
  | { kind: 'pan-held'; held: boolean }
  | { kind: 'measure' }
  | { kind: 'fit' }
  | { kind: 'nudge'; dx: number; dy: number }
  | { kind: 'send-back' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'quarter-turn' }
  /** The step switch: Zoning and Openings, never Esc. */
  | { kind: 'step'; to: 'zoning' | 'openings' | 'other' }
  | { kind: 'door-swing' }
  | { kind: 'door-hinge' }
  /** Space on a door: the hinge changes side, or a door without a hinge swings the other way. */
  | { kind: 'door-hinge-or-swing' }
  | { kind: 'door-slide'; step: number }
  | { kind: 'door-remove' }

/** What a key press means depends on what is in hand. */
export type KeyWorld = {
  /** A number is being typed into a box, so every key belongs to it. */
  typing: boolean
  selected: number
  drawing: boolean
  polygon: number
  reshaping: boolean
  measuring: boolean
  dragging: boolean
  /** The Openings step, and whether a door is in hand in it. */
  openings: boolean
  doorSelected: boolean
  /** The grid step, which is how far one arrow nudges. */
  grid: number
}

type KeyPress = {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

const arrows: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function keyCommand(press: KeyPress, world: KeyWorld): KeyCommand | null {
  if (world.typing) return null
  const key = press.key
  const lower = key.toLowerCase()
  const command = press.ctrlKey || press.metaKey
  if (command && lower === 'c') return { kind: 'copy' }
  if (command && lower === 'v') return { kind: 'paste' }
  if (command && lower === 'z') return press.shiftKey ? { kind: 'redo' } : { kind: 'undo' }
  if (command) return null
  if (lower === 'z') return { kind: 'step', to: 'zoning' }
  if (lower === 'o') return { kind: 'step', to: 'openings' }
  if (lower === 'd') return { kind: 'step', to: 'other' }
  if (world.openings && world.doorSelected) {
    if (lower === 'f') return { kind: 'door-swing' }
    if (lower === 'h') return { kind: 'door-hinge' }
    if (key === ' ') return { kind: 'door-hinge-or-swing' }
    if (key === 'Delete' || key === 'Backspace') return { kind: 'door-remove' }
    const along = arrows[key]
    if (along)
      return {
        kind: 'door-slide',
        step: (press.shiftKey ? 1 : world.grid || 0.25) * (along[0] + along[1] < 0 ? -1 : 1),
      }
  }
  // Fit stays on its button while doors are in hand, because F swings the one selected
  if (world.openings && lower === 'f') return null
  if (key === 'Enter' && world.reshaping) return { kind: 'apply-reshape' }
  if (key === 'Escape' && world.reshaping)
    return world.drawing && world.polygon > 0
      ? { kind: 'clear-polygon' }
      : { kind: 'cancel-reshape' }
  if (key === 'Escape') return { kind: 'escape' }
  if (key === 'Enter' && world.drawing && world.polygon >= 3) return { kind: 'close-polygon' }
  if (key === ' ') return { kind: 'pan-held', held: true }
  if (lower === 'm') return { kind: 'measure' }
  if (lower === 'f') return { kind: 'fit' }
  const arrow = arrows[key]
  if (arrow && world.selected && !world.dragging && !world.drawing) {
    const step = press.shiftKey ? 1 : world.grid || 0.25
    return { kind: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step }
  }
  if ((key === 'Delete' || key === 'Backspace') && world.selected) return { kind: 'send-back' }
  if (lower === 'r') return { kind: 'quarter-turn' }
  return null
}

/** Space let go: the sheet stops panning with a plain drag. */
export function keyRelease(press: KeyPress): KeyCommand | null {
  return press.key === ' ' ? { kind: 'pan-held', held: false } : null
}
