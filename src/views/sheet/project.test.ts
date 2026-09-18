import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, type Store } from '../../model'
import { defaultProgram } from '../../rulebook'
import { DEFAULT_PLOT, followProgram, sampleSheet, sheetOf, type Sheet } from '../../sheet'
import { report } from '../../sheet'
import {
  addToProgram,
  followProject,
  kindFor,
  moveInProgram,
  plotOf,
  programOf,
  removeFromProgram,
  typeFor,
} from './project'

let store: Store

/** The starting household on the starting plot, as Rebuild program lays a brief out. */
const rebuild = (): void => {
  const project = store.getState()
  store.transaction(() => {
    for (const room of defaultProgram(500, project.household, project.storeys))
      store.actions.addRoom(room)
  })
}

const sheetOfProject = (from: Sheet = sheetOf([])): Sheet =>
  followProject(from, programOf(store.getState().rooms), plotOf(store.getState().plot))

const namesOf = (sheet: Sheet): readonly string[] => sheet.rooms.map((r) => r.name)

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(7) })
})

describe('the two tables of kinds', () => {
  it('says which room-type of the rulebook is which kind of the sheet, and back', () => {
    expect(kindFor('womens-reception')).toBe('women-reception')
    expect(kindFor('ensuite-bathroom')).toBe('ensuite')
    expect(kindFor('garage')).toBe('car-bay')
    expect(kindFor('nothing-of-the-sort')).toBe('room')
    expect(typeFor('women-reception')).toBe('womens-reception')
    expect(typeFor('car-bay')).toBe('garage')
    expect(typeFor('kitchen')).toBe('kitchen')
  })
})

describe('the program the project gives the sheet', () => {
  it('is the project’s rooms, in the project’s order, with their targets', () => {
    rebuild()
    const project = store.getState()
    const sheet = sheetOfProject()
    expect(namesOf(sheet)).toEqual(project.rooms.map((room) => room.name))
    expect(sheet.rooms.map((r) => r.target)).toEqual(project.rooms.map((room) => room.targetArea))
    expect(sheet.rooms.map((r) => r.id)).toEqual(project.rooms.map((room) => room.id))
    expect(sheet.rooms.every((r) => !r.placed)).toBe(true)
    expect(sheet.rooms.find((r) => r.name === 'Diwaniya')?.cat).toBe('reception')
  })

  it('reads a target changed in Requirements, and the sentence asks for it', () => {
    rebuild()
    const diwaniya = store.getState().rooms.find((room) => room.name === 'Diwaniya')!
    const asked = report(sheetOfProject(), 0).askedArea
    store.actions.setTargetArea(diwaniya.id, diwaniya.targetArea + 12)
    const sheet = sheetOfProject()
    expect(sheet.rooms.find((r) => r.id === diwaniya.id)?.target).toBe(diwaniya.targetArea + 12)
    expect(report(sheet, 0).askedArea).toBe(asked + 12)
  })

  it('stands the sheet on the project’s plot', () => {
    store.actions.setPlot({
      on: true,
      polygon: [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
      ],
      north: 40,
      street: [2],
    })
    rebuild()
    const { plot } = sheetOfProject()
    expect([plot.w, plot.h, plot.north]).toEqual([30, 30, 40])
    expect(plot.streets).toEqual(['street'])
    // 900 m² is in the Municipality's larger band: 3 m from the street, 2 m elsewhere
    expect(plot.build).toEqual({ x: 2, y: 2, w: 26, h: 25 })
  })

  it('leaves the sheet on the plot it has when the project’s boundary has no area', () => {
    expect(plotOf({ on: true, polygon: [], north: 0, street: [] })).toBeNull()
    const held = sheetOf([])
    expect(held.plot).toBe(DEFAULT_PLOT)
    expect(followProject(held, [], null).plot).toBe(DEFAULT_PLOT)
  })

  it('reads the starting project’s own plot: 20 by 25, the street to the south', () => {
    rebuild()
    const { plot } = sheetOfProject()
    expect([plot.w, plot.h, plot.north]).toEqual([20, 25, 0])
    expect(plot.streets).toEqual(['street'])
    expect(plot.build).toEqual({ x: 1.5, y: 1.5, w: 17, h: 21.5 })
  })
})

