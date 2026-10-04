/**
 * A step on the sheet that changed the project too is one step to undo, though the sheet and the
 * project keep histories of their own: a door placed with the connection it asked for, a zone the
 * sheet made that joined the program, or a zone the sheet moved to another storey. Each such step is remembered by the depth of the sheet's
 * history it made, and undoing or redoing it takes the project's part back or brings it again.
 */

import type { ConnectionKind, Store } from '../../model'
import { sendZonesToStorey } from '../../app/sendToStorey'

type Linking = Pick<Store, 'undo' | 'redo' | 'getState' | 'actions' | 'transaction'>

/** The project's part of one sheet step: whether it stands, and how to take it or make it again. */
type Link = {
  readonly depth: number
  readonly stands: () => boolean
  readonly take: () => void
  readonly make: () => void
}

/** A zone the sheet moved to another storey, from where the program had it. */
export type MovedZone = { readonly id: string; readonly from: number; readonly to: number }

/** A zone as the program had it when the sheet made it, so a redo makes the same zone again. */
export type MadeZone = {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly targetArea: number
  readonly storey: number
}

export function createLinks(store: Linking) {
  let links: Link[] = []

  return {
    /** The sheet's history has reached `depth` by a new step, so any link at or past it is gone. */
    prune(depth: number): void {
      links = links.filter((link) => link.depth < depth)
    },

    /** A connection made with the door the sheet step placed. */
    connection(
      depth: number,
      input: { connection: string; a: string; b: string; kind: ConnectionKind },
    ): void {
      let connection = input.connection
      const has = () => store.getState().connections.some((each) => each.id === connection)
      links.push({
        depth,
        stands: has,
        take: () => {
          store.actions.disconnect(connection)
        },
        make: () => {
          const made = store.actions.connect({ a: input.a, b: input.b, kind: input.kind })
          if (made.ok) connection = made.value
        },
      })
    },

    /** Zones the sheet step made that joined the program. */
    zones(depth: number, zones: readonly MadeZone[]): void {
      const held = () => store.getState().zones.map((zone) => zone.id)
      links.push({
        depth,
        stands: () => zones.every((zone) => held().includes(zone.id)),
        take: () => {
          store.transaction(() => {
            for (const zone of zones)
              if (held().includes(zone.id)) {
                const gone = store.actions.removeZone(zone.id)
                if (!gone.ok) return gone
              }
          })
        },
        make: () => {
          store.transaction(() => {
            for (const zone of zones)
              if (!held().includes(zone.id)) {
                const made = store.actions.addZone({ ...zone, storeysSpanned: 1 })
                if (!made.ok) return made
              }
          })
        },
      })
    },

    /** Zones the sheet step moved to another storey, moved in the program with it. */
    storeys(depth: number, moved: readonly MovedZone[]): void {
      const at = (pick: (zone: MovedZone) => number) => () =>
        moved.every(
          (zone) =>
            store.getState().zones.find((each) => each.id === zone.id)?.storey === pick(zone),
        )
      const send = (pick: (zone: MovedZone) => number) => () => {
        sendZonesToStorey(
          store,
          moved.map((zone) => ({ id: zone.id, storey: pick(zone) })),
          () => false,
        )
      }
      links.push({
        depth,
        stands: at((zone) => zone.to),
        take: send((zone) => zone.from),
        make: send((zone) => zone.to),
      })
    },

    /** The sheet step that stood at `depth` was undone: the project's part goes with it. */
    undone(depth: number): void {
      for (const link of links.filter((each) => each.depth === depth).reverse()) {
        if (!link.stands()) continue
        // The project's last step is this one unless something else was done there since.
        if (store.undo()) {
          if (!link.stands()) continue
          store.redo()
        }
        link.take()
      }
    },

    /** The sheet step at `depth` was done again: the project's part comes back with it. */
    redone(depth: number): void {
      for (const link of links.filter((each) => each.depth === depth)) {
        if (link.stands()) continue
        if (store.redo()) {
          if (link.stands()) continue
          store.undo()
        }
        link.make()
      }
    },
  }
}
