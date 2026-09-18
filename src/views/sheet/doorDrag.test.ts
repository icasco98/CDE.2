import { describe, expect, it } from 'vitest'
import { beginDoorDrag, doorDragTo, doorDrop } from './doorDrag'
import { doorsOf, placedRooms, sampleSheet, toWorld, doorPlace } from '../../sheet'

const roomNamed = (name: string) => {
  const r = placedRooms(sampleSheet(), 0).find((o) => o.name === name)
  if (!r) throw new Error(`no ${name}`)
  return r
}

/** The Kitchen's door onto the service hallway, 5.65 along a wall of 6.25. */
const kitchenDoor = () => {
  const r = roomNamed('Kitchen')
  const d = doorsOf(r).find((o) => o.at[1] === 0)!
  const pl = doorPlace(r, d)!
  return { r, d, at: toWorld(r, pl.p[0], pl.p[1]) }
}

describe('a door held by the hand', () => {
  it('stays still until the hand has moved a hand’s breadth', () => {
    const sheet = sampleSheet()
    const { r, d, at } = kitchenDoor()
    const drag = beginDoorDrag(sheet, 0, { room: r.id, id: d.id }, at)!
    expect(doorDragTo(drag, [at[0] + 0.05, at[1]], sheet, 0).moved).toBe(false)
    expect(doorDrop(drag, sheet, 0)).toBeNull()
  })

  it('slides along its own wall while the hand is within a metre of it', () => {
    const sheet = sampleSheet()
    const { r, d, at } = kitchenDoor()
    const drag = doorDragTo(
      beginDoorDrag(sheet, 0, { room: r.id, id: d.id }, at)!,
      [at[0] - 2, at[1] + 0.5],
      sheet,
      0,
    )
    expect(drag.hit?.room.id).toBe(r.id)
    const change = doorDrop(drag, sheet, 0)!
    expect(change.result.ok).toBe(true)
    const moved = placedRooms(change.sheet, 0).find((o) => o.id === r.id)!
    const now = doorsOf(moved).find((o) => o.id === d.id)!
    expect(now.at[0]).toBeLessThan(d.at[0])
    expect(now.at[1]).toBe(0)
  })

  it('comes free for another wall a metre off the one it was on', () => {
    const sheet = sampleSheet()
    const { r, d, at } = kitchenDoor()
    // the Kitchen's wall to the Driver Room, three metres south of the wall it started on
    const drag = doorDragTo(
      beginDoorDrag(sheet, 0, { room: r.id, id: d.id }, at)!,
      [6.13, 19.8],
      sheet,
      0,
    )
    expect(drag.moved).toBe(true)
    const change = doorDrop(drag, sheet, 0)!
    expect(change.result.ok).toBe(true)
    const landed = placedRooms(change.sheet, 0).find((o) => doorsOf(o).some((x) => x.id === d.id))!
    expect(['Kitchen', 'Driver Room']).toContain(landed.name)
    expect(
      doorPlace(
        landed,
        doorsOf(landed).find((x) => x.id === d.id)!,
      ),
    ).not.toBeNull()
  })

  it('refuses a wall on the boundary in the mock’s words', () => {
    const sheet = sampleSheet()
    const { r, d, at } = kitchenDoor()
    const drag = doorDragTo(
      beginDoorDrag(sheet, 0, { room: r.id, id: d.id }, at)!,
      [0, 4.5], // the Family Living's wall on the west boundary
      sheet,
      0,
    )
    const change = doorDrop(drag, sheet, 0)
    expect(change?.result.ok).toBe(false)
    expect(change?.result.said).toBe('A wall on the boundary takes no door.')
  })
})
