import { beforeEach, describe, expect, it } from 'vitest'
import { removedLinks } from '../../app/defaultLinks'
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
  edges: store.getState().edges.map((edge) => edge.kind),
  apart: store.getState().apart.length,
})

describe('a pair set from the matrix', () => {
  it('connects as a door, turns open, keeps apart beside the edge, and clears to nothing', () => {
    expect(setPair(store, kitchen, dining, 'door').ok).toBe(true)
    expect(state()).toEqual({ edges: ['door'], apart: 0 })
    setPair(store, dining, kitchen, 'open')
    expect(state()).toEqual({ edges: ['open'], apart: 0 })
    setPair(store, kitchen, dining, 'apart')
    expect(state()).toEqual({ edges: ['open'], apart: 1 })
    setPair(store, kitchen, dining, 'nothing')
    expect(state()).toEqual({ edges: [], apart: 0 })
    expect(removedLinks.holds(store.getState().id, kitchen, dining)).toBe(true)
  })

  it('toggles keep apart, and is one undo step each time', () => {
    setPair(store, kitchen, dining, 'door')
    setPair(store, kitchen, dining, 'apart')
    setPair(store, kitchen, dining, 'nothing')
    store.undo()
    expect(state()).toEqual({ edges: ['door'], apart: 1 })
    setPair(store, kitchen, dining, 'apart')
    expect(state()).toEqual({ edges: ['door'], apart: 0 })
  })
})
