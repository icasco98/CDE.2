import { createActions, type Actions, type Mode } from './actions'
import { checkProject } from './invariants'
import { createIdGenerator, type IdGenerator } from './ids'
import { emptyProject, restore, snapshotOf, type Snapshot } from './project'
import { ok, type Project, type Result } from './types'

const historyLimit = 100

export type Change = 'committed' | 'preview'

export type Listener = (project: Project, change: Change) => void

export type Store = {
  getState: () => Project
  subscribe: (listener: Listener) => () => void
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => boolean
  redo: () => boolean
  actions: Actions
}

export function createStore(initial?: Project, options: { newId?: IdGenerator } = {}): Store {
  const newId = options.newId ?? createIdGenerator()
  let project = initial ?? emptyProject(newId)
  let undone: Snapshot[] = []
  let redone: Snapshot[] = []
  /** The state a gesture started from, kept so its commit records one step for the whole drag. */
  let pending: Snapshot | null = null
  const listeners = new Set<Listener>()

  const announce = (change: Change) => listeners.forEach((listener) => listener(project, change))

  function settle(next: Project, mode: Mode = 'record'): Result {
    const problems = checkProject(next)
    if (problems.length > 0) return { ok: false, problems }
    if (mode === 'record') {
      undone = [...undone, pending ?? snapshotOf(project)].slice(-historyLimit)
      redone = []
      pending = null
    } else if (mode === 'preview') {
      pending ??= snapshotOf(project)
    }
    project = next
    announce(mode === 'preview' ? 'preview' : 'committed')
    return ok(undefined)
  }

  function reset(next: Project): Result {
    project = next
    undone = []
    redone = []
    pending = null
    announce('committed')
    return ok(undefined)
  }

  function step(from: Snapshot[], to: Snapshot[]): boolean {
    const snapshot = from[from.length - 1]
    if (!snapshot) return false
    from.pop()
    to.push(snapshotOf(project))
    project = restore(project, snapshot)
    pending = null
    announce('committed')
    return true
  }

  return {
    getState: () => project,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    canUndo: () => undone.length > 0,
    canRedo: () => redone.length > 0,
    undo: () => step(undone, redone),
    redo: () => step(redone, undone),
    actions: createActions({ project: () => project, settle, reset, newId }),
  }
}
