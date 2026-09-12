import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry'
import { startingSite, type Plot } from '../model'
import { forces, forcesOn, type ForceField } from './forces'
import { sidesOf } from './sides'

/**
 * The plot a project opens on: twenty by twenty-five with the street to the south, so the service
 * street is the side at the bottom of the sheet and the back is the side at the top.
 */
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

/** The same plot with a second street to the west, which gives it a corner. */
const corner: Plot = { ...plot, street: [2, 3] }

function fieldOn(on: Plot, where: Readonly<Record<string, Point>> = {}, site = startingSite) {
  const field: ForceField = {
    sides: sidesOf(on),
    site,
    where: (kinds) => {
      const found = kinds.map((kind) => where[kind]).filter((at): at is Point => at !== undefined)
      if (found.length === 0) return undefined
      return [
        found.reduce((total, at) => total + at[0], 0) / found.length,
        found.reduce((total, at) => total + at[1], 0) / found.length,
      ]
    },
  }
  return field
}

function rowOf(id: string) {
  const row = forces.find((force) => force.id === id)
  if (!row) throw new Error(`there is no force ${id}`)
  return row
}

/** Which way a row pulls, to a tenth, so a direction can be read as a pair of numbers. */
function pullOf(
  id: string,
  room: { kind: string; tier?: string },
  at: Point,
  field: ForceField,
): readonly [number, number] {
  const [x, y] = rowOf(id).pull(room, at, field)
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}

const middle: Point = [10, 12]

describe('the rows of the rulebook, with coordinates', () => {
  it('carries every strength the table gives and nothing else', () => {
    for (const force of forces) expect([0.3, 0.6, 0.9]).toContain(force.strength)
    // S3 was dropped by the owner and S7 is a wall, so neither is a row here.
    expect(forces.map((force) => force.id)).not.toContain('S3')
    expect(forces.map((force) => force.id)).not.toContain('S7')
  })

  it('S1 takes the diwaniya to the service street', () => {
    expect(pullOf('S1', { kind: 'diwaniya' }, middle, fieldOn(plot))).toEqual([0, 1])
  })

  it('S2 takes a garage bay along the frontage toward the nearer side boundary', () => {
    const field = fieldOn(plot)
    expect(pullOf('S2', { kind: 'garage' }, [5, 21], field)[0]).toBeLessThan(0)
    expect(pullOf('S2', { kind: 'garage' }, [15, 21], field)[0]).toBeGreaterThan(0)
  })

  it('S4 takes the diwaniya to the corner, and only when the client asks for it', () => {
    const asked = fieldOn(corner, {}, { ...startingSite, diwaniyaAtCorner: true })
    const pull = pullOf('S4', { kind: 'diwaniya' }, middle, asked)
    expect(pull[0]).toBeLessThan(0)
    expect(pull[1]).toBeGreaterThan(0)
    expect(pullOf('S4', { kind: 'diwaniya' }, middle, fieldOn(corner))).toEqual([0, 0])
  })

  it('S5 takes the family living room to the rear, to a side, or nowhere', () => {
    expect(pullOf('S5', { kind: 'family-living' }, middle, fieldOn(plot))).toEqual([0, -1])
    const side = fieldOn(plot, {}, { ...startingSite, garden: 'side' })
    expect(pullOf('S5', { kind: 'family-living' }, [5, 12], side)).toEqual([-1, 0])
    const none = fieldOn(plot, {}, { ...startingSite, garden: 'none' })
    expect(pullOf('S5', { kind: 'family-living' }, middle, none)).toEqual([0, 0])
  })

  it('S6 takes the service rooms to a side boundary', () => {
    expect(pullOf('S6', { kind: 'laundry' }, [5, 12], fieldOn(plot))).toEqual([-1, 0])
    expect(pullOf('S6', { kind: 'maid-room' }, [15, 12], fieldOn(plot))).toEqual([1, 0])
  })

  it('S8 takes the kitchen away from the frontage', () => {
    expect(pullOf('S8', { kind: 'kitchen' }, middle, fieldOn(plot))).toEqual([0, -1])
    expect(pullOf('S8', { kind: 'storage' }, middle, fieldOn(plot))).toEqual([0, -1])
  })

  it('U1 takes the diwaniya and its WC away from the family living room and the bedrooms', () => {
    const field = fieldOn(plot, { 'family-living': [10, 6], bedroom: [10, 6] })
    expect(pullOf('U1', { kind: 'diwaniya' }, middle, field)).toEqual([0, 1])
    expect(pullOf('U1', { kind: 'diwaniya-wc' }, middle, field)).toEqual([0, 1])
  })

  it('U2 runs the privacy gradient from the street to the back, and lets an exempt room be', () => {
    const field = fieldOn(plot)
    expect(pullOf('U2', { kind: 'diwaniya', tier: 'public' }, middle, field)).toEqual([0, 1])
    expect(pullOf('U2', { kind: 'bedroom', tier: 'private' }, middle, field)).toEqual([0, -1])
    // A semi-public room is pulled to the band between them, and at the middle it is already there.
    expect(pullOf('U2', { kind: 'dining-room', tier: 'semi-public' }, [10, 5], field)).toEqual([
      0, 1,
    ])
    expect(rowOf('U2').acts({ kind: 'ensuite-bathroom', tier: 'exempt' })).toBe(false)
  })

  it('U5 takes a bedroom away from the diwaniya and away from the street', () => {
    const field = fieldOn(plot, { diwaniya: [10, 20] })
    expect(pullOf('U5', { kind: 'bedroom' }, middle, field)).toEqual([0, -1])
  })

  it('U9 takes the guest WC to the formal living room and the entry', () => {
    const field = fieldOn(plot, { 'formal-living': [4, 12], 'entry-foyer': [4, 12] })
    expect(pullOf('U9', { kind: 'guest-wc' }, middle, field)).toEqual([-1, 0])
  })

  it('U10 takes the formal living room to the entry and away from the family living room', () => {
    const field = fieldOn(plot, { 'entry-foyer': [10, 20], 'family-living': [10, 4] })
    expect(pullOf('U10', { kind: 'formal-living' }, middle, field)).toEqual([0, 1])
  })

  it('says which rows act on a room, so a link that will not close can name one', () => {
    expect(forcesOn({ kind: 'kitchen', tier: 'private' }).map((force) => force.id)).toEqual([
      'S8',
      'U2',
    ])
    expect(forcesOn({ kind: 'room-other' })).toEqual([])
  })
})
