import { useMemo } from 'react'
import { connectDefaults, restoreSuggested, takeOut } from '../../app/defaultLinks'
import { selection, useSelection } from '../../app/selection'
import { sendToStorey } from '../../app/sendToStorey'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import { graphChecks } from '../../graph/checks'
import { EXTERIOR, type Bubble, type Commit, type EdgeKind, type Result } from '../../model'
import { circulationPerStorey, connectionSource, roomTypeById } from '../../rulebook'
import { addHallway } from './addHallway'
import { setPair, type PairChoice } from './setPair'
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

  const checks = useMemo(
    () =>
      graphChecks({ rooms, edges: project.edges, apart: project.apart, storeys: project.storeys }),
    [rooms, project.edges, project.apart, project.storeys],
  )

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

  const nameOf = (id: string): string =>
    project.rooms.find((room) => room.id === id)?.name ?? 'the outside'
  const keptApart = (a: string, b: string): boolean =>
    project.apart.some((pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a))
  const joined = (a: string, b: string): boolean =>
    project.edges.some((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a))

  /** Connecting a pair kept apart is allowed and said out loud, never refused. */
  const connect = (a: string, b: string): void => {
    if (!report(session.actions.connect({ a, b, kind: 'door' }))) return
    if (keptApart(a, b))
      session.say(`${nameOf(a)} and ${nameOf(b)} are to be kept apart; connected all the same.`)
  }

  const keepApart = (a: string, b: string): void => {
    if (!report(session.actions.keepApart({ a, b }))) return
    if (joined(a, b))
      session.say(`${nameOf(a)} and ${nameOf(b)} are connected; the pair kept apart warns of it.`)
  }

  const allowTogether = (id: string): void => {
    if (!report(session.actions.allowTogether(id))) return
    if (selection.get() === id) selection.select(null)
  }

  const setOnePair = (a: string, b: string, choice: PairChoice): void => {
    if (!report(setPair(session, a, b, choice))) return
    const after = session.getState()
    const both =
      after.apart.some(
        (pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a),
      ) &&
      after.edges.some((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a))
    if (both) session.say(`${nameOf(a)} and ${nameOf(b)} are kept apart and connected.`)
  }

  /** A suggestion taken out is one this house does not want, so the project keeps it declined. */
  const disconnect = (edgeId: string): void => {
    if (!report(session.transaction(() => takeOut(session, edgeId)))) return
    if (selection.get() === edgeId) selection.select(null)
  }

  return (
    <BubblesView
      rooms={rooms}
      edges={edges}
      apart={project.apart}
      declined={project.declined}
      storeys={project.storeys}
      checks={checks}
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
      onConnect={connect}
      onDisconnect={disconnect}
      onKeepApart={keepApart}
      onAllowTogether={allowTogether}
      onSetPair={setOnePair}
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
      onRestore={(room?: string) =>
        report(session.transaction(() => restoreSuggested(session, room)))
      }
      onSelect={selection.select}
      onRefuse={session.say}
    />
  )
}
