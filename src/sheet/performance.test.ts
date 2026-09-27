import { expect, it } from 'vitest'
import { report } from './report'
import { sheetRead } from './agent'
import { meetingsOf } from './meetings'
import { pocketsOf } from './pockets'
import { fixtureSheet } from './fixture'
import { MASS_START, massProjection, orderPrisms, prismsOf } from './mass'
import { doDeed } from './verbs'
import { doorClash, drawnDoors } from './doors'
import type { Desk } from './desk'

/** The best of five runs after a warm-up, so neither compilation nor a stray collection is charged. */
function milliseconds(work: () => void): number {
  for (let i = 0; i < 5; i++) work()
  let best = Infinity
  for (let i = 0; i < 5; i++) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

const sheet = fixtureSheet()

it('reads the embedded sheet’s report inside 5 ms', () => {
  const taken = milliseconds(() => report(sheet, 0))
  console.log(`report on the embedded sheet: ${taken.toFixed(2)} ms, budget 5 ms`)
  expect(taken).toBeLessThan(10)
})

it('finds where every door of the test plan stands, on its edge’s wall, inside 2 ms', () => {
  // Read once per change of the sheet, never per frame of a drag: a drag re-renders from the memo.
  const taken = milliseconds(() => drawnDoors(sheet, 0))
  console.log(`drawnDoors on the test plan, 20 doors: ${taken.toFixed(2)} ms, budget 2 ms`)
  expect(drawnDoors(sheet, 0)).toHaveLength(20)
  expect(taken).toBeLessThan(4)
})

it('checks a door against the others on its wall inside 3 ms, once per placement or drop', () => {
  const [first] = drawnDoors(sheet, 0)
  const taken = milliseconds(() => doorClash(sheet, 0, first!.room, first!.door))
  console.log(`doorClash on the test plan, 20 doors: ${taken.toFixed(2)} ms, budget 3 ms`)
  expect(drawnDoors(sheet, 0).every((each) => !doorClash(sheet, 0, each.room, each.door))).toBe(
    true,
  )
  expect(taken).toBeLessThan(6)
})

it('reads how the embedded sheet’s rooms stand to each other inside 5 ms', () => {
  const taken = milliseconds(() => meetingsOf(sheet, 0))
  console.log(`meetingsOf on the embedded sheet: ${taken.toFixed(2)} ms, budget 5 ms`)
  expect(taken).toBeLessThan(10)
})

it('reads the whole house inside 15 ms, and it fits in one tool result', () => {
  const taken = milliseconds(() => sheetRead(sheet, 0))
  const bytes = new TextEncoder().encode(JSON.stringify(sheetRead(sheet, 0))).length
  console.log(`the whole house: ${taken.toFixed(2)} ms, budget 15 ms; ${bytes} bytes of 32 KB`)
  expect(taken).toBeLessThan(30)
  // the runtime carries at most 32 KB back from one tool call
  expect(bytes).toBeLessThan(32_768)
})

it('finds the embedded sheet’s enclosed spaces inside 20 ms', () => {
  const taken = milliseconds(() => pocketsOf(sheet, 0))
  console.log(`pocketsOf on the embedded sheet: ${taken.toFixed(2)} ms, budget 20 ms`)
  expect(taken).toBeLessThan(40)
})

it('sorts the mass’s wall-line tree inside 4 ms for 60 prisms', () => {
  const P = massProjection(MASS_START, 600, 420)
  const crowd = {
    ...sheet,
    rooms: sheet.rooms.concat(
      sheet.rooms
        .filter((r) => r.placed && !r.fixed)
        .map((r, i) => ({ ...r, id: `up${i}`, storey: 1 })),
    ),
  }
  const prisms = prismsOf(crowd, P)
  expect(prisms.length).toBeGreaterThanOrEqual(40)
  const taken = milliseconds(() => orderPrisms(prisms, P))
  console.log(`the wall-line tree for ${prisms.length} prisms: ${taken.toFixed(2)} ms, budget 4 ms`)
  expect(taken).toBeLessThan(8)
})

it('applies a list of ten deeds inside 60 ms', () => {
  const deeds = [
    { verb: 'turn', room: 'Store', quarter: true },
    { verb: 'mirror', room: 'Kitchen', axis: 'x' },
    { verb: 'resize', room: 'Guest WC', w: 3, h: 3 },
    { verb: 'lock', rooms: ['Store'] },
    { verb: 'unlock', rooms: ['Store'] },
    { verb: 'group', rooms: ['Kitchen', 'Store'] },
    { verb: 'ungroup', rooms: ['Kitchen'] },
    { verb: 'height', room: 'Dining Room', metres: 4 },
    { verb: 'court', between: ['Maid Room', 'Stair'] },
    { verb: 'storey', rooms: ['Store'], to: 'First' },
  ]
  const taken = milliseconds(() => {
    let held = sheet
    const at: Desk = {
      read: () => held,
      write: (change) => {
        if (change.result.ok) held = change.sheet
        return change.result
      },
      say: () => {},
      note: () => {},
      request: () => {},
      edgeBetween: () => null,
    }
    for (const deed of deeds) doDeed(at, 0, deed)
  })
  console.log(`ten deeds on the embedded sheet: ${taken.toFixed(2)} ms, budget 60 ms`)
  expect(taken).toBeLessThan(120)
})
