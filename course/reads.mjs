/**
 * What both courses read back from a sheet: a room as the owner's hand left one, its area, how much
 * wall two rooms share, and what the last command said. Every number here comes from the model.
 */

import { areaOf, sheetRead } from '../src/sheet/index.ts'

export const r2 = (n) => Math.round(n * 100) / 100

/** A room as the sheet stores one: a rectangle standing where the owner's hand left it. */
export const maker = () => {
  let n = 0
  return (name, kind, cat, box, more = {}) => ({
    id: `r${++n}`,
    name,
    kind,
    cat,
    target: r2(box.w * box.h),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    angle: 0,
    pieces: null,
    placed: true,
    storey: 0,
    placedAt: n,
    ...more,
  })
}

export const named = (sheet, name) => sheet.rooms.find((o) => o.name === name) ?? null

export const area = (sheet, name) => {
  const r = named(sheet, name)
  return r ? r2(areaOf(r)) : 0
}

/** The run of wall two rooms share on one storey, in metres, as the tool reads it. */
export const sharingOn = (sheet, storey, one, other) => {
  const read = sheetRead(sheet, storey).storeys[storey]
  const found = read?.sharing.find((s) => s.rooms.includes(one) && s.rooms.includes(other))
  return found ? found.metres : 0
}

export const sharedWall = (sheet, one, other) => sharingOn(sheet, 0, one, other)

/** The last thing a tool said in this run, as it said it. */
export const lastResult = (record) => {
  const calls = record.calls.filter((c) => c.tool !== 'read_sheet')
  const last = calls[calls.length - 1]
  return last ? JSON.stringify(last.result) : ''
}

/** Everything every command said in this run, as it said it. */
export const allResults = (record) =>
  record.calls
    .filter((c) => c.tool !== 'read_sheet')
    .map((c) => JSON.stringify(c.result))
    .join('\n')

export const untouched = (task, sheet) =>
  JSON.stringify(task.sheet().rooms) === JSON.stringify(sheet.rooms)
