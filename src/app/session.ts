import { attachAutosave, createStore, loadAutosaved, type Store, type Violation } from '../model'
import { browserStorage } from './storage'

const autosaveMs = 500

/** How long a refusal of a gesture stands before it goes on its own, in milliseconds. */
const passingMs = 8000

/** `until` is when the message goes of its own accord; without one it stands until it is dismissed. */
export type Message = { readonly id: string; readonly text: string; readonly until?: number }

export type Session = Omit<Store, 'subscribe'> & {
  readonly subscribe: (listener: () => void) => () => void
  readonly messages: () => readonly Message[]
  /** A refusal of a gesture: it is read as it happens and goes on its own. */
  readonly say: (text: string) => void
  /** Something that needs answering, such as a file that cannot be read: it stands until it is dismissed. */
  readonly warn: (text: string) => void
  readonly dismiss: (id: string) => void
}

function createSession(): Session {
  const storage = browserStorage()
  const listeners = new Set<() => void>()
  const changed = (): void => listeners.forEach((listener) => listener())

  let announced: readonly Message[] = []
  let counter = 0
  let sweep: ReturnType<typeof setTimeout> | null = null

  /** One timer, set for the first message due to go. */
  function nextSweep(): void {
    if (sweep !== null) {
      clearTimeout(sweep)
      sweep = null
    }
    let soonest: number | null = null
    for (const message of announced) {
      if (message.until === undefined) continue
      soonest = soonest === null ? message.until : Math.min(soonest, message.until)
    }
    if (soonest === null) return
    sweep = setTimeout(
      () => {
        sweep = null
        const now = Date.now()
        const kept = announced.filter(
          (message) => message.until === undefined || message.until > now,
        )
        if (kept.length !== announced.length) {
          announced = kept
          changed()
        }
        nextSweep()
      },
      Math.max(0, soonest - Date.now()),
    )
  }

  /** The same words twice over are one message, refreshed, rather than a pile. */
  function announce(text: string, until?: number): void {
    const standing = announced.find((message) => message.text === text)
    const message: Message = {
      id: standing?.id ?? `message-${(counter += 1)}`,
      text,
      ...(until === undefined ? {} : { until }),
    }
    announced = standing
      ? announced.map((each) => (each.id === message.id ? message : each))
      : [...announced, message]
    changed()
    nextSweep()
  }

  const report = (problem: Violation): void => announce(problem.message)

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
    say: (text) => announce(text, Date.now() + passingMs),
    warn: (text) => announce(text),
    dismiss(id) {
      announced = announced.filter((message) => message.id !== id)
      changed()
      nextSweep()
    },
  }
}

export const session = createSession()
