import type { Project, Result, Store } from '../model'
import { impliedConnections } from '../rulebook'

/**
 * The default connections as real edges. The rulebook's table says what a villa is expected to
 * have, so a rebuilt program and a room added arrive linked and the designer removes what this
 * house does not want, rather than accepting one offer at a time.
 */
type Linking = Pick<Store, 'actions' | 'getState'>

function pairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * What the designer has disconnected, per project. It is view memory: the graph stores what it
 * holds, never what it has stopped holding, so a pair taken out is kept here and not offered
 * again. A new project is a new id, which is what clears it.
 */
let inProject = ''
let removed = new Set<string>()

function within(projectId: string): Set<string> {
  if (projectId !== inProject) {
    inProject = projectId
    removed = new Set<string>()
  }
  return removed
}

export const removedLinks = {
  remember(projectId: string, a: string, b: string): void {
    within(projectId).add(pairKey(a, b))
  },
  holds: (projectId: string, a: string, b: string): boolean => within(projectId).has(pairKey(a, b)),
}

/**
 * Every default connection this program implies and does not hold, made as an edge, but for the
 * pairs the designer has already taken out. Run inside the transaction that added the rooms, so
 * one undo takes the rooms and their links together.
 */
export function connectDefaults(store: Linking): Result | void {
  const project: Project = store.getState()
  for (const link of impliedConnections(project.rooms, project.edges)) {
    if (removedLinks.holds(project.id, link.a, link.b)) continue
    const made = store.actions.connect({
      a: link.a,
      b: link.b,
      kind: link.kind,
      storey: link.storey,
    })
    if (!made.ok) return made
  }
}
