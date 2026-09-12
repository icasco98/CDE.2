import { describe, expect, it } from 'vitest'
import { startingSite, type Plot } from '../model'
import { correctContacts } from './correction'
import { groundOf } from './ground'
import {
  createState,
  defaultLayout,
  type SimulationEdge,
  type SimulationRoom,
  type SimulationState,
} from './simulation'
import { touching } from './tension'

const plot: Plot = {
  on: true,
  polygon: [
    [0, 0],
    [20, 0],
    [20, 25],
    [0, 25],
  ],
  north: 0,
  street: [2],
}
const ground = groundOf(plot, startingSite)

function room(id: string, targetArea: number, extra: Partial<SimulationRoom> = {}): SimulationRoom {
  return { id, storey: 0, storeysSpanned: 1, targetArea, pinned: false, ...extra }
}

function pairOf(state: SimulationState, a: string, b: string) {
  const one = state.bodies.find((body) => body.id === a)
  const other = state.bodies.find((body) => body.id === b)
  if (!one || !other) throw new Error('the picture is missing a room')
  return [one, other] as const
}

describe('the correction after the picture rests', () => {
  it('walks a room that never reached what it is linked to round to a free spot', () => {
    // A row of rooms held right across the floor, with the pair's other half held behind it: the
    // springs pull the free room into the row and the overlap wall stops it there, which is the
    // settle getting stuck rather than the program asking for anything impossible.
    const rooms = [
      ...[2, 6, 10, 14, 18].map((x, index) =>
        room(`wall${index}`, 40, { pinned: true, bubble: { x, y: 12 } }),
      ),
      room('a', 12, { pinned: true, bubble: { x: 10, y: 4 } }),
      room('b', 12, { bubble: { x: 10, y: 21 } }),
    ]
    const links: SimulationEdge[] = [{ a: 'a', b: 'b', storey: 0 }]
    // The picture as the run hands it over: the correction is only ever asked once it has stopped.
    const rested = createState(rooms, links, ground)
    const [was, stuck] = pairOf(rested, 'a', 'b')
    expect(touching(was, stuck)).toBe(false)

    const fixed = correctContacts(rested, defaultLayout)
    expect(fixed.corrected).toBeGreaterThan(0)
    const [one, other] = pairOf(fixed.state, 'a', 'b')
    expect(touching(one, other)).toBe(true)
  })

  it('leaves a pair alone when neither of them may be moved', () => {
    const rooms = [
      room('a', 12, { pinned: true, bubble: { x: 4, y: 4 } }),
      room('b', 12, { pinned: true, bubble: { x: 16, y: 20 } }),
    ]
    const rested = createState(rooms, [{ a: 'a', b: 'b', storey: 0 }], ground)
    const fixed = correctContacts(rested, defaultLayout)
    expect(fixed.corrected).toBe(0)
    expect(fixed.state.bodies).toEqual(rested.bodies)
  })

  it('takes a room across the corridor to reach what is on the other side of it', () => {
    // A corridor held across the floor with a room at its far end to point it, the crowd on one
    // side of it, and the room that is linked to something on the other side standing among them.
    const rooms = [
      room('hall', 30, { pinned: true, kind: 'hallway', bubble: { x: 10, y: 14 } }),
      room('end', 16, { pinned: true, kind: 'room-other', bubble: { x: 17, y: 14 } }),
      room('near', 24, { pinned: true, kind: 'formal-living', bubble: { x: 8, y: 7 } }),
      room('crowd1', 20, { pinned: true, kind: 'dining-room', bubble: { x: 5, y: 20 } }),
      room('crowd2', 20, { pinned: true, kind: 'kitchen', bubble: { x: 15, y: 20 } }),
      room('far', 14, { kind: 'office-study', bubble: { x: 10, y: 20 } }),
    ]
    const links: SimulationEdge[] = [
      { a: 'hall', b: 'end', storey: 0 },
      { a: 'near', b: 'far', storey: 0 },
    ]
    const drawn = createState(rooms, links, ground)
    const corridor = drawn.bodies.find((body) => body.id === 'hall')
    if (!corridor) throw new Error('there is no corridor')
    const sideOf = (x: number, y: number): number =>
      Math.sign(
        (x - corridor.x) * Math.sin(corridor.angle) - (y - corridor.y) * Math.cos(corridor.angle),
      )
    const [near, before] = pairOf(drawn, 'near', 'far')
    expect(touching(near, before)).toBe(false)
    expect(sideOf(before.x, before.y)).not.toBe(sideOf(near.x, near.y))

    const fixed = correctContacts(drawn, defaultLayout)
    const [, after] = pairOf(fixed.state, 'near', 'far')
    // It crossed to the quieter side, which is the side the room it is linked to stands on.
    expect(sideOf(after.x, after.y)).toBe(sideOf(near.x, near.y))
    expect(touching(near, after)).toBe(true)
  })
})
