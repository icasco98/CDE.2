import { boundingBox, type Polygon } from '../geometry'
import { buildableArea } from '../rulebook/setbacks'
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

/** The placeholder sliders become the three families named in rulebook/forces.md. */
function weightsToFamilies(document: Document): Document {
  const old = isDocument(document.weights) ? document.weights : {}
  const weights: Document = {}
  if (typeof old.client === 'number') weights.userRequirements = old.client
  if (typeof old.climate === 'number') weights.environmentalFactors = old.climate
  return { ...document, weights }
}

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

/** A stored room as the bubble migration reads one; everything else about it is left alone. */
type BandedRoom = {
  readonly storey?: unknown
  readonly storeysSpanned?: unknown
  readonly targetArea?: unknown
  readonly bubble?: unknown
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * The height of one band on the old sheet. The stacked bands are gone from the tool, but a
 * version 5 file was written against them, so the arithmetic that placed them lives on here and
 * nowhere else: wide enough for the largest room and for the busiest storey's rooms in a square.
 */
function bandHeightOf(rooms: readonly BandedRoom[]): number {
  let largest = 0
  const perStorey = new Map<number, number>()
  for (const room of rooms) {
    const target = Math.max(0, numberOr(room.targetArea, 0))
    largest = Math.max(largest, Math.sqrt(target / Math.PI))
    const storey = numberOr(room.storey, 0)
    perStorey.set(storey, (perStorey.get(storey) ?? 0) + target)
  }
  let busiest = 0
  for (const total of perStorey.values()) busiest = Math.max(busiest, total)
  return Math.max(12, largest * 4, Math.sqrt(busiest) * 1.2)
}

function bubbleOf(room: BandedRoom): { readonly x: number; readonly y: number } | undefined {
  if (!isDocument(room.bubble)) return undefined
  const { x, y } = room.bubble
  if (typeof x !== 'number' || typeof y !== 'number') return undefined
  return { x, y }
}

/**
 * Bubbles leave the stacked bands for the plot's own metres, the frame a footprint uses. Where a
 * bubble stood in its band is all the old sheet knew, so the band is mapped onto the buildable
 * area: across the cloud's own width to across the buildable width, and down the band to down the
 * buildable depth. A project with no bubbles is handed back as it came.
 */
function bubblesToPlotMetres(document: Document): Document {
  const rooms = Array.isArray(document.rooms) ? (document.rooms as readonly BandedRoom[]) : []
  const bubbles = rooms.map(bubbleOf)
  if (!bubbles.some((bubble) => bubble !== undefined)) return document
  const plot = isDocument(document.plot) ? document.plot : {}
  const polygon = Array.isArray(plot.polygon) ? (plot.polygon as Polygon) : []
  const street = Array.isArray(plot.street) ? (plot.street as readonly number[]) : []
  const inside = buildableArea({ polygon, street })
  const box = boundingBox(inside.length >= 3 ? inside : polygon)
  const storeys = Math.max(1, Math.trunc(numberOr(document.storeys, 1)))
  const bandHeight = bandHeightOf(rooms)
  let left = Infinity
  let right = -Infinity
  for (const bubble of bubbles) {
    if (!bubble) continue
    left = Math.min(left, bubble.x)
    right = Math.max(right, bubble.x)
  }
  const share = (value: number, from: number, span: number): number =>
    span > 1e-9 ? Math.min(1, Math.max(0, (value - from) / span)) : 0.5
  return {
    ...document,
    rooms: rooms.map((room, index) => {
      const bubble = bubbles[index]
      if (!bubble) return room
      const top = (storeys - 1 - numberOr(room.storey, 0)) * bandHeight
      return {
        ...room,
        bubble: {
          x: box.left + share(bubble.x, left, right - left) * box.width,
          y: box.top + share(bubble.y, top, bandHeight) * box.depth,
        },
      }
    }),
  }
}

/** From the version keyed to the next one. */
const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [1, (document) => ({ household: startingHousehold, ...document })],
  [2, weightsToFamilies],
  [3, storeysToHeights],
  [4, householdMasterOnGround],
  [5, bubblesToPlotMetres],
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
