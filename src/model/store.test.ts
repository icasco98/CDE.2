import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator } from './ids'
import { checkProject } from './invariants'
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

const addZone = (type: string, extra: { storey?: number; storeysSpanned?: number } = {}): string =>
  id(store.actions.addZone({ type, targetArea: 20, ...extra }))

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(7) })
})

describe('zones', () => {
  it('adds a zone with a target area and refuses one without', () => {
    const zone = addZone('bedroom')
    expect(store.getState().zones.map((r) => r.id)).toEqual([zone])
    expect(codes(store.actions.addZone({ type: 'bedroom', targetArea: 0 }))).toEqual(['bad-area'])
  })

  it('refuses to work on a zone that is not there', () => {
    expect(codes(store.actions.rename('ghost', 'Majlis'))).toEqual(['no-such-zone'])
  })

  it('refuses a storey the project does not have', () => {
    const zone = addZone('bedroom')
    expect(codes(store.actions.setStorey(zone, 1))).toEqual(['storey-range'])
    store.actions.addStorey()
    expect(store.actions.setStorey(zone, 1).ok).toBe(true)
  })

  it('places and unplaces a zone whole', () => {
    const zone = addZone('bedroom')
    const footprint = {
      polygon: [
        [0, 0],
        [4, 0],
        [4, 5],
      ] as const,
      rotation: 0,
    }
    expect(store.actions.place(zone, footprint).ok).toBe(true)
    expect(store.getState().zones[0]?.footprint).toEqual(footprint)
    store.actions.unplace(zone)
    expect(store.getState().zones[0]).not.toHaveProperty('footprint')
  })

  it('deletes a zone with its connections and its place in every route', () => {
    const kitchen = addZone('kitchen')
    const hall = addZone('hall')
    store.actions.connect({ a: kitchen, b: hall, kind: 'door' })
    const actor = id(store.actions.addActor({ name: 'Cook', role: 'household' }))
    store.actions.addWaypoint(actor, hall)
    store.actions.addWaypoint(actor, kitchen)

    store.actions.removeZone(kitchen)

    expect(store.getState().zones.map((zone) => zone.id)).toEqual([hall])
    expect(store.getState().connections).toEqual([])
    expect(store.getState().actors[0]?.waypoints).toEqual([hall])
  })
})

describe('keep apart', () => {
  it('keeps two zones apart and lets them together again, each one step to undo', () => {
    const diwaniya = addZone('diwaniya')
    const family = addZone('family-living')
    const pair = id(store.actions.keepApart({ a: diwaniya, b: family }))
    expect(store.getState().apart).toEqual([{ id: pair, a: diwaniya, b: family }])
    expect(codes(store.actions.keepApart({ a: family, b: diwaniya }))).toEqual(['apart-duplicate'])
    // Connecting a pair kept apart is a warning for the checks, never a refusal.
    expect(store.actions.connect({ a: diwaniya, b: family, kind: 'door' }).ok).toBe(true)
    store.undo()
    expect(store.actions.allowTogether(pair).ok).toBe(true)
    expect(store.getState().apart).toEqual([])
    store.undo()
    expect(store.getState().apart).toHaveLength(1)
    expect(codes(store.actions.allowTogether('apart_none'))).toEqual(['no-such-pair'])
  })

  it('goes with either of its zones', () => {
    const maid = addZone('maid-room')
    const master = addZone('master-bedroom')
    store.actions.keepApart({ a: maid, b: master })
    store.actions.removeZone(master)
    expect(store.getState().apart).toEqual([])
  })
})

describe('declined suggestions', () => {
  it('keeps a pair once, forgets one zone’s or all, and goes with its zone', () => {
    const kitchen = addZone('kitchen')
    const dining = addZone('dining-room')
    store.actions.decline(kitchen, dining)
    store.actions.decline(dining, kitchen)
    store.actions.decline(dining, EXTERIOR)
    expect(store.getState().declined).toEqual([
      { a: kitchen, b: dining },
      { a: dining, b: EXTERIOR },
    ])
    store.actions.forgetDeclined(kitchen)
    expect(store.getState().declined).toEqual([{ a: dining, b: EXTERIOR }])
    store.actions.decline(kitchen, dining)
    store.actions.removeZone(kitchen)
    expect(store.getState().declined).toEqual([{ a: dining, b: EXTERIOR }])
    store.actions.forgetDeclined()
    expect(store.getState().declined).toEqual([])
  })
})

