import { useMemo } from 'react'
import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import { area, type Footprint } from '../../geometry'
import type { Commit, Endpoint, Result } from '../../model'
import { roomTypes } from '../../rulebook'
import { sizesOf, type RoomSizes } from './defaults'
import type { Placement } from './types'
import { ZoningView } from './ZoningView'

function report(result: Result<unknown>): void {
  if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
}

/** The zoning view over the app's one store: every callback is a store action, refusals are said out loud. */
export function ZoningStage() {
  const project = useProject()
  const selected = useSelection()
  const plotArea = area(project.plot.polygon)

  const sizes = useMemo<ReadonlyMap<string, RoomSizes>>(
    () => new Map(roomTypes.map((type) => [type.id, sizesOf(type, plotArea)])),
    [plotArea],
  )

  return (
    <ZoningView
      rooms={project.rooms}
      edges={project.edges}
      storeys={project.storeys}
      plot={project.plot}
      sizes={sizes}
      selected={selected}
      onPlace={(id: string, footprint: Footprint, commit: Commit) =>
        report(session.actions.place(id, footprint, commit))
      }
      onCarve={(placements: readonly Placement[]) =>
        report(
          session.transaction(() => {
            for (const placement of placements) {
              const result = session.actions.place(placement.id, placement.footprint)
              if (!result.ok) return result
            }
          }),
        )
      }
      onUnplace={(id: string) => report(session.actions.unplace(id))}
      onPin={(id: string, pinned: boolean) =>
        report(pinned ? session.actions.pin(id) : session.actions.unpin(id))
      }
      onConnect={(a: Endpoint, b: Endpoint, storey: number) =>
        report(session.actions.connect({ a, b, kind: 'door', storey }))
      }
      onDisconnect={(edgeId: string) => report(session.actions.disconnect(edgeId))}
      onSelect={selection.select}
      onRefuse={session.say}
    />
  )
}