describe('a room added on the sheet', () => {
  it('is a room of the project, at the target the kind asks for', () => {
    rebuild()
    const before = store.getState().rooms.length
    const sheet = sheetOfProject()
    expect(addToProgram(store, sheet.rooms, { kind: 'prayer', name: 'Prayer', target: 9 }).ok).toBe(
      true,
    )
    const added = store.getState().rooms
    expect(added).toHaveLength(before + 1)
    expect(added[added.length - 1]).toMatchObject({
      name: 'Prayer',
      type: 'prayer-room',
      targetArea: 9,
    })
    expect(namesOf(sheetOfProject())).toContain('Prayer')
  })

  it('carries the sheet’s own program into an empty project, so the two are one list', () => {
    const sheet = sheetOfProject(sampleSheet())
    expect(store.getState().rooms).toHaveLength(0)
    expect(addToProgram(store, sheet.rooms, { kind: 'office', name: 'Study', target: 15 }).ok).toBe(
      true,
    )
    const program = store.getState().rooms
    expect(program.map((room) => room.name)).toEqual([
      ...sheet.rooms.filter((r) => !r.extra).map((r) => r.name),
      'Study',
    ])
    // the sheet follows the list it has just handed over: nothing of it is left aside
    const followed = followProgram(sheet, programOf(program))
    expect(followed.aside).toEqual([])
    expect(followed.sheet.rooms.filter((r) => r.placed).length).toBe(
      sheet.rooms.filter((r) => r.placed).length,
    )
  })

  it('is one undo step, whether the project had a program or not', () => {
    const sheet = sheetOfProject(sampleSheet())
    addToProgram(store, sheet.rooms, { kind: 'office', name: 'Study', target: 15 })
    store.undo()
    expect(store.getState().rooms).toHaveLength(0)
  })
})

describe('the program edited on the sheet', () => {
  it('takes a room out of the project', () => {
    rebuild()
    const sheet = sheetOfProject()
    const kitchen = sheet.rooms.find((r) => r.name === 'Kitchen')!
    expect(removeFromProgram(store, sheet.rooms, kitchen.id).ok).toBe(true)
    expect(namesOf(sheetOfProject())).not.toContain('Kitchen')
    expect(store.getState().rooms.some((room) => room.name === 'Kitchen')).toBe(false)
  })

  it('moves a room up the order of importance in the project', () => {
    rebuild()
    const sheet = sheetOfProject()
    const last = sheet.rooms[sheet.rooms.length - 1]!
    const first = sheet.rooms[0]!
    expect(moveInProgram(store, sheet.rooms, last.id, first.id).ok).toBe(true)
    expect(store.getState().rooms[0]!.id).toBe(last.id)
    expect(namesOf(sheetOfProject())[0]).toBe(last.name)
  })

  it('refuses to move a room before itself and leaves the list alone', () => {
    rebuild()
    const sheet = sheetOfProject()
    const first = sheet.rooms[0]!
    const before = namesOf(sheetOfProject())
    expect(moveInProgram(store, sheet.rooms, first.id, first.id).ok).toBe(false)
    expect(namesOf(sheetOfProject())).toEqual(before)
  })
})

describe('a saved sheet reconciled with another project', () => {
  it('keeps the project’s list and sets the sheet’s own rooms aside', () => {
    rebuild()
    const saved = sampleSheet()
    const sheet = sheetOfProject(saved)
    const project = store.getState()
    expect(namesOf(sheet).slice(0, project.rooms.length)).toEqual(
      project.rooms.map((room) => room.name),
    )
    const aside = sheet.rooms.filter((r) => r.aside)
    expect(aside.length).toBeGreaterThan(0)
    expect(report(sheet, 0).aside).toEqual(aside.map((r) => r.name))
    // the rooms the two lists share keep the drawing the saved sheet had
    const diwaniya = sheet.rooms.find((r) => r.name === 'Diwaniya')!
    expect(diwaniya.placed).toBe(true)
    expect(diwaniya.aside).toBeUndefined()
  })
})
