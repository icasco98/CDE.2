import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator } from './ids'
import { startingHousehold } from './project'
import { createStore, type Store } from './store'
import { EXTERIOR, ok, type Result } from './types'

let store: Store

const id = (result: Result<string>): string => {
  if (!result.ok) throw new Error(result.problems.map((p) => p.message).join('; '))
  return result.value
}

const codes = (result: Result<unknown>): readonly string[] =>
  result.ok ? [] : result.problems.map((problem) => problem.code)

const addRoom = (type: string, extra: { storey?: number; storeysSpanned?: number } = {}): string =>
  id(store.actions.addRoom({ type, targetArea: 20, ...extra }))

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(7) })
})

describe('rooms', () => {
  it('adds a room with a target area and refuses one without', () => {
    const room = addRoom('bedroom')
    expect(store.getState().rooms.map((r) => r.id)).toEqual([room])
    expect(codes(store.actions.addRoom({ type: 'bedroom', targetArea: 0 }))).toEqual(['bad-area'])
  })

  it('refuses to work on a room that is not there', () => {
    expect(codes(store.actions.rename('ghost', 'Majlis'))).toEqual(['no-such-room'])
  })

  it('refuses a storey the project does not have', () => {
    const room = addRoom('bedroom')
    expect(codes(store.actions.setStorey(room, 1))).toEqual(['storey-range'])
    store.actions.addStorey()
    expect(store.actions.setStorey(room, 1).ok).toBe(true)
  })

  it('places and unplaces a room whole', () => {
    const room = addRoom('bedroom')
    const footprint = {
      polygon: [
        [0, 0],
        [4, 0],
        [4, 5],
      ] as const,
      rotation: 0,
    }
    expect(store.actions.place(room, footprint).ok).toBe(true)
    expect(store.getState().rooms[0]?.footprint).toEqual(footprint)
    store.actions.unplace(room)
    expect(store.getState().rooms[0]).not.toHaveProperty('footprint')
  })

  it('deletes a room with its edges and its place in every route', () => {
    const kitchen = addRoom('kitchen')
    const hall = addRoom('hall')
    store.actions.connect({ a: kitchen, b: hall, kind: 'door' })
    const actor = id(store.actions.addActor({ name: 'Cook', role: 'household' }))
    store.actions.addWaypoint(actor, hall)
    store.actions.addWaypoint(actor, kitchen)

    store.actions.removeRoom(kitchen)

    expect(store.getState().rooms.map((room) => room.id)).toEqual([hall])
    expect(store.getState().edges).toEqual([])
    expect(store.getState().actors[0]?.waypoints).toEqual([hall])
  })
})

describe('connect', () => {
  it('refuses a second edge between the same pair on one storey', () => {
    const a = addRoom('bedroom')
    const b = addRoom('bathroom')
    store.actions.connect({ a, b, kind: 'door' })
    expect(codes(store.actions.connect({ a: b, b: a, kind: 'open' }))).toEqual(['edge-duplicate'])
  })

  it('refuses a cross-storey edge unless a stair spans both', () => {
    store.actions.addStorey()
    const below = addRoom('kitchen')
    const above = addRoom('bedroom', { storey: 1 })
    expect(codes(store.actions.connect({ a: below, b: above, kind: 'door', storey: 1 }))).toEqual([
      'edge-storey',
    ])
    const stair = addRoom('stair', { storeysSpanned: 2 })
    expect(store.actions.connect({ a: stair, b: below, kind: 'open', storey: 0 }).ok).toBe(true)
    expect(store.actions.connect({ a: stair, b: above, kind: 'open', storey: 1 }).ok).toBe(true)
  })

  it('refuses a second main door', () => {
    const hall = addRoom('hall')
    const diwaniya = addRoom('diwaniya')
    expect(store.actions.connect({ a: EXTERIOR, b: hall, kind: 'main-door' }).ok).toBe(true)
    expect(codes(store.actions.connect({ a: EXTERIOR, b: diwaniya, kind: 'main-door' }))).toEqual([
      'main-door-count',
    ])
  })

  it('disconnects an edge and refuses one that is not there', () => {
    const a = addRoom('bedroom')
    const b = addRoom('bathroom')
    const edge = id(store.actions.connect({ a, b, kind: 'door' }))
    expect(store.actions.disconnect(edge).ok).toBe(true)
    expect(codes(store.actions.disconnect(edge))).toEqual(['no-such-edge'])
  })
})

