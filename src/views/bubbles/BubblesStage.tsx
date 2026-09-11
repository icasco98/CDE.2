import { useMemo } from 'react'
import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import type { Position } from '../../bubbles'
import type { Commit } from '../../model'
import { connectionSource, proposedConnections, roomTypeById } from '../../rulebook'
import { BubblesView } from './BubblesView'
import type { BubbleProposal } from './types'

/** The bubbles view over the app's one store: every callback is a store action, refusals are said out loud. */
export function BubblesStage() {
  const project = useProject()
  const selected = useSelection()

  const rooms = useMemo(
    () =>
      project.rooms.map((room) => ({
        ...room,
        category: roomTypeById(room.type)?.category,
      })),
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

  const report = (result: { ok: boolean; problems?: readonly { message: string }[] }): void => {
    if (!result.ok) result.problems?.forEach((problem) => session.say(problem.message))
  }

  const take = (proposal: BubbleProposal) =>
    session.actions.connect({
      a: proposal.a,
      b: proposal.b,
      kind: proposal.kind,
      storey: proposal.storey,
    })

  return (
    <BubblesView
      rooms={rooms}
      edges={project.edges}
      proposals={proposals}
      storeys={project.storeys}
      plot={project.plot}
      selected={selected}
      onMoveBubble={(id: string, at: Position, commit: Commit) =>
        session.actions.setBubble(id, at, commit)
      }
      onPin={(id: string, pinned: boolean) =>
        report(pinned ? session.actions.pin(id) : session.actions.unpin(id))
      }
      onConnect={(a: string, b: string) => report(session.actions.connect({ a, b, kind: 'door' }))}
      onDisconnect={(edgeId: string) => report(session.actions.disconnect(edgeId))}
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
      onSelect={selection.select}
    />
  )
}
