/**
 * The artifact runtime, as much of it as this tool uses: asking Claude, and the store the link
 * keeps. Both are absent in local development and under a test runner, and the screen says so.
 */

import { useEffect, useState } from 'react'
import type { AgentTool } from '../../sheet'

type TextUpdate = { text: string; delta: string }

type SampleTurn = { role: 'user' | 'assistant'; content: string }

type SampleOptions = {
  tools?: AgentTool[]
  modelTier?: 'default' | 'complex' | 'quick'
  cache?: boolean
  onText?: (update: TextUpdate) => void
  signal?: AbortSignal
}

export type Sample = {
  (input: SampleTurn[], options?: SampleOptions): Promise<{ text: string; truncated: boolean }>
  limits?: () => Promise<{ tools?: { maxCount: number } }>
}

type StoreDoc = {
  get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>
  set: (data: Record<string, unknown>) => Promise<void>
}

export type Store = { doc: (path: string) => StoreDoc }

type Runtime = {
  sample: Sample | null
  store: Store | null
  /** The runtime has answered, so an absent assistant is absence and not a slow start. */
  ready: boolean
}

declare global {
  interface Window {
    claude?: { use?: (name: string) => Promise<unknown> }
  }
}

const asSample = (value: unknown): Sample | null =>
  typeof value === 'function' ? (value as Sample) : null

const asStore = (value: unknown): Store | null => {
  const store = value as Store | null
  return store && typeof store.doc === 'function' ? store : null
}

/** What the page can reach: nothing at first, then whatever the link grants, or nothing for good. */
export function useRuntime(): Runtime {
  const [runtime, setRuntime] = useState<Runtime>({ sample: null, store: null, ready: false })
  useEffect(() => {
    let live = true
    const use = window.claude?.use
    if (typeof use !== 'function') {
      setRuntime({ sample: null, store: null, ready: true })
      return
    }
    void Promise.all([
      use.call(window.claude, 'sample').catch(() => null),
      use.call(window.claude, 'db').catch(() => null),
    ]).then(([sample, store]) => {
      if (live) setRuntime({ sample: asSample(sample), store: asStore(store), ready: true })
    })
    return () => {
      live = false
    }
  }, [])
  return runtime
}