describe('storeys', () => {
  it('removes only an empty top storey, and never the last one', () => {
    expect(codes(store.actions.removeStorey())).toEqual(['last-storey'])
    store.actions.addStorey()
    addRoom('bedroom', { storey: 1 })
    expect(codes(store.actions.removeStorey())).toEqual(['storey-in-use'])
    store.actions.removeRoom(store.getState().rooms[0]!.id)
    expect(store.actions.removeStorey().ok).toBe(true)
    expect(store.getState().storeys).toBe(1)
  })

  it('grows a stair standing on the ground onto every storey the house gains', () => {
    store.actions.addStorey()
    const stair = addRoom('stair', { storeysSpanned: 2 })
    const spanOf = (id: string): number | undefined =>
      store.getState().rooms.find((room) => room.id === id)?.storeysSpanned
    store.actions.addStorey()
    expect(spanOf(stair)).toBe(3)
    expect(store.actions.removeStorey().ok).toBe(true)
    expect(spanOf(stair)).toBe(2)
  })

  it('leaves a room that is not a stair on the storey it stands on', () => {
    store.actions.addStorey()
    const bedroom = addRoom('bedroom')
    store.actions.addStorey()
    expect(store.getState().rooms.find((room) => room.id === bedroom)?.storeysSpanned).toBe(1)
  })
})

describe('storey heights', () => {
  it('opens every storey at 3.5 m and carries the top height onto a new one', () => {
    expect(store.getState().heights).toEqual([3.5])
    store.actions.setHeight(0, 4.2)
    store.actions.addStorey()
    expect(store.getState().heights).toEqual([4.2, 4.2])
    store.actions.removeStorey()
    expect(store.getState().heights).toEqual([4.2])
  })

  it('refuses a height that is not a positive number of metres, and a storey that is not there', () => {
    expect(codes(store.actions.setHeight(0, 0))).toEqual(['height-size'])
    expect(codes(store.actions.setHeight(0, Number.NaN))).toEqual(['height-size'])
    expect(codes(store.actions.setHeight(1, 3))).toEqual(['no-such-storey'])
    expect(store.getState().heights).toEqual([3.5])
  })

  it('is undone one height at a time, and fits the storeys in hand', () => {
    store.actions.setHeight(0, 4)
    store.actions.addStorey()
    expect(store.getState().heights).toEqual([4, 4])
    store.undo()
    expect(store.getState().heights).toEqual([3.5, 3.5])
    expect(store.getState().storeys).toBe(2)
  })
})

describe('undo', () => {
  it('covers rooms, edges, plot, weights and household', () => {
    const room = addRoom('bedroom')
    store.actions.setPlot({ on: true, polygon: [], north: 30, street: [0] })
    store.actions.setWeights({ privacy: 0.8 })
    store.actions.setHousehold({ ...store.getState().household, bedrooms: 6 })
    store.actions.connect({ a: EXTERIOR, b: room, kind: 'main-door' })

    store.undo()
    expect(store.getState().edges).toEqual([])
    store.undo()
    expect(store.getState().household.bedrooms).toBe(startingHousehold.bedrooms)
    store.undo()
    expect(store.getState().weights).toEqual({})
    store.undo()
    expect(store.getState().plot.north).toBe(0)
    store.undo()
    expect(store.getState().rooms).toEqual([])
    expect(store.canUndo()).toBe(false)
  })

  it('leaves the project name alone', () => {
    addRoom('bedroom')
    store.actions.setName('Al Bidaa House')
    expect(store.getState().name).toBe('Al Bidaa House')
    store.undo()
    expect(store.getState().rooms).toEqual([])
    expect(store.getState().name).toBe('Al Bidaa House')
    expect(store.canUndo()).toBe(false)
  })

  it('leaves actors alone', () => {
    const room = addRoom('bedroom')
    const actor = id(store.actions.addActor({ name: 'Guest', role: 'visitor' }))
    store.actions.addWaypoint(actor, room)
    store.actions.updateActor(actor, { name: 'Neighbour' })

    expect(store.canUndo()).toBe(true)
    store.undo()

    expect(store.getState().rooms).toEqual([])
    expect(store.getState().actors[0]).toEqual({
      id: actor,
      name: 'Neighbour',
      role: 'visitor',
      waypoints: [room],
    })
  })

  it('leaves the storey count alone', () => {
    addRoom('bedroom')
    store.actions.addStorey()
    store.undo()
    expect(store.getState().rooms).toEqual([])
    expect(store.getState().storeys).toBe(2)
  })

  it('redoes what it undid, and forgets the redo after a new change', () => {
    const room = addRoom('bedroom')
    store.actions.rename(room, 'Majlis')
    store.undo()
    expect(store.getState().rooms[0]?.name).toBe('bedroom')
    store.redo()
    expect(store.getState().rooms[0]?.name).toBe('Majlis')
    store.undo()
    store.actions.setType(room, 'diwaniya')
    expect(store.canRedo()).toBe(false)
  })

  it('keeps a hundred steps', () => {
    const room = addRoom('bedroom')
    for (let i = 0; i < 150; i += 1) store.actions.rename(room, `name ${i}`)
    let steps = 0
    while (store.undo()) steps += 1
    expect(steps).toBe(100)
    expect(store.getState().rooms[0]?.name).toBe('name 49')
  })
})

