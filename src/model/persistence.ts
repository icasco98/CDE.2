import { isDocument, parseProject, type Document } from './parse'
import { STARTING_HEIGHT_M, startingHousehold } from './project'
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

/** Before heights were stored every storey stood at the height a project opens on. */
function storeysToHeights(document: Document): Document {
  const storeys = typeof document.storeys === 'number' ? document.storeys : 1
  return { ...document, heights: Array.from({ length: storeys }, () => STARTING_HEIGHT_M) }
}

/** A household written before the master bedroom could be asked for did not ask for it. */
function householdMasterOnGround(document: Document): Document {
  const household = isDocument(document.household) ? document.household : {}
  return { ...document, household: { masterOnGround: false, ...household } }
}

/** Where a document before version 11 kept its zones, under the model's old word for them. */
const ZONES_BEFORE_11 = 'rooms'

/** A bubble stood on the plot until the diagram became the graph alone; its place there is no nudge. */
function bubblesOffThePlot(document: Document): Document {
  const zones = Array.isArray(document[ZONES_BEFORE_11]) ? document[ZONES_BEFORE_11] : []
  return {
    ...document,
    [ZONES_BEFORE_11]: zones.map((zone: unknown) => {
      if (!isDocument(zone)) return zone
      const kept = { ...zone }
      delete kept.bubble
      return kept
    }),
  }
}

/**
 * The weights and the site answers were read by nothing, so they go; a project written before
 * declined suggestions were kept has declined none.
 */
function declinedNotWeighed(document: Document): Document {
  const kept: Document = { ...document, declined: [] }
  delete kept.weights
  delete kept.site
  return kept
}

/** A field moved from its old name to its new one; a document already carrying the new name keeps it. */
function renamed(document: Document, from: string, to: string): Document {
  if (!(from in document)) return document
  const kept: Document = { [to]: document[from], ...document }
  delete kept[from]
  return kept
}

/** The zone-type id a version 10 document gave a space of no listed type. */
const OTHER_BEFORE_11 = 'room-other'

/**
 * Version 10 named the program's spaces and the access between them as the model then did, and
 * kept a space of no listed type under the old word too.
 */
function zonesAndConnections(document: Document): Document {
  const moved = renamed(renamed(document, ZONES_BEFORE_11, 'zones'), 'edges', 'connections')
  if (!Array.isArray(moved.zones)) return moved
  return {
    ...moved,
    zones: moved.zones.map((zone: unknown) =>
      isDocument(zone) && zone.type === OTHER_BEFORE_11 ? { ...zone, type: 'zone-other' } : zone,
    ),
  }
}

/** From the version keyed to the next one. */
const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [1, (document) => ({ household: startingHousehold, ...document })],
  // The weights and the site answers these two steps shaped are dropped on the way to version 10.
  [2, (document) => document],
  [3, storeysToHeights],
  [4, householdMasterOnGround],
  // Bubbles are dropped on the way to version 8, so where this step once put them is moot.
  [5, (document) => document],
  [6, (document) => document],
  [7, bubblesOffThePlot],
  [8, (document) => ({ apart: [], ...document })],
  [9, declinedNotWeighed],
  [10, zonesAndConnections],
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
