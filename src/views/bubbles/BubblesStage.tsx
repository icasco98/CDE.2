import { useMemo } from 'react'
import { connectDefaults, removedLinks } from '../../app/defaultLinks'
import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import type { Position } from '../../bubbles'
import { EXTERIOR, type Commit, type EdgeKind, type Family, type Result } from '../../model'
import { circulationPerStorey, connectionSource, roomTypeById, storeyLabel } from '../../rulebook'
import { addHallway } from './addHallway'
import { BubblesView } from './BubblesView'

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

  /** A default connection keeps the rulebook's own words, which the link says on hover. */
  const edges = useMemo(() => {
    const kindOf = (id: string): string =>
      id === EXTERIOR ? EXTERIOR : (project.rooms.find((room) => room.id === id)?.type ?? '')
    return project.edges.map((edge) => {
      const source = connectionSource(kindOf(edge.a), kindOf(edge.b), edge.kind)
      return source ? { ...edge, source } : edge
    })
  }, [project.edges, project.rooms])

  const circulation = useMemo(
    () => circulationPerStorey(project.rooms, project.storeys),
    [project.rooms, project.storeys],
  )

  const report = (result: Result<unknown>): boolean => {
    if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
    return result.ok
  }

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

  /**
   * A room changes the storey it stands on, unless a link it holds would be left joining two
   * rooms on different floors. An edge is between two rooms on one storey, so the link is named
   * rather than the rule it would break.
   */
  const sendTo = (id: string, storey: number): void => {
    const result = session.actions.setStorey(id, storey)
    if (result.ok) return
    const room = project.rooms.find((each) => each.id === id)
    if (room && result.problems.some((problem) => problem.code === 'edge-storey'))
      session.say(
        `${room.name} is linked to a room on ${storeyLabel(room.storey)}, so it stays there. Unlink it to move it.`,
      )
    else report(result)
  }

  /** A link taken out is a link this house does not want, so the rulebook is not to offer it again. */
  const disconnect = (edgeId: string): void => {
    const edge = project.edges.find((each) => each.id === edgeId)
    if (!report(session.actions.disconnect(edgeId))) return
    if (edge) removedLinks.remember(project.id, edge.a, edge.b)
    if (selection.get() === edgeId) selection.select(null)
  }

  return (
    <BubblesView
      rooms={rooms}
      edges={edges}
      storeys={project.storeys}
      circulation={circulation}
      plot={project.plot}
      weights={project.weights}
      selected={selected}
      onMoveBubble={(id: string, at: Position, commit: Commit) =>
        session.actions.setBubble(id, at, commit)
      }
      onDropBubble={(id: string, at: Position) => report(session.actions.setBubble(id, at))}
      onSetStorey={sendTo}
      onPin={(id: string, pinned: boolean) =>
        report(pinned ? session.actions.pin(id) : session.actions.unpin(id))
      }
      onConnect={(a: string, b: string) => report(session.actions.connect({ a, b, kind: 'door' }))}
      onDisconnect={disconnect}
      onSetEdgeKind={(edgeId: string, kind: EdgeKind) =>
        report(session.actions.setEdgeKind(edgeId, kind))
      }
      onRemoveRoom={remove}
      onAddHallway={(storey: number) =>
        report(
          session.transaction(() => {
            const added = addHallway(session, project.rooms, storey, project.storeys)
            if (!added.ok) return added
            // The corridor arrives linked to what it serves, as every other room does.
            return connectDefaults(session)
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
