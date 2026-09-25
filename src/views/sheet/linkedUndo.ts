/**
 * A door placed with the connection it asked for is one step to undo, though the door is the
 * sheet's and the edge the project's: each such step is remembered by the depth of the sheet's
 * history it made, and undoing or redoing that step takes the edge back or brings it again.
 */

import type { EdgeKind, Store } from '../../model'

type Link = {
  readonly depth: number
  readonly edge: string
  readonly a: string
  readonly b: string
  readonly kind: EdgeKind
}

type Linking = Pick<Store, 'undo' | 'redo' | 'getState' | 'actions'>

export function createLinks(store: Linking) {
  let links: Link[] = []
  const has = (edge: string) => store.getState().edges.some((each) => each.id === edge)

  return {
    /** The sheet's history has reached `depth` by a new step, so any link at or past it is gone. */
    prune(depth: number): void {
      links = links.filter((link) => link.depth < depth)
    },

    add(link: Link): void {
      links = [...links.filter((each) => each.depth < link.depth), link]
    },

    /** The sheet step that stood at `depth` was undone: its edge goes with it. */
    undone(depth: number): void {
      const link = links.find((each) => each.depth === depth)
      if (!link || !has(link.edge)) return
      // The project's last step is the connect unless something else was done there since.
      if (store.undo()) {
        if (!has(link.edge)) return
        store.redo()
      }
      store.actions.disconnect(link.edge)
    },

    /** The sheet step at `depth` was done again: its edge comes back with it. */
    redone(depth: number): void {
      const link = links.find((each) => each.depth === depth)
      if (!link || has(link.edge)) return
      if (store.redo()) {
        if (has(link.edge)) return
        store.undo()
      }
      const made = store.actions.connect({ a: link.a, b: link.b, kind: link.kind })
      if (made.ok)
        links = links.map((each) => (each === link ? { ...link, edge: made.value } : each))
    },
  }
}
