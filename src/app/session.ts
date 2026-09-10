import {
  attachAutosave,
  createStore,
  type Change,
  loadAutosaved,
  type Listener,
  type Project,
  type Storage,
  type Store,
  type Violation,
} from '../model'
import { startingHousehold, type Household } from '../rulebook'
import { browserStorage } from './storage'

const autosaveMs = 500

/** The model stores no household, so the app keeps it beside the project under its own key. */
const householdKey = 'cde.household'

export type Message = { readonly id: string; readonly text: string }

export type Session = Store & {
  readonly household: () => Household
  readonly setHousehold: (household: Household) => void
  readonly setName: (name: string) => void
  readonly open: (project: Project) => void
  readonly messages: () => readonly Message[]
  readonly say: (text: string) => void
  readonly dismiss: (id: string) => void
}

function readHousehold(storage: Storage): Household {
  try {
    const raw = storage.getItem(householdKey)
    if (raw === null) return startingHousehold
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return startingHousehold
    const held = parsed as Record<string, unknown>
    const count = (key: keyof Household, fallback: number): number => {
      const value = held[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }
    const flag = (key: keyof Household, fallback: boolean): boolean => {
      const value = held[key]
      return typeof value === 'boolean' ? value : fallback
    }
    return {
      familySize: count('familySize', startingHousehold.familySize),
      bedrooms: count('bedrooms', startingHousehold.bedrooms),
      cars: count('cars', startingHousehold.cars),
      maid: flag('maid', startingHousehold.maid),
      driver: flag('driver', startingHousehold.driver),
      womensReception: flag('womensReception', startingHousehold.womensReception),
    }
  } catch {
    return startingHousehold
  }
}

function createSession(storage: Storage): Session {
  const listeners = new Set<Listener>()
  const notify = (project: Project, change: Change = 'committed'): void =>
    listeners.forEach((listener) => listener(project, change))

  let announced: readonly Message[] = []
  let counter = 0
  const report = (problem: Violation): void => {
    announced = [...announced, { id: `message-${(counter += 1)}`, text: problem.message }]
  }

  let store = createStore(loadAutosaved(storage, report) ?? undefined)
  let held = readHousehold(storage)
  /** The model has no action for the project's name, so the app holds it outside undo. */
  let renamed: string | null = null
  let openedId = store.getState().id
  let current = store.getState()

  const compose = (project: Project): Project =>
    renamed === null || renamed === project.name ? project : { ...project, name: renamed }

  const follow = (project: Project): void => {
    if (project.id !== openedId) {
      openedId = project.id
      renamed = null
    }
    current = compose(project)
  }

  let unbridge = store.subscribe((project, change) => {
    follow(project)
    notify(current, change)
  })

  const session: Session = {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    canUndo: () => store.canUndo(),
    canRedo: () => store.canRedo(),
    undo: () => store.undo(),
    redo: () => store.redo(),
    get actions() {
      return store.actions
    },
    household: () => held,
    setHousehold(household) {
      held = household
      try {
        storage.setItem(householdKey, JSON.stringify(household))
      } catch (error) {
        report({ code: 'storage', message: `browser storage refused: ${String(error)}` })
      }
      notify(current)
    },
    setName(name) {
      renamed = name
      current = compose(store.getState())
      notify(current)
    },
    open(project) {
      unbridge()
      store = createStore(project)
      openedId = project.id
      renamed = null
      current = store.getState()
      unbridge = store.subscribe((next, change) => {
        follow(next)
        notify(current, change)
      })
      notify(current)
    },
    messages: () => announced,
    say(text) {
      report({ code: 'said', message: text })
      notify(current)
    },
    dismiss(id) {
      announced = announced.filter((message) => message.id !== id)
      notify(current)
    },
  }

  attachAutosave(session, storage, autosaveMs, report)
  return session
}

export const session = createSession(browserStorage())
