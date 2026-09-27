import { takeOut } from '../../app/defaultLinks'
import type { Result, Store } from '../../model'

/** What one cell of the matrix may be set to. */
export type PairChoice = 'door' | 'open' | 'apart' | 'nothing'

type Setting = Pick<Store, 'actions' | 'getState' | 'transaction'>

const between = (a: string, b: string) => (pair: { a: string; b: string }) =>
  (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a)

/**
 * One pair of rooms set from the matrix, as one undo step. A door or an opening makes or turns the
 * edge and leaves a keep-apart pair standing, to be warned of; Keep apart toggles the pair and
 * leaves the edge; Nothing takes both out, and a suggestion taken out is kept as declined.
 */
export function setPair(store: Setting, a: string, b: string, choice: PairChoice): Result {
  return store.transaction(() => {
    const project = store.getState()
    const edges = project.edges.filter(between(a, b))
    const pair = project.apart.find(between(a, b))
    if (choice === 'apart') {
      if (pair) return store.actions.allowTogether(pair.id)
      const kept = store.actions.keepApart({ a, b })
      return kept.ok ? undefined : kept
    }
    if (choice === 'nothing') {
      for (const edge of edges) {
        const cut = takeOut(store, edge.id)
        if (cut && !cut.ok) return cut
      }
      return pair ? store.actions.allowTogether(pair.id) : undefined
    }
    if (edges.length === 0) {
      const made = store.actions.connect({ a, b, kind: choice })
      return made.ok ? undefined : made
    }
    for (const edge of edges) {
      if (edge.kind === choice || edge.kind === 'main-door') continue
      const turned = store.actions.setEdgeKind(edge.id, choice)
      if (!turned.ok) return turned
    }
  })
}
