import { createActions, type Actions, type Mode } from './actions'
import { checkProject } from './invariants'
import { createIdGenerator, type IdGenerator } from './ids'
import { emptyProject, restore, snapshotOf, type Snapshot } from './project'
import { ok, refused, type Project, type Result } from './types'

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
  /** Runs several actions as one undo step, and keeps none of them if any is refused. */
  transaction: (run: () => Result | void) => Result
  actions: Actions
}

export function createStore(initial?: Project, options: { newId?: IdGenerator } = {}): Store {
  const newId = options.newId ?? createIdGenerator()
  let project = initial ?? emptyProject(newId)
  let undone: Snapshot[] = []
  let redone: Snapshot[] = []
  /** The state a gesture started from, kept so its commit records one step for the whole drag. */
  let pending: Snapshot | null = null
  /** While a transaction runs its actions change the project without recording or announcing. */
  let inside = false
  let refusal: Result | null = null
  const listeners = new Set<Listener>()

  const announce = (change: Change) => listeners.forEach((listener) => listener(project, change))

  function settle(next: Project, mode: Mode = 'record'): Result {
    const problems = checkProject(next)
    if (problems.length > 0) {
      const stopped = { ok: false, problems } as const
      if (inside) refusal ??= stopped
      return stopped
    }
    if (inside) {
      project = next
      return ok(undefined)
    }
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

  function transaction(run: () => Result | void): Result {
    if (inside)
      return refused({ code: 'inside-transaction', message: 'a transaction is already running' })
    const before = project
    const started = pending ?? snapshotOf(project)
    inside = true
    refusal = null
    let returned: Result | void
    try {
      returned = run()
    } catch (error) {
      inside = false
      project = before
      throw error
    }
    inside = false
    const stopped = refusal ?? (returned && !returned.ok ? returned : null)
    if (stopped) {
      project = before
      announce('committed')
      return stopped
    }
    if (project === before) return ok(undefined)
    undone = [...undone, started].slice(-historyLimit)
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
    transaction,
    actions: createActions({ project: () => project, settle, reset, newId }),
  }
}
