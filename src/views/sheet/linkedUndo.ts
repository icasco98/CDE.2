/**
 * A step on the sheet that changed the project too is one step to undo, though the sheet and the
 * project keep histories of their own: a door placed with the connection it asked for, a room the
 * sheet made that joined the program, or a room the sheet moved to another storey. Each such step is remembered by the depth of the sheet's
 * history it made, and undoing or redoing it takes the project's part back or brings it again.
 */

import type { EdgeKind, Store } from '../../model'
import { sendRoomsToStorey } from '../../app/sendToStorey'

type Linking = Pick<Store, 'undo' | 'redo' | 'getState' | 'actions' | 'transaction'>

/** The project's part of one sheet step: whether it stands, and how to take it or make it again. */
type Link = {
  readonly depth: number
  readonly stands: () => boolean
  readonly take: () => void
  readonly make: () => void
}

/** A room the sheet moved to another storey, from where the program had it. */
export type MovedRoom = { readonly id: string; readonly from: number; readonly to: number }

/** A room as the program had it when the sheet made it, so a redo makes the same room again. */
export type MadeRoom = {
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
    edge(depth: number, input: { edge: string; a: string; b: string; kind: EdgeKind }): void {
      let edge = input.edge
      const has = () => store.getState().edges.some((each) => each.id === edge)
      links.push({
        depth,
        stands: has,
        take: () => {
          store.actions.disconnect(edge)
        },
        make: () => {
          const made = store.actions.connect({ a: input.a, b: input.b, kind: input.kind })
          if (made.ok) edge = made.value
        },
      })
    },

    /** Rooms the sheet step made that joined the program. */
    rooms(depth: number, rooms: readonly MadeRoom[]): void {
      const held = () => store.getState().rooms.map((room) => room.id)
      links.push({
        depth,
        stands: () => rooms.every((room) => held().includes(room.id)),
        take: () => {
          store.transaction(() => {
            for (const room of rooms)
              if (held().includes(room.id)) {
                const gone = store.actions.removeRoom(room.id)
                if (!gone.ok) return gone
              }
          })
        },
        make: () => {
          store.transaction(() => {
            for (const room of rooms)
              if (!held().includes(room.id)) {
                const made = store.actions.addRoom({ ...room, storeysSpanned: 1 })
                if (!made.ok) return made
              }
          })
        },
      })
    },

    /** Rooms the sheet step moved to another storey, moved in the program with it. */
    storeys(depth: number, moved: readonly MovedRoom[]): void {
      const at = (pick: (room: MovedRoom) => number) => () =>
        moved.every(
          (room) =>
            store.getState().rooms.find((each) => each.id === room.id)?.storey === pick(room),
        )
      const send = (pick: (room: MovedRoom) => number) => () => {
        sendRoomsToStorey(
          store,
          moved.map((room) => ({ id: room.id, storey: pick(room) })),
          () => false,
        )
      }
      links.push({
        depth,
        stands: at((room) => room.to),
        take: send((room) => room.from),
        make: send((room) => room.to),
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
