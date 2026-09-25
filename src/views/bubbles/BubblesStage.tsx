import { useMemo } from 'react'
import { connectDefaults, removedLinks } from '../../app/defaultLinks'
import { selection, useSelection } from '../../app/selection'
import { sendToStorey } from '../../app/sendToStorey'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import { EXTERIOR, type Bubble, type Commit, type EdgeKind, type Result } from '../../model'
import { circulationPerStorey, connectionSource, roomTypeById } from '../../rulebook'
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

  /** A connection the rulebook wants says which row and why; any other was added by hand. */
  const edges = useMemo(() => {
    const kindOf = (id: string): string =>
      id === EXTERIOR ? EXTERIOR : (project.rooms.find((room) => room.id === id)?.type ?? '')
    return project.edges.map((edge) => {
      const row = connectionSource(kindOf(edge.a), kindOf(edge.b))
      return row ? { ...edge, source: `Rulebook ${row.id}: ${row.source}` } : edge
    })
  }, [project.edges, project.rooms])

  const hallwayWanted = useMemo(
    () =>
      circulationPerStorey(project.rooms, project.storeys).flatMap((entry) =>
        entry.wanted === undefined ? [] : [{ storey: entry.storey, sentence: entry.wanted }],
      ),
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
      selected={selected}
      hallwayWanted={hallwayWanted}
      onNudge={(id: string, nudge: Bubble, commit: Commit) =>
        report(session.actions.setBubble(id, nudge, commit))
      }
      onSetStorey={(id: string, storey: number) => {
        // A door the move could not hold is said out loud and fades, as every refusal does.
        const moved = sendToStorey(session, id, storey)
        if (moved.ok) moved.value.forEach((sentence) => session.say(sentence))
        return report(moved)
      }}
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
      onSelect={selection.select}
      onRefuse={session.say}
    />
  )
}
