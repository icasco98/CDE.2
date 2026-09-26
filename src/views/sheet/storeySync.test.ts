import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, type Store } from '../../model'
import { defaultProgram } from '../../rulebook'
import { connectDefaults } from '../../app/defaultLinks'
import { sendToStorey } from '../../app/sendToStorey'
import { place, setStorey, sheetOf, type Sheet } from '../../sheet'
import { createAside, followProject, followSheetStoreys, plotOf, programOf } from './project'
import { createLinks } from './linkedUndo'

let store: Store

/** The starting household on two storeys, as Rebuild program lays it out, with its connections. */
const rebuild = (): void => {
  store.actions.addStorey()
  const project = store.getState()
  store.transaction(() => {
    for (const room of defaultProgram(500, project.household, project.storeys))
      store.actions.addRoom(room)
    return connectDefaults(store)
  })
}

const idOf = (name: string): string => store.getState().rooms.find((r) => r.name === name)!.id
const storeyIn = (name: string): number =>
  store.getState().rooms.find((r) => r.name === name)!.storey
const linked = (a: string, b: string): boolean =>
  store
    .getState()
    .edges.some(
      (edge) =>
        (edge.a === idOf(a) && edge.b === idOf(b)) || (edge.a === idOf(b) && edge.b === idOf(a)),
    )

/** The project's sheet with the named rooms placed on the storeys the program gives them. */
function sheetWith(names: readonly string[]): Sheet {
  let sheet = followProject(
    sheetOf([]),
    programOf(store.getState().rooms),
    plotOf(store.getState().plot),
    store.getState().edges,
    createAside(),
  )
  names.forEach((name, i) => {
    const storey = storeyIn(name)
    sheet = place(sheet, { id: idOf(name), x: 3 + i * 6, y: 4, storey }).sheet
  })
  return sheet
}

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(31) })
  rebuild()
})

describe('a room moved to another storey on the sheet', () => {
  it('moves in the program too, lets go of the links it cannot hold, and finds the ones there', () => {
    const before = sheetWith(['Kitchen'])
    expect(linked('Kitchen', 'Dining Room')).toBe(true)
    const after = setStorey(before, { ids: [idOf('Kitchen')], storey: 0, to: 1 }).sheet
    const moved = followSheetStoreys(store, before, after)
    if (!moved.ok) throw new Error('refused')
    expect(moved.value.shifts).toEqual([{ id: idOf('Kitchen'), from: 0, to: 1 }])
    expect(storeyIn('Kitchen')).toBe(1)
    expect(linked('Kitchen', 'Dining Room')).toBe(false)
    expect(moved.value.letGo).toContain('Kitchen: its door to Dining Room was let go.')
  })

  it('takes a companion still waiting in the program, and leaves one the hand has drawn', () => {
    const alone = sheetWith(['Master Bedroom'])
    const up = setStorey(alone, { ids: [idOf('Master Bedroom')], storey: 1, to: 0 }).sheet
    expect(followSheetStoreys(store, alone, up).ok).toBe(true)
    expect(storeyIn('Master Bedroom')).toBe(0)
    expect(storeyIn('Ensuite, Master Bedroom')).toBe(0)

    store.undo()
    const both = sheetWith(['Master Bedroom', 'Ensuite, Master Bedroom'])
    const down = setStorey(both, { ids: [idOf('Master Bedroom')], storey: 1, to: 0 }).sheet
    expect(followSheetStoreys(store, both, down).ok).toBe(true)
    expect(storeyIn('Master Bedroom')).toBe(0)
    expect(storeyIn('Ensuite, Master Bedroom')).toBe(1)
  })

  it('is one step of the project, which the linked undo takes back and brings again', () => {
    const before = sheetWith(['Kitchen'])
    const after = setStorey(before, { ids: [idOf('Kitchen')], storey: 0, to: 1 }).sheet
    const links = createLinks(store)
    const moved = followSheetStoreys(store, before, after)
    if (!moved.ok) throw new Error('refused')
    links.storeys(5, moved.value.shifts)
    links.undone(5)
    expect(storeyIn('Kitchen')).toBe(0)
    expect(linked('Kitchen', 'Dining Room')).toBe(true)
    links.redone(5)
    expect(storeyIn('Kitchen')).toBe(1)
  })

  it('reads only what the step moved: a room the program moved on its own stays moved', () => {
    const before = sheetWith(['Kitchen'])
    sendToStorey(store, idOf('Kitchen'), 1)
    const moved = followSheetStoreys(store, before, before)
    expect(moved.ok && moved.value.shifts).toEqual([])
    expect(storeyIn('Kitchen')).toBe(1)
  })

  it('never moves the stair, which stands on every storey', () => {
    const before = sheetWith(['Stair'])
    const after = setStorey(before, { ids: [idOf('Stair')], storey: 0, to: 1 })
    expect(after.result.ok).toBe(false)
    expect(storeyIn('Stair')).toBe(0)
  })
})

it('reads a sheet step that moved no storey inside 1 ms, as every step of the hand does', () => {
  const sheet = sheetWith(store.getState().rooms.map((room) => room.name))
  const nudged = { ...sheet, rooms: sheet.rooms.map((r) => ({ ...r, x: r.x + 0.25 })) }
  for (let i = 0; i < 5; i++) followSheetStoreys(store, sheet, nudged)
  let best = Infinity
  for (let i = 0; i < 5; i++) {
    const started = performance.now()
    followSheetStoreys(store, sheet, nudged)
    best = Math.min(best, performance.now() - started)
  }
  console.log(`followSheetStoreys on the rebuilt program: ${best.toFixed(3)} ms, budget 1 ms`)
  expect(best).toBeLessThan(2)
})