describe('connect', () => {
  it('refuses a second connection between the same pair on one storey', () => {
    const a = addZone('bedroom')
    const b = addZone('bathroom')
    store.actions.connect({ a, b, kind: 'door' })
    expect(codes(store.actions.connect({ a: b, b: a, kind: 'open' }))).toEqual([
      'connection-duplicate',
    ])
  })

  it('refuses a cross-storey connection unless a stair spans both', () => {
    store.actions.addStorey()
    const below = addZone('kitchen')
    const above = addZone('bedroom', { storey: 1 })
    expect(codes(store.actions.connect({ a: below, b: above, kind: 'door', storey: 1 }))).toEqual([
      'connection-storey',
    ])
    const stair = addZone('stair', { storeysSpanned: 2 })
    expect(store.actions.connect({ a: stair, b: below, kind: 'open', storey: 0 }).ok).toBe(true)
    expect(store.actions.connect({ a: stair, b: above, kind: 'open', storey: 1 }).ok).toBe(true)
  })

  it('refuses a second main door', () => {
    const hall = addZone('hall')
    const diwaniya = addZone('diwaniya')
    expect(store.actions.connect({ a: EXTERIOR, b: hall, kind: 'main-door' }).ok).toBe(true)
    expect(codes(store.actions.connect({ a: EXTERIOR, b: diwaniya, kind: 'main-door' }))).toEqual([
      'main-door-count',
    ])
  })

  it('changes a connection kind in place, keeping the same connection', () => {
    const a = addZone('bedroom')
    const b = addZone('bathroom')
    const connection = id(store.actions.connect({ a, b, kind: 'door' }))
    expect(store.actions.setConnectionKind(connection, 'open').ok).toBe(true)
    expect(store.getState().connections).toEqual([
      { id: connection, a, b, kind: 'open', storey: 0 },
    ])
    store.undo()
    expect(store.getState().connections[0]?.kind).toBe('door')
  })

  it('refuses a kind for a connection that is not there, and refuses the main door either way', () => {
    const hall = addZone('hall')
    const diwaniya = addZone('diwaniya')
    expect(codes(store.actions.setConnectionKind('ghost', 'open'))).toEqual(['no-such-connection'])
    const main = id(store.actions.connect({ a: EXTERIOR, b: hall, kind: 'main-door' }))
    const inside = id(store.actions.connect({ a: hall, b: diwaniya, kind: 'door' }))
    expect(codes(store.actions.setConnectionKind(main, 'door'))).toEqual(['main-door-kind'])
    expect(codes(store.actions.setConnectionKind(inside, 'main-door'))).toEqual(['main-door-kind'])
    expect(store.getState().connections.map((connection) => connection.kind)).toEqual([
      'main-door',
      'door',
    ])
  })

  it('disconnects a connection and refuses one that is not there', () => {
    const a = addZone('bedroom')
    const b = addZone('bathroom')
    const connection = id(store.actions.connect({ a, b, kind: 'door' }))
    expect(store.actions.disconnect(connection).ok).toBe(true)
    expect(codes(store.actions.disconnect(connection))).toEqual(['no-such-connection'])
  })
})

