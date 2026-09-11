import { useMemo } from 'react'
import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import { storeyLabel, type Position } from '../../bubbles'
import type { Commit, EdgeKind, Family, Result } from '../../model'
import {
  circulationPerStorey,
  connectionSource,
  hallwayArea,
  hallwayName,
  proposedConnections,
  roomTypeById,
} from '../../rulebook'
import { BubblesView } from './BubblesView'
import type { BubbleProposal } from './types'

/** The bubbles view over the app's one store: every callback is a store action, refusals are said out loud. */
export function BubblesStage() {
  const project = useProject()
  const selected = useSelection()

  const rooms = useMemo(
    () =>
      project.rooms.map((room) => {
        const kind = roomTypeById(room.type)
        return { ...room, category: kind?.category, tier: kind?.tier }
      }),
    [project.rooms],
  )

  const proposals = useMemo(
    () =>
      proposedConnections(project.rooms, project.edges).map((proposal) => ({
        ...proposal,
        source: connectionSource(proposal.rowId),
      })),
    [project.rooms, project.edges],
  )

  const circulation = useMemo(
    () => circulationPerStorey(project.rooms, project.storeys),
    [project.rooms, project.storeys],
  )

  const report = (result: Result<unknown>): boolean => {
    if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
    return result.ok
  }

  const take = (proposal: BubbleProposal) =>
    session.actions.connect({
      a: proposal.a,
      b: proposal.b,
      kind: proposal.kind,
      storey: proposal.storey,
    })

  /** A room takes its edges with it, so a selection that named either of them is let go with them. */
  const remove = (id: string): void => {
    if (!report(session.actions.removeRoom(id))) return
    const left = session.getState()
    const held = selection.get()
    if (
      held &&
      !left.rooms.some((room) => room.id === held) &&
      !left.edges.some((edge) => edge.id === held)
    )
      selection.select(null)
  }

  /** Sized from the rooms standing on that storey at this moment, which is what the rule reads. */
  const addHallway = (storey: number): void => {
    report(
      session.actions.addRoom({
        type: 'hallway',
        name: hallwayName(storey, project.storeys),
        targetArea: hallwayArea(project.rooms, storey),
        storey,
      }),
    )
  }

  /** The bubble and the storey its band gives it are one step; a storey the graph refuses is none. */
  const drop = (id: string, at: Position, storey?: number): boolean => {
    const result = session.transaction(() => {
      const moved = session.actions.setBubble(id, at, 'commit')
      if (!moved.ok || storey === undefined) return moved
      return session.actions.setStorey(id, storey)
    })
    if (result.ok || storey === undefined) return report(result)
    const room = project.rooms.find((each) => each.id === id)
    // An edge joins two rooms on one storey, so the link is named rather than the rule it broke.
    if (room && result.problems.some((problem) => problem.code === 'edge-storey'))
      session.say(
        `${room.name} is linked to a room on ${storeyLabel(room.storey)}, so it stays there. Unlink it to move it.`,
      )
    else report(result)
    return false
  }

  return (
    <BubblesView
      rooms={rooms}
      edges={project.edges}
      proposals={proposals}
      storeys={project.storeys}
      circulation={circulation}
      plot={project.plot}
      weights={project.weights}
      selected={selected}
      onMoveBubble={(id: string, at: Position, commit: Commit) =>
        session.actions.setBubble(id, at, commit)
      }
      onDropBubble={drop}
      onPin={(id: string, pinned: boolean) =>
        report(pinned ? session.actions.pin(id) : session.actions.unpin(id))
      }
      onConnect={(a: string, b: string) => report(session.actions.connect({ a, b, kind: 'door' }))}
      onDisconnect={(edgeId: string) => {
        if (report(session.actions.disconnect(edgeId)) && selection.get() === edgeId)
          selection.select(null)
      }}
      onSetEdgeKind={(edgeId: string, kind: EdgeKind) =>
        report(session.actions.setEdgeKind(edgeId, kind))
      }
      onRemoveRoom={remove}
      onAddHallway={addHallway}
      onAccept={(proposal: BubbleProposal) => report(take(proposal))}
      onAcceptAll={() =>
        report(
          session.transaction(() => {
            for (const proposal of proposals) {
              const taken = take(proposal)
              if (!taken.ok) return taken
            }
          }),
        )
      }
      onSetWeight={(family: Family, weight: number) =>
        report(session.actions.setWeights({ ...project.weights, [family]: weight }))
      }
      onSelect={selection.select}
      onRefuse={session.say}
    />
  )
}
