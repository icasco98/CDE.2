import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, type Store } from '../../model'
import { addStorey, removeStorey } from './storeys'

let store: Store

const spanOf = (id: string): number | undefined =>
  store.getState().rooms.find((room) => room.id === id)?.storeysSpanned

function add(type: string, storeysSpanned = 1): string {
  const added = store.actions.addRoom({ type, targetArea: 15, storeysSpanned })
  if (!added.ok) throw new Error(added.problems.map((problem) => problem.message).join('; '))
  return added.value
}

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(17) })
})

describe('a storey more or less', () => {
  it('stretches a stair onto the storey the house gains, in the step that gains it', () => {
    const stair = add('stair')
    expect(addStorey(store).ok).toBe(true)
    expect(store.getState().storeys).toBe(2)
    expect(spanOf(stair)).toBe(2)
    expect(addStorey(store).ok).toBe(true)
    expect(spanOf(stair)).toBe(3)
  })

  it('brings a stair down again with the storey the house loses', () => {
    const stair = add('stair')
    addStorey(store)
    expect(removeStorey(store).ok).toBe(true)
    expect(store.getState().storeys).toBe(1)
    expect(spanOf(stair)).toBe(1)
  })

  it('reverts the storey and the stair together when the one undo is asked for', () => {
    const stair = add('stair')
    addStorey(store)
    store.undo()
    expect(spanOf(stair)).toBe(1)
  })

  it('leaves every other kind on the storey it stands on', () => {
    const bedroom = add('bedroom')
    addStorey(store)
    expect(spanOf(bedroom)).toBe(1)
    expect(store.getState().rooms.find((room) => room.id === bedroom)?.storey).toBe(0)
  })

  it('refuses the last storey, and a top storey another room still stands on', () => {
    expect(removeStorey(store)).toMatchObject({ ok: false })
    add('stair')
    addStorey(store)
    const bedroom = add('bedroom')
    store.actions.setStorey(bedroom, 1)
    expect(removeStorey(store)).toMatchObject({ ok: false })
    // The stair is not left short of the storey the refused step would have taken away.
    expect(store.getState().storeys).toBe(2)
    expect(spanOf(store.getState().rooms[0]!.id)).toBe(2)
  })
})