describe('storeys', () => {
  it('removes only an empty top storey, and never the last one', () => {
    expect(codes(store.actions.removeStorey())).toEqual(['last-storey'])
    store.actions.addStorey()
    addZone('bedroom', { storey: 1 })
    expect(codes(store.actions.removeStorey())).toEqual(['storey-in-use'])
    store.actions.removeZone(store.getState().zones[0]!.id)
    expect(store.actions.removeStorey().ok).toBe(true)
    expect(store.getState().storeys).toBe(1)
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

  it('is undone one height at a time, with the storeys the height belonged to', () => {
    store.actions.setHeight(0, 4)
    store.actions.addStorey()
    expect(store.getState().heights).toEqual([4, 4])
    store.undo()
    expect(store.getState().heights).toEqual([4])
    expect(store.getState().storeys).toBe(1)
    store.undo()
    expect(store.getState().heights).toEqual([3.5])
    expect(store.getState().storeys).toBe(1)
  })
})

describe('undo', () => {
  it('covers zones, connections, declined suggestions, plot, storeys and household', () => {
    const zone = addZone('bedroom')
    store.actions.addStorey()
    store.actions.setPlot({ on: true, polygon: [], north: 30, street: [0] })
    store.actions.decline(zone, EXTERIOR)
    store.actions.setHousehold({ ...store.getState().household, bedrooms: 6 })
    store.actions.connect({ a: EXTERIOR, b: zone, kind: 'main-door' })

    store.undo()
    expect(store.getState().connections).toEqual([])
    store.undo()
    expect(store.getState().household.bedrooms).toBe(startingHousehold.bedrooms)
    store.undo()
    expect(store.getState().declined).toEqual([])
    store.undo()
    expect(store.getState().plot.north).toBe(0)
    store.undo()
    expect(store.getState().storeys).toBe(1)
    store.undo()
    expect(store.getState().zones).toEqual([])
    expect(store.canUndo()).toBe(false)
  })

  it('leaves the project name alone', () => {
    addZone('bedroom')
    store.actions.setName('Al Bidaa House')
    expect(store.getState().name).toBe('Al Bidaa House')
    store.undo()
    expect(store.getState().zones).toEqual([])
    expect(store.getState().name).toBe('Al Bidaa House')
    expect(store.canUndo()).toBe(false)
  })

  it('leaves actors alone', () => {
    const zone = addZone('bedroom')
    const actor = id(store.actions.addActor({ name: 'Guest', role: 'visitor' }))
    store.actions.addWaypoint(actor, zone)
    store.actions.updateActor(actor, { name: 'Neighbour' })

    expect(store.canUndo()).toBe(true)
    store.undo()

    expect(store.getState().zones).toEqual([])
    expect(store.getState().actors[0]).toEqual({
      id: actor,
      name: 'Neighbour',
      role: 'visitor',
      waypoints: [zone],
    })
  })

  it('covers the storey count, and its heights with it', () => {
    addZone('bedroom')
    store.actions.addStorey()
    expect(store.getState().storeys).toBe(2)
    store.undo()
    expect(store.getState().storeys).toBe(1)
    expect(store.getState().heights).toEqual([3.5])
    expect(store.getState().zones).toHaveLength(1)
    store.undo()
    expect(store.getState().zones).toEqual([])
    expect(store.getState().storeys).toBe(1)
  })

  it('takes a removed storey back, with the height it stood at', () => {
    store.actions.addStorey()
    store.actions.setHeight(1, 2.8)
    expect(store.actions.removeStorey().ok).toBe(true)
    expect(store.getState()).toMatchObject({ storeys: 1, heights: [3.5] })
    store.undo()
    expect(store.getState()).toMatchObject({ storeys: 2, heights: [3.5, 2.8] })
    store.redo()
    expect(store.getState()).toMatchObject({ storeys: 1, heights: [3.5] })
  })

  it('walks back through two storeys added one after the other, and forward again', () => {
    store.actions.addStorey()
    store.actions.addStorey()
    expect(store.getState().storeys).toBe(3)
    store.undo()
    expect(store.getState()).toMatchObject({ storeys: 2, heights: [3.5, 3.5] })
    store.undo()
    expect(store.getState()).toMatchObject({ storeys: 1, heights: [3.5] })
    expect(store.canUndo()).toBe(false)
    store.redo()
    expect(store.getState().storeys).toBe(2)
    store.redo()
    expect(store.getState().storeys).toBe(3)
  })

  it('redoes what it undid, and forgets the redo after a new change', () => {
    const zone = addZone('bedroom')
    store.actions.rename(zone, 'Majlis')
    store.undo()
    expect(store.getState().zones[0]?.name).toBe('bedroom')
    store.redo()
    expect(store.getState().zones[0]?.name).toBe('Majlis')
    store.undo()
    store.actions.setType(zone, 'diwaniya')
    expect(store.canRedo()).toBe(false)
  })

  it('leaves a project every check passes at every step back and forward', () => {
    const stair = addZone('stair')
    store.actions.addStorey()
    store.actions.setStorey(stair, 0, 2)
    const upstairs = addZone('bedroom', { storey: 1 })
    store.actions.connect({ a: stair, b: upstairs, kind: 'open', storey: 1 })
    store.actions.setHeight(1, 3)
    store.actions.addStorey()

    const sound = (): void => {
      const project = store.getState()
      expect(checkProject(project)).toEqual([])
      expect(project.heights).toHaveLength(project.storeys)
      for (const zone of project.zones)
        expect(zone.storey + zone.storeysSpanned).toBeLessThanOrEqual(project.storeys)
    }

    sound()
    let steps = 0
    while (store.undo()) {
      sound()
      steps += 1
    }
    expect(steps).toBe(7)
    while (store.redo()) sound()
    expect(store.getState().storeys).toBe(3)
  })

  it('keeps a hundred steps', () => {
    const zone = addZone('bedroom')
    for (let i = 0; i < 150; i += 1) store.actions.rename(zone, `name ${i}`)
    let steps = 0
    while (store.undo()) steps += 1
    expect(steps).toBe(100)
    expect(store.getState().zones[0]?.name).toBe('name 49')
  })
})

describe('a gesture in flight', () => {
  it('previews without recording and records the whole drag when it commits', () => {
    const zone = addZone('bedroom')
    const changes: string[] = []
    store.subscribe((_project, change) => changes.push(change))

    store.actions.setBubble(zone, { x: 1, y: 1 }, 'preview')
    store.actions.setBubble(zone, { x: 2, y: 2 }, 'preview')
    expect(store.getState().zones[0]?.bubble).toEqual({ x: 2, y: 2 })
    expect(changes).toEqual(['preview', 'preview'])

    store.actions.setBubble(zone, { x: 3, y: 3 }, 'commit')
    expect(changes).toEqual(['preview', 'preview', 'committed'])

    store.undo()
    expect(store.getState().zones[0]?.bubble).toBeUndefined()
    store.undo()
    expect(store.getState().zones).toEqual([])
    expect(store.canUndo()).toBe(false)
  })
})

describe('a project opened from a file', () => {
  it('replaces the one in hand and starts its history again', () => {
    addZone('bedroom')
    const opened = createStore(undefined, { newId: createIdGenerator(21) }).getState()
    expect(store.actions.load({ ...opened, name: 'Opened House' }).ok).toBe(true)
    expect(store.getState().name).toBe('Opened House')
    expect(store.getState().zones).toEqual([])
    expect(store.canUndo()).toBe(false)
  })

  it('refuses one that breaks an invariant', () => {
    const opened = createStore(undefined, { newId: createIdGenerator(23) }).getState()
    const broken = {
      ...opened,
      connections: [
        { id: 'connection_1', a: 'ghost', b: EXTERIOR, kind: 'door' as const, storey: 0 },
      ],
    }
    expect(codes(store.actions.load(broken))).toContain('connection-endpoint-missing')
    expect(store.getState().zones).toHaveLength(0)
  })
})

describe('several actions as one step', () => {
  it('records one undo step for the whole run', () => {
    addZone('bedroom')
    const changes: string[] = []
    store.subscribe((_project, change) => changes.push(change))

    const done = store.transaction(() => {
      store.actions.addZone({ type: 'kitchen', targetArea: 20 })
      store.actions.addZone({ type: 'diwaniya', targetArea: 50 })
    })

    expect(done.ok).toBe(true)
    expect(changes).toEqual(['committed'])
    expect(store.getState().zones).toHaveLength(3)
    store.undo()
    expect(store.getState().zones).toHaveLength(1)
    store.redo()
    expect(store.getState().zones).toHaveLength(3)
  })

  it('keeps none of it when one action is refused', () => {
    const zone = addZone('bedroom')
    const refused = store.transaction(() => {
      store.actions.rename(zone, 'Majlis')
      return store.actions.setTargetArea(zone, 0)
    })

    expect(codes(refused)).toEqual(['bad-area'])
    expect(store.getState().zones[0]?.name).toBe('bedroom')
    store.undo()
    expect(store.getState().zones).toEqual([])
    expect(store.canUndo()).toBe(false)
  })

  it('keeps none of it when an action inside is refused and the run ignores it', () => {
    const zone = addZone('bedroom')
    store.transaction(() => {
      store.actions.rename(zone, 'Majlis')
      store.actions.setStorey(zone, 4)
      return ok(undefined)
    })

    expect(store.getState().zones[0]?.name).toBe('bedroom')
  })

  it('refuses to run inside another one, and rolls back when the run throws', () => {
    const zone = addZone('bedroom')
    expect(codes(store.transaction(() => store.transaction(() => undefined)))).toEqual([
      'inside-transaction',
    ])
    expect(() =>
      store.transaction(() => {
        store.actions.rename(zone, 'Majlis')
        throw new Error('the run gave up')
      }),
    ).toThrow('the run gave up')
    expect(store.getState().zones[0]?.name).toBe('bedroom')
  })
})
