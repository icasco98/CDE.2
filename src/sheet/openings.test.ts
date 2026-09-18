import { describe, expect, it } from 'vitest'
import { doorDrawing, doorNear, doorRead, lostDoors, newDoors } from './openings'
import { addDoor, removeDoor } from './actions'
import { doorPlace } from './doors'
import { toWorld } from './geometry'
import { doorsOf, placedRooms, sheetOf, type Door, type Room } from './model'
import { sampleSheet } from './sample'

const named = (name: string) => {
  const r = placedRooms(sampleSheet(), 0).find((o) => o.name === name)
  if (!r) throw new Error(`no ${name} on the sample`)
  return r
}

const place = (r: Room, d: Door) => {
  const pl = doorPlace(r, d)
  if (!pl) throw new Error('that door is on no wall')
  return pl
}

describe('the door under the hand', () => {
  it('finds the Entry’s street door from a third of a metre away and nothing from two', () => {
    const sheet = sampleSheet()
    // the Entry's double street door stands at 17.00, 8.00
    expect(doorNear(sheet, 0, 17, 8.3, 0.45)?.id).toBe(
      doorsOf(named('Entry')).find((d) => d.type === 'street2')!.id,
    )
    expect(doorNear(sheet, 0, 17, 10, 0.45)).toBeNull()
  })

  it('answers for a door that lost its wall by the ring where it was left', () => {
    const sheet = sampleSheet()
    const lost = lostDoors(sheet, 0)
    expect(lost).toHaveLength(1)
    expect(lost[0]!.room.name).toBe('Diwaniya WC')
    const { room, door } = lost[0]!
    // the ring sits where the door was left, in the room's own frame
    const wp = toWorld(room, door.at[0], door.at[1])
    expect(doorNear(sheet, 0, wp[0], wp[1], 0.3)?.id).toBe(door.id)
  })
})

describe('what a placement added', () => {
  it('names the one door a placement put on the wall', () => {
    const before = sampleSheet()
    const change = addDoor(before, { x: 4, y: 16.37, type: 'door', storey: 0 })
    expect(change.result.ok).toBe(true)
    const added = newDoors(before, change.sheet)
    expect(added).toHaveLength(1)
    expect(newDoors(change.sheet, before)).toEqual([])
  })

  it('names every opening an opened wall added', () => {
    const before = sampleSheet()
    const change = addDoor(before, { x: 14.2, y: 7, type: 'open', storey: 0 })
    expect(change.result.ok).toBe(true)
    expect(newDoors(before, change.sheet).length).toBeGreaterThan(0)
  })
})

describe('a door’s drawing', () => {
  it('opens the wall the door’s width, from a jamb short of the corner', () => {
    const r = named('Kitchen')
    const d = doorsOf(r).find((o) => o.at[1] === 0)!
    const drawing = doorDrawing(r, d, place(r, d), sampleSheet(), 0)
    const [a, b] = drawing.gap
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(0.9, 6)
  })

  it('gives a plain door one leaf of its width and a double door two halves', () => {
    const r = named('Kitchen')
    const plain = doorsOf(r)[0]!
    expect(doorDrawing(r, plain, place(r, plain), sampleSheet(), 0).leaves).toHaveLength(1)
    expect(
      doorDrawing(r, plain, place(r, plain), sampleSheet(), 0).leaves[0]!.arc.radius,
    ).toBeCloseTo(0.9, 6)
    const entry = named('Entry')
    const street2 = doorsOf(entry).find((o) => o.type === 'street2')!
    const both = doorDrawing(entry, street2, place(entry, street2), sampleSheet(), 0)
    expect(both.leaves).toHaveLength(2)
    expect(both.leaves[0]!.arc.radius).toBeCloseTo(street2.w / 2, 6)
    expect(both.streetMark).not.toBeNull()
  })

  it('gives a sliding door two panels and two jambs and no leaf, an opening jambs alone', () => {
    const r = named('Diwaniya')
    const sliding = doorsOf(r).find((o) => o.type === 'sliding')!
    const slid = doorDrawing(r, sliding, place(r, sliding), sampleSheet(), 0)
    expect(slid.leaves).toEqual([])
    expect(slid.panels).toHaveLength(2)
    expect(slid.jambs).toHaveLength(2)
    const opening = doorsOf(r).find((o) => o.type === 'opening')!
    const open = doorDrawing(r, opening, place(r, opening), sampleSheet(), 0)
    expect(open.leaves).toEqual([])
    expect(open.panels).toEqual([])
    expect(open.jambs).toHaveLength(2)
  })

  it('marks an opened wall with its own line and nothing else', () => {
    const r = named('Stair')
    const d = doorsOf(r).find((o) => o.type === 'open')!
    const drawing = doorDrawing(r, d, place(r, d), sampleSheet(), 0)
    expect(drawing.openMark).not.toBeNull()
    expect(drawing.leaves).toEqual([])
    expect(drawing.jambs).toEqual([])
    expect(drawing.blocked).toBe(false)
  })

  it('says the leaf cannot open when its swing leaves the room it swings into', () => {
    // a niche half a metre deep cannot take a leaf of 0.9, and the same door swung out can
    const niche: Room = {
      id: 'a',
      name: 'Niche',
      kind: 'room',
      cat: 'shared',
      target: 2,
      x: 6,
      y: 6,
      w: 3,
      h: 0.5,
      angle: 0,
      pieces: null,
      placed: true,
      placedAt: 1,
    }
    const inward: Door = { id: 'd1', type: 'door', w: 0.9, at: [1.5, 0], flip: false, hinge: false }
    const out: Door = { ...inward, flip: true }
    expect(doorDrawing(niche, inward, place(niche, inward), sheetOf([niche]), 0).blocked).toBe(true)
    expect(doorDrawing(niche, out, place(niche, out), sheetOf([niche]), 0).blocked).toBe(false)
  })
})

describe('what the sentence says about the door in hand', () => {
  it('names the wall, the neighbour and the way it swings', () => {
    const sheet = sampleSheet()
    const kitchen = named('Kitchen')
    const d = doorsOf(kitchen).find((o) => o.at[1] === 0)!
    const read = doorRead(sheet, 0, { room: kitchen.id, id: d.id })
    expect(read).toEqual({
      label: 'Door',
      room: 'Kitchen',
      width: 0.9,
      across: 'service hallway',
      swingsInto: 'Kitchen',
      swings: true,
      hinges: true,
      onWall: true,
    })
  })

  it('says an opening neither swings nor hinges, and a lost door is on no wall', () => {
    const sheet = sampleSheet()
    const diw = named('Diwaniya')
    const opening = doorsOf(diw).find((o) => o.type === 'opening')!
    const read = doorRead(sheet, 0, { room: diw.id, id: opening.id })
    expect(read?.swings).toBe(false)
    expect(read?.hinges).toBe(false)
    expect(read?.swingsInto).toBeNull()
    const lost = lostDoors(sheet, 0)[0]!
    expect(doorRead(sheet, 0, { room: lost.room.id, id: lost.door.id })?.onWall).toBe(false)
  })

  it('has nothing to say about a door that has been removed', () => {
    const sheet = sampleSheet()
    const kitchen = named('Kitchen')
    const d = doorsOf(kitchen)[0]!
    const gone = removeDoor(sheet, { room: kitchen.id, door: d.id })
    expect(doorRead(gone.sheet, 0, { room: kitchen.id, id: d.id })).toBeNull()
  })
})
