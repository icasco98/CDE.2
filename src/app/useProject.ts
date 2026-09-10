import { useSyncExternalStore } from 'react'
import type { Project } from '../model'
import type { Household } from '../rulebook'
import { session, type Message } from './session'

const subscribe = (listener: () => void): (() => void) => session.subscribe(() => listener())

export function useProject(): Project {
  return useSyncExternalStore(subscribe, session.getState, session.getState)
}

export function useHousehold(): Household {
  return useSyncExternalStore(subscribe, session.household, session.household)
}

export function useMessages(): readonly Message[] {
  return useSyncExternalStore(subscribe, session.messages, session.messages)
}
