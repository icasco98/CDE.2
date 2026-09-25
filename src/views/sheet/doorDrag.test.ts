import { describe, expect, it } from 'vitest'
import { beginDoorDrag, doorDragTo, doorDrop } from './doorDrag'
import { doorsOf, sheetOf, type Room, type Sheet } from '../../sheet'

const room = (over: Partial<Room>): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
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

/** A beside B, sharing the wall x = 10 from y 6 to 9, and a door between them at (10, 7.5). */
const pair = (): Sheet =>
  sheetOf(
    [
      room({
        doors: [
          {
            id: 'd1',
            edge: 'e1',
            to: 'b',
            type: 'door',
            w: 0.9,
            along: 0.5,
            flip: false,
            hinge: false,
          },
        ],
      }),
      room({ id: 'b', name: 'B', x: 10 }),
    ],
    { grid: 0 },
  )

const at: [number, number] = [10, 7.5]

describe('a door held by the hand', () => {
  it('stays still until the hand has moved a hand’s breadth', () => {
    const sheet = pair()
    const drag = beginDoorDrag(sheet, 0, { room: 'a', id: 'd1' }, at)!
    expect(doorDragTo(drag, [at[0] + 0.05, at[1]], sheet, 0).moved).toBe(false)
    expect(doorDrop(drag, sheet, 0)).toBeNull()
  })

  it('slides along the wall its two rooms share while the hand is within a metre of it', () => {
    const sheet = pair()
    const drag = doorDragTo(
      beginDoorDrag(sheet, 0, { room: 'a', id: 'd1' }, at)!,
      [10.5, 8.1],
      sheet,
      0,
    )
    expect(drag.hit?.why).toBeNull()
    const change = doorDrop(drag, sheet, 0)!
    expect(change.result.ok).toBe(true)
    // 8.1 is 2.1 m of the 3 m from the north end
    expect(doorsOf(change.sheet.rooms[0]!)[0]!.along).toBeCloseTo(0.7, 6)
  })

  it('never comes free for another wall, since the door draws the edge between its two rooms', () => {
    const sheet = pair()
    const drag = doorDragTo(beginDoorDrag(sheet, 0, { room: 'a', id: 'd1' }, at)!, [8, 6], sheet, 0)
    const change = doorDrop(drag, sheet, 0)
    expect(change?.result.ok).toBe(false)
    expect(change?.result.said).toBe('A door stays on the wall A and B share.')
  })
})
