import { isDocument, parseProject, type Document } from './parse'
import { startingHousehold } from './project'
import type { Store } from './store'
import { PROJECT_VERSION, ok, refused, type Project, type Result, type Violation } from './types'

export const autosaveKey = 'cde.project'

/** The slice of browser storage the tool uses, so a test can pass its own. */
export type Storage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

type Migration = (document: Document) => Document

/** The placeholder sliders become the three families named in rulebook/forces.md. */
function weightsToFamilies(document: Document): Document {
  const old = isDocument(document.weights) ? document.weights : {}
  const weights: Document = {}
  if (typeof old.client === 'number') weights.userRequirements = old.client
  if (typeof old.climate === 'number') weights.environmentalFactors = old.climate
  return { ...document, weights }
}

/** From the version keyed to the next one. */
const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [1, (document) => ({ household: startingHousehold, ...document })],
  [2, weightsToFamilies],
])

export function serialize(project: Project): string {
  return JSON.stringify({ ...project, version: PROJECT_VERSION }, null, 2)
}

function migrate(document: Document): Result<Document> {
  let current = document
  let version = typeof current.version === 'number' ? current.version : 0
  if (version > PROJECT_VERSION)
    return refused({
      code: 'newer-version',
      message: `the file was written by a newer version of the tool (${version})`,
    })
  while (version < PROJECT_VERSION) {
    const migration = migrations.get(version)
    if (!migration)
      return refused({ code: 'unknown-version', message: `version ${version} cannot be read` })
    current = { ...migration(current), version: version + 1 }
    version += 1
  }
  return ok(current)
}

export function deserialize(json: string): Result<Project> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return refused({ code: 'unreadable', message: 'the project is not JSON' })
  }
  if (!isDocument(parsed))
    return refused({ code: 'unreadable', message: 'the project is not a group of fields' })
  const migrated = migrate(parsed)
  return migrated.ok ? parseProject(migrated.value) : migrated
}

function report(onProblem: ((problem: Violation) => void) | undefined, error: unknown): void {
  onProblem?.({ code: 'storage', message: `browser storage refused: ${String(error)}` })
}

/** Writes the project after a quiet moment; storage failures are reported, never thrown. */
export function attachAutosave(
  store: Store,
  storage: Storage,
  debounceMs: number,
  onProblem?: (problem: Violation) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const write = (): void => {
    timer = undefined
    try {
      storage.setItem(autosaveKey, serialize(store.getState()))
    } catch (error) {
      report(onProblem, error)
    }
  }
  const unsubscribe = store.subscribe((_project, change) => {
    if (change !== 'committed') return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(write, debounceMs)
  })
  return () => {
    if (timer !== undefined) clearTimeout(timer)
    unsubscribe()
  }
}

export function loadAutosaved(
  storage: Storage,
  onProblem?: (problem: Violation) => void,
): Project | null {
  try {
    const json = storage.getItem(autosaveKey)
    if (json === null) return null
    const loaded = deserialize(json)
    if (loaded.ok) return loaded.value
    loaded.problems.forEach((problem) => onProblem?.(problem))
    return null
  } catch (error) {
    report(onProblem, error)
    return null
  }
}

export function clearAutosaved(storage: Storage, onProblem?: (problem: Violation) => void): void {
  try {
    storage.removeItem(autosaveKey)
  } catch (error) {
    report(onProblem, error)
  }
}