describe('a gesture in flight', () => {
  it('previews without recording and records the whole drag when it commits', () => {
    const room = addRoom('bedroom')
    const changes: string[] = []
    store.subscribe((_project, change) => changes.push(change))

    store.actions.setBubble(room, { x: 1, y: 1 }, 'preview')
    store.actions.setBubble(room, { x: 2, y: 2 }, 'preview')
    expect(store.getState().rooms[0]?.bubble).toEqual({ x: 2, y: 2 })
    expect(changes).toEqual(['preview', 'preview'])

    store.actions.setBubble(room, { x: 3, y: 3 }, 'commit')
    expect(changes).toEqual(['preview', 'preview', 'committed'])

    store.undo()
    expect(store.getState().rooms[0]?.bubble).toBeUndefined()
    store.undo()
    expect(store.getState().rooms).toEqual([])
    expect(store.canUndo()).toBe(false)
  })
})

describe('a project opened from a file', () => {
  it('replaces the one in hand and starts its history again', () => {
    addRoom('bedroom')
    const opened = createStore(undefined, { newId: createIdGenerator(21) }).getState()
    expect(store.actions.load({ ...opened, name: 'Opened House' }).ok).toBe(true)
    expect(store.getState().name).toBe('Opened House')
    expect(store.getState().rooms).toEqual([])
    expect(store.canUndo()).toBe(false)
  })

  it('refuses one that breaks an invariant', () => {
    const opened = createStore(undefined, { newId: createIdGenerator(23) }).getState()
    const broken = {
      ...opened,
      edges: [{ id: 'edge_1', a: 'ghost', b: EXTERIOR, kind: 'door' as const, storey: 0 }],
    }
    expect(codes(store.actions.load(broken))).toContain('edge-endpoint-missing')
    expect(store.getState().rooms).toHaveLength(0)
  })
})

describe('several actions as one step', () => {
  it('records one undo step for the whole run', () => {
    addRoom('bedroom')
    const changes: string[] = []
    store.subscribe((_project, change) => changes.push(change))

    const done = store.transaction(() => {
      store.actions.addRoom({ type: 'kitchen', targetArea: 20 })
      store.actions.addRoom({ type: 'diwaniya', targetArea: 50 })
    })

    expect(done.ok).toBe(true)
    expect(changes).toEqual(['committed'])
    expect(store.getState().rooms).toHaveLength(3)
    store.undo()
    expect(store.getState().rooms).toHaveLength(1)
    store.redo()
    expect(store.getState().rooms).toHaveLength(3)
  })

  it('keeps none of it when one action is refused', () => {
    const room = addRoom('bedroom')
    const refused = store.transaction(() => {
      store.actions.rename(room, 'Majlis')
      return store.actions.setTargetArea(room, 0)
    })

    expect(codes(refused)).toEqual(['bad-area'])
    expect(store.getState().rooms[0]?.name).toBe('bedroom')
    store.undo()
    expect(store.getState().rooms).toEqual([])
    expect(store.canUndo()).toBe(false)
  })

  it('keeps none of it when an action inside is refused and the run ignores it', () => {
    const room = addRoom('bedroom')
    store.transaction(() => {
      store.actions.rename(room, 'Majlis')
      store.actions.setStorey(room, 4)
      return ok(undefined)
    })

    expect(store.getState().rooms[0]?.name).toBe('bedroom')
  })

  it('refuses to run inside another one, and rolls back when the run throws', () => {
    const room = addRoom('bedroom')
    expect(codes(store.transaction(() => store.transaction(() => undefined)))).toEqual([
      'inside-transaction',
    ])
    expect(() =>
      store.transaction(() => {
        store.actions.rename(room, 'Majlis')
        throw new Error('the run gave up')
      }),
    ).toThrow('the run gave up')
    expect(store.getState().rooms[0]?.name).toBe('bedroom')
  })
})
