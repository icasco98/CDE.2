import { describe, expect, it } from 'vitest'
import { beginDoorDrag, doorDragTo, doorDrop } from './doorDrag'
import { doorsOf, sheetOf, type Zone, type Sheet } from '../../sheet'

const zone = (over: Partial<Zone>): Zone => ({
  id: 'a',
  name: 'A',
  kind: 'zone',
  cat: 'shared',
  target: 12,
  x: 6,
  y: 6,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

/** A beside B, sharing the edge x = 10 from y 6 to 9, and a door between them at (10, 7.5). */
const pair = (): Sheet =>
  sheetOf(
    [
      zone({
        doors: [
          {
            id: 'd1',
            connection: 'e1',
            to: 'b',
            type: 'door',
            w: 0.9,
            along: 0.5,
            flip: false,
            hinge: false,
          },
        ],
      }),
      zone({ id: 'b', name: 'B', x: 10 }),
    ],
    { grid: 0 },
  )

const at: [number, number] = [10, 7.5]

describe('a door held by the hand', () => {
  it('stays still until the hand has moved a hand’s breadth', () => {
    const sheet = pair()
    const drag = beginDoorDrag(sheet, 0, { zone: 'a', id: 'd1' }, at)!
    expect(doorDragTo(drag, [at[0] + 0.05, at[1]], sheet, 0).moved).toBe(false)
    expect(doorDrop(drag, sheet, 0)).toBeNull()
  })

  it('slides along the edge its two zones share while the hand is within a metre of it', () => {
    const sheet = pair()
    const drag = doorDragTo(
      beginDoorDrag(sheet, 0, { zone: 'a', id: 'd1' }, at)!,
      [10.5, 8.1],
      sheet,
      0,
    )
    expect(drag.hit?.why).toBeNull()
    const change = doorDrop(drag, sheet, 0)!
    expect(change.result.ok).toBe(true)
    // 8.1 is 2.1 m of the 3 m from the north end
    expect(doorsOf(change.sheet.zones[0]!)[0]!.along).toBeCloseTo(0.7, 6)
  })

  it('never comes free for another edge, since the door draws the connection between its two zones', () => {
    const sheet = pair()
    const drag = doorDragTo(beginDoorDrag(sheet, 0, { zone: 'a', id: 'd1' }, at)!, [8, 6], sheet, 0)
    const change = doorDrop(drag, sheet, 0)
    expect(change?.result.ok).toBe(false)
    expect(change?.result.said).toBe('A door stays on the edge A and B share.')
  })
})
