import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdGenerator } from './ids'
import {
  attachAutosave,
  autosaveKey,
  clearAutosaved,
  deserialize,
  loadAutosaved,
  serialize,
  type Storage,
} from './persistence'
import { startingHousehold } from './project'
import { createStore } from './store'
import { EXTERIOR, PROJECT_VERSION, type Project, type Result, type Violation } from './types'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join('; '))
  return result.value
}

function fakeStorage(fail?: 'read' | 'write'): Storage & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => {
      if (fail === 'read') throw new Error('private mode')
      return items.get(key) ?? null
    },
    setItem: (key, value) => {
      if (fail === 'write') throw new Error('quota exceeded')
      items.set(key, value)
    },
    removeItem: (key) => {
      items.delete(key)
    },
  }
}

function furnished(): Project {
  const store = createStore(undefined, { newId: createIdGenerator(11) })
  const { actions } = store
  actions.addStorey()
  const hall = must(actions.addRoom({ type: 'hall', targetArea: 18, name: 'Entrance' }))
  const stair = must(actions.addRoom({ type: 'stair', targetArea: 9, storeysSpanned: 2 }))
  const bedroom = must(actions.addRoom({ type: 'bedroom', targetArea: 20, storey: 1 }))
  actions.place(hall, {
    polygon: [
      [0, 0],
      [4, 0],
      [4, 4.5],
      [0, 4.5],
    ],
    rotation: 15,
  })
  actions.setBubble(stair, { x: 3.5, y: -2 })
  actions.pin(bedroom)
  actions.connect({ a: EXTERIOR, b: hall, kind: 'main-door', hint: { at: [2, 0] } })
  actions.connect({ a: hall, b: stair, kind: 'open' })
  actions.connect({ a: stair, b: bedroom, kind: 'door', storey: 1 })
  actions.setPlot({
    on: true,
    polygon: [
      [0, 0],
      [20, 0],
      [20, 25],
      [0, 25],
    ],
    north: 42.5,
    street: [0, 3],
  })
  actions.setWeights({ privacy: 0.7, compactness: 0.35 })
  const actor = must(actions.addActor({ name: 'Guest', role: 'visitor' }))
  actions.addWaypoint(actor, hall)
  return store.getState()
}

