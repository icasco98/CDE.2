import { useSyncExternalStore } from 'react'
import type { Project } from '../model'
import { session, type Message } from './session'

export function useProject(): Project {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState)
}

export function useMessages(): readonly Message[] {
  return useSyncExternalStore(session.subscribe, session.messages, session.messages)
}
