import { describe, expect, it } from 'vitest'
import { changesBetween } from './changes'
import { move, place, sendBack } from './actions'
import { fixtureSheet } from './fixture'

describe('what an action changed', () => {
  const sheet = fixtureSheet()

  it('names a zone put on the sheet', () => {
    const after = place(sheet, { id: 'nmu436pzls0vk', x: 11.2, y: 1.5, storey: 0 })
    expect(changesBetween(sheet, after.sheet, 0).moves).toEqual([
      { zone: 'Bedroom', how: 'placed' },
    ])
  })

  it('says how far a zone moved, and says nothing of the zones that stood still', () => {
    const after = move(sheet, { ids: ['r10'], dx: 0, dy: -2, storey: 0 })
    const changed = changesBetween(sheet, after.sheet, 0)
    expect(changed.moves).toEqual([{ zone: 'Guest WC', how: 'moved', metres: 2 }])
  })

  it('names the overlap a zone dropped on another leaves, and only the new one', () => {
    const first = place(sheet, { id: 'nmu436pzls0vk', x: 6, y: 5, storey: 0 })
    const fresh = changesBetween(sheet, first.sheet, 0)
    expect(fresh.newOverlaps.map((o) => o.zones[1])).toEqual(['Bedroom', 'Bedroom', 'Bedroom'])
    // moved a hair further onto the same zones: the overlaps are no longer new
    const again = move(first.sheet, { ids: ['nmu436pzls0vk'], dx: 0.05, dy: 0, storey: 0 })
    expect(changesBetween(first.sheet, again.sheet, 0).newOverlaps).toEqual([])
  })

  it('names a zone taken back to the program', () => {
    const after = sendBack(sheet, { ids: ['r10'] })
    expect(changesBetween(sheet, after.sheet, 0).moves).toEqual([
      { zone: 'Guest WC', how: 'sent back' },
    ])
  })

  it('names a spill that appeared past the line the ground floor may reach', () => {
    // with the boundary shut the ground floor may only stand inside the setback line
    const tight = place(fixtureSheet({ boundary: 'off', allowSpill: 1 }), {
      id: 'nmu436pzls0vk',
      x: 10,
      y: 10,
      storey: 0,
    }).sheet
    expect(changesBetween(tight, tight, 0).newSpills).toEqual([])
    const after = move(tight, { ids: ['nmu436pzls0vk'], dx: -9, dy: 0, storey: 0 })
    expect(changesBetween(tight, after.sheet, 0).newSpills).toContain('Bedroom')
  })
})
