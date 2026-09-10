import { attachAutosave, createStore, loadAutosaved, type Store, type Violation } from '../model'
import { browserStorage } from './storage'

const autosaveMs = 500

export type Message = { readonly id: string; readonly text: string }

export type Session = Omit<Store, 'subscribe'> & {
  readonly subscribe: (listener: () => void) => () => void
  readonly messages: () => readonly Message[]
  readonly say: (text: string) => void
  readonly dismiss: (id: string) => void
}

function createSession(): Session {
  const storage = browserStorage()
  const listeners = new Set<() => void>()
  const changed = (): void => listeners.forEach((listener) => listener())

  let announced: readonly Message[] = []
  let counter = 0
  const report = (problem: Violation): void => {
    announced = [...announced, { id: `message-${(counter += 1)}`, text: problem.message }]
    changed()
  }

  const store = createStore(loadAutosaved(storage, report) ?? undefined)
  attachAutosave(store, storage, autosaveMs, report)
  store.subscribe(changed)

  return {
    ...store,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    messages: () => announced,
    say: (text) => report({ code: 'said', message: text }),
    dismiss(id) {
      announced = announced.filter((message) => message.id !== id)
      changed()
    },
  }
}

export const session = createSession()
