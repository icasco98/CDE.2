import { useMemo } from 'react'
import { connectDefaults, restoreSuggested, takeOut } from '../../app/defaultLinks'
import { selection, useSelection } from '../../app/selection'
import { sendToStorey } from '../../app/sendToStorey'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import { graphChecks } from '../../graph/checks'
import { EXTERIOR, type Bubble, type Commit, type ConnectionKind, type Result } from '../../model'
import { circulationPerStorey, connectionSource, zoneTypeById } from '../../rulebook'
import { addHallway } from './addHallway'
import { setPair, type PairChoice } from './setPair'
import { BubblesView } from './BubblesView'

/** The bubbles view over the app's one store: every callback is a store action, refusals are said out loud. */
export function BubblesStage() {
  const project = useProject()
  const selected = useSelection()

  const zones = useMemo(
    () =>
      project.zones.map((zone) => {
        const kind = zoneTypeById(zone.type)
        return { ...zone, category: kind?.category, tier: kind?.tier }
      }),
    [project.zones],
  )

  /** A connection the rulebook wants says which row and why; any other was added by hand. */
  const connections = useMemo(() => {
    const kindOf = (id: string): string =>
      id === EXTERIOR ? EXTERIOR : (project.zones.find((zone) => zone.id === id)?.type ?? '')
    return project.connections.map((connection) => {
      const row = connectionSource(kindOf(connection.a), kindOf(connection.b))
      return row ? { ...connection, source: `Rulebook ${row.id}: ${row.source}` } : connection
    })
  }, [project.connections, project.zones])

  const checks = useMemo(
    () =>
      graphChecks({
        zones,
        connections: project.connections,
        apart: project.apart,
        storeys: project.storeys,
      }),
    [zones, project.connections, project.apart, project.storeys],
  )

  const hallwayWanted = useMemo(
    () =>
      circulationPerStorey(project.zones, project.storeys).flatMap((entry) =>
        entry.wanted === undefined ? [] : [{ storey: entry.storey, sentence: entry.wanted }],
      ),
    [project.zones, project.storeys],
  )

  const report = (result: Result<unknown>): boolean => {
    if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
    return result.ok
  }

  /** A zone takes its connections with it, so a selection that named either of them is let go with them. */
  const remove = (id: string): void => {
    if (!report(session.actions.removeZone(id))) return
    const left = session.getState()
    const held = selection.get()
    if (
      held &&
      !left.zones.some((zone) => zone.id === held) &&
      !left.connections.some((connection) => connection.id === held)
    )
      selection.select(null)
  }

  const nameOf = (id: string): string =>
    project.zones.find((zone) => zone.id === id)?.name ?? 'the outside'
  const keptApart = (a: string, b: string): boolean =>
    project.apart.some((pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a))
  const joined = (a: string, b: string): boolean =>
    project.connections.some(
      (connection) =>
        (connection.a === a && connection.b === b) || (connection.a === b && connection.b === a),
    )

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
      after.connections.some(
        (connection) =>
          (connection.a === a && connection.b === b) || (connection.a === b && connection.b === a),
      )
    if (both) session.say(`${nameOf(a)} and ${nameOf(b)} are kept apart and connected.`)
  }

  /** A suggestion taken out is one this house does not want, so the project keeps it declined. */
  const disconnect = (connectionId: string): void => {
    if (!report(session.transaction(() => takeOut(session, connectionId)))) return
    if (selection.get() === connectionId) selection.select(null)
  }

  return (
    <BubblesView
      zones={zones}
      connections={connections}
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
      onSetConnectionKind={(connectionId: string, kind: ConnectionKind) =>
        report(session.actions.setConnectionKind(connectionId, kind))
      }
      onRemoveZone={remove}
      onAddHallway={(storey: number) =>
        report(
          session.transaction(() => {
            const added = addHallway(session, project.zones, storey, project.storeys)
            if (!added.ok) return added
            // The corridor arrives linked to what it serves, as every other zone does.
            return connectDefaults(session)
          }),
        )
      }
      onRestore={(zone?: string) =>
        report(session.transaction(() => restoreSuggested(session, zone)))
      }
      onSelect={selection.select}
      onRefuse={session.say}
    />
  )
}
