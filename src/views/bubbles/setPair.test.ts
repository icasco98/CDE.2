import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, type Store } from '../../model'
import { setPair } from './setPair'

let store: Store
let kitchen: string
let dining: string

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(3) })
  const add = (type: string) => {
    const made = store.actions.addRoom({ type, targetArea: 20 })
    if (!made.ok) throw new Error('refused')
    return made.value
  }
  kitchen = add('kitchen')
  dining = add('dining-room')
})

const state = () => ({
  connections: store.getState().connections.map((connection) => connection.kind),
  apart: store.getState().apart.length,
})

describe('a pair set from the matrix', () => {
  it('connects as a door, turns open, keeps apart beside the connection, and clears to nothing', () => {
    expect(setPair(store, kitchen, dining, 'door').ok).toBe(true)
    expect(state()).toEqual({ connections: ['door'], apart: 0 })
    setPair(store, dining, kitchen, 'open')
    expect(state()).toEqual({ connections: ['open'], apart: 0 })
    setPair(store, kitchen, dining, 'apart')
    expect(state()).toEqual({ connections: ['open'], apart: 1 })
    setPair(store, kitchen, dining, 'nothing')
    expect(state()).toEqual({ connections: [], apart: 0 })
    // The rulebook suggests a kitchen beside the dining room, so taking it out is kept as declined.
    expect(store.getState().declined).toEqual([{ a: kitchen, b: dining }])
  })

  it('toggles keep apart, and is one undo step each time', () => {
    setPair(store, kitchen, dining, 'door')
    setPair(store, kitchen, dining, 'apart')
    setPair(store, kitchen, dining, 'nothing')
    store.undo()
    expect(state()).toEqual({ connections: ['door'], apart: 1 })
    setPair(store, kitchen, dining, 'apart')
    expect(state()).toEqual({ connections: ['door'], apart: 0 })
  })
})