describe('the project file', () => {
  it('round trips', () => {
    const project = furnished()
    const back = deserialize(serialize(project))
    expect(back.ok && back.value).toEqual(project)
  })

  it('carries the version', () => {
    expect(JSON.parse(serialize(furnished())).version).toBe(PROJECT_VERSION)
  })

  it('refuses what is not JSON', () => {
    expect(deserialize('{oops')).toMatchObject({ ok: false })
  })

  it('names the field that is wrong', () => {
    const document = { ...furnished(), storeys: 'two' }
    const back = deserialize(JSON.stringify(document))
    expect(back.ok ? [] : back.problems.map((p) => p.message)).toContain('storeys is not a number')
  })

  it('refuses a plot boundary that is not a yes or a no', () => {
    const document = { ...furnished(), plot: { ...furnished().plot, on: 'yes' } }
    const back = deserialize(JSON.stringify(document))
    expect(back.ok ? [] : back.problems.map((p) => p.message)).toContain(
      'plot.on is not true or false',
    )
  })

  it('refuses a document that breaks an invariant', () => {
    const project = furnished()
    const document = { ...project, edges: [...project.edges, project.edges[1]] }
    const back = deserialize(JSON.stringify(document))
    expect(back.ok ? [] : back.problems.map((p) => p.code)).toEqual(['edge-duplicate'])
  })

  it('gives a document written before households the household a project starts with', () => {
    const document: Record<string, unknown> = { ...furnished(), version: 1 }
    delete document.household
    const back = deserialize(JSON.stringify(document))
    expect(back.ok && back.value.household).toEqual(startingHousehold)
    expect(back.ok && back.value.version).toBe(PROJECT_VERSION)
  })

  it('leaves the household of a document that already carries one', () => {
    const project = { ...furnished(), household: { ...startingHousehold, bedrooms: 7 } }
    const back = deserialize(JSON.stringify(project))
    expect(back.ok && back.value.household.bedrooms).toBe(7)
  })

  it('maps the placeholder weights to the three families and drops the budget key', () => {
    const project = furnished()
    const document = {
      ...project,
      version: 2,
      weights: { client: 0.8, climate: 0.2, budget: 0.4 },
    }
    const back = deserialize(JSON.stringify(document))
    expect(back.ok && back.value.weights).toEqual({
      userRequirements: 0.8,
      environmentalFactors: 0.2,
    })
    expect(back.ok && back.value.version).toBe(PROJECT_VERSION)
  })

  it('migrates a version 1 document with placeholder weights through both steps', () => {
    const project = furnished()
    const document: Record<string, unknown> = {
      ...project,
      version: 1,
      weights: { client: 0.6, climate: 0.1, budget: 0.9 },
    }
    delete document.household
    const back = deserialize(JSON.stringify(document))
    expect(back.ok && back.value.household).toEqual(startingHousehold)
    expect(back.ok && back.value.weights).toEqual({
      userRequirements: 0.6,
      environmentalFactors: 0.1,
    })
    expect(back.ok && back.value.version).toBe(PROJECT_VERSION)
  })

  it('refuses a version it cannot migrate and one from a newer tool', () => {
    const project = furnished()
    expect(deserialize(JSON.stringify({ ...project, version: 0 }))).toMatchObject({
      ok: false,
      problems: [{ code: 'unknown-version' }],
    })
    expect(deserialize(JSON.stringify({ ...project, version: PROJECT_VERSION + 1 }))).toMatchObject(
      {
        ok: false,
        problems: [{ code: 'newer-version' }],
      },
    )
  })
})

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes once after the changes stop', () => {
    const store = createStore(undefined, { newId: createIdGenerator(3) })
    const storage = fakeStorage()
    const stop = attachAutosave(store, storage, 500)

    store.actions.addRoom({ type: 'bedroom', targetArea: 20 })
    store.actions.addRoom({ type: 'kitchen', targetArea: 14 })
    vi.advanceTimersByTime(499)
    expect(storage.items.size).toBe(0)

    vi.advanceTimersByTime(1)
    const saved = loadAutosaved(storage)
    expect(saved?.rooms).toHaveLength(2)

    stop()
    store.actions.addRoom({ type: 'majlis', targetArea: 30 })
    vi.advanceTimersByTime(1000)
    expect(loadAutosaved(storage)?.rooms).toHaveLength(2)
  })

  it('does not write while a gesture is only previewing', () => {
    const store = createStore(undefined, { newId: createIdGenerator(5) })
    const storage = fakeStorage()
    attachAutosave(store, storage, 100)
    const room = must(store.actions.addRoom({ type: 'bedroom', targetArea: 20 }))
    vi.advanceTimersByTime(100)
    storage.items.delete(autosaveKey)

    store.actions.setBubble(room, { x: 1, y: 1 }, 'preview')
    vi.advanceTimersByTime(1000)
    expect(storage.items.size).toBe(0)

    store.actions.setBubble(room, { x: 1, y: 1 }, 'commit')
    vi.advanceTimersByTime(100)
    expect(storage.items.size).toBe(1)
  })

  it('reports a storage failure instead of throwing', () => {
    const store = createStore(undefined, { newId: createIdGenerator(9) })
    const problems: Violation[] = []
    attachAutosave(store, fakeStorage('write'), 10, (problem) => problems.push(problem))

    store.actions.addRoom({ type: 'bedroom', targetArea: 20 })
    expect(() => vi.advanceTimersByTime(10)).not.toThrow()
    expect(problems.map((problem) => problem.code)).toEqual(['storage'])
  })
})

describe('reading what was saved', () => {
  it('gives nothing when nothing is saved', () => {
    expect(loadAutosaved(fakeStorage())).toBeNull()
  })

  it('reports a storage that will not be read', () => {
    const problems: Violation[] = []
    expect(loadAutosaved(fakeStorage('read'), (problem) => problems.push(problem))).toBeNull()
    expect(problems.map((problem) => problem.code)).toEqual(['storage'])
  })

  it('reports a saved document it cannot read, and forgets it when asked', () => {
    const storage = fakeStorage()
    storage.setItem(autosaveKey, '{"rooms": 3}')
    const problems: Violation[] = []
    expect(loadAutosaved(storage, (problem) => problems.push(problem))).toBeNull()
    expect(problems.length).toBeGreaterThan(0)
    clearAutosaved(storage)
    expect(storage.items.size).toBe(0)
  })
})
