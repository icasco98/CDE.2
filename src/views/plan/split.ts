import type { Storage } from '../../model'

/** The share of the width the sheet takes when both halves are shown, as a percentage. */
export const DEFAULT_SPLIT = 60

/** The sheet across the whole tab, and the massing across the whole tab. */
export const SHEET_ONLY = 100
export const MASSING_ONLY = 0

/** The handle never squeezes a half away: the three buttons are how a half is put away. */
const LEAST = 15
const MOST = 85

/** One key, so the width the halves were last given by hand is remembered across sittings. */
const KEY = 'plan-split'

/** To a tenth of a percent, which is under a pixel on any sheet and keeps the stored value short. */
export function heldSplit(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_SPLIT
  return Math.min(MOST, Math.max(LEAST, Math.round(percent * 10) / 10))
}

/** Where the handle has been dragged to, as a share of the width it was dragged across. */
export function splitAt(
  box: { readonly left: number; readonly width: number },
  clientX: number,
): number {
  if (box.width <= 0) return DEFAULT_SPLIT
  return heldSplit(((clientX - box.left) / box.width) * 100)
}

export function readSplit(storage: Storage): number {
  const held = storage.getItem(KEY)
  return held === null || held === '' ? DEFAULT_SPLIT : heldSplit(Number(held))
}

export function writeSplit(storage: Storage, percent: number): void {
  storage.setItem(KEY, String(percent))
}
