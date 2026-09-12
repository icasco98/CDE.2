import { removedLinks } from '../../app/defaultLinks'
import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import { GRID_M, type Footprint } from '../../geometry'
import type { Commit, EdgeKind, Endpoint, Project, Result } from '../../model'
import type { RoomSizes } from './defaults'
import { layOut } from './layout'
import type { Placement } from './types'
import { ZoningView } from './ZoningView'

function report(result: Result<unknown>): void {
  if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
}

/** What one press of the button comes to: the whole plan, and a sentence for each storey refused. */
type Plan = { readonly placements: readonly Placement[]; readonly refusals: readonly string[] }

/**
 * Every storey laid out in turn, the lowest first, each from the rooms the one below has just put
 * down, so a stair is placed once on the storey it starts from and stands on the rest. The button
 * lays out the whole house rather than the storey in view; a storey with no room to spare is left
 * alone and says why.
 */
function planFrom(project: Project, sizes: ReadonlyMap<string, RoomSizes>): Plan {
  let rooms = project.rooms
  const placements: Placement[] = []
  const refusals: string[] = []
  for (let storey = 0; storey < project.storeys; storey++) {
    const laid = layOut(rooms, project.edges, project.plot, storey, sizes, GRID_M)
    if (!laid.ok) {
      refusals.push(laid.reason)
      continue
    }
    placements.push(...laid.value)
    const at = new Map(laid.value.map((placement) => [placement.id, placement.footprint]))
    rooms = rooms.map((room) => {
      const footprint = at.get(room.id)
      return footprint ? { ...room, footprint } : room
    })
  }
  return { placements, refusals }
}

/** The zoning view over the app's one store: every callback is a store action, refusals are said out loud. */
export function ZoningStage(props: {
  readonly storey: number
  readonly onStorey: (storey: number) => void
  readonly sizes: ReadonlyMap<string, RoomSizes>
}) {
  const project = useProject()
  const selected = useSelection()
  const { sizes } = props

  const placeAll = (placements: readonly Placement[]): void =>
    report(
      session.transaction(() => {
        for (const placement of placements) {
          const result = session.actions.place(placement.id, placement.footprint)
          if (!result.ok) return result
        }
      }),
    )

  const unplaced = project.rooms.filter((room) => room.footprint === undefined)

  const layOutAll = (): void => {
    const plan = planFrom(project, sizes)
    // One transaction for the whole house, so a plan a person does not like goes with one undo.
    if (plan.placements.length > 0) placeAll(plan.placements)
    plan.refusals.forEach((refusal) => session.say(refusal))
  }

  return (
    <ZoningView
      projectId={project.id}
      rooms={project.rooms}
      edges={project.edges}
      storeys={project.storeys}
      storey={props.storey}
      plot={project.plot}
      sizes={sizes}
      selected={selected}
      onPlace={(id: string, footprint: Footprint, commit: Commit) =>
        report(session.actions.place(id, footprint, commit))
      }
      onPlaceAll={placeAll}
      onUnplace={(id: string) => report(session.actions.unplace(id))}
      onPin={(id: string, pinned: boolean) =>
        report(pinned ? session.actions.pin(id) : session.actions.unpin(id))
      }
      onConnect={(a: Endpoint, b: Endpoint, storey: number) =>
        report(session.actions.connect({ a, b, kind: 'door', storey }))
      }
      onDisconnect={(edgeId: string) => {
        // A link taken out here is out of this house, so the rulebook does not offer it again.
        const edge = project.edges.find((each) => each.id === edgeId)
        report(session.actions.disconnect(edgeId))
        if (edge) removedLinks.remember(project.id, edge.a, edge.b)
      }}
      onSelect={selection.select}
      onStorey={props.onStorey}
      onSetEdgeKind={(edgeId: string, kind: EdgeKind) =>
        report(session.actions.setEdgeKind(edgeId, kind))
      }
      onRefuse={session.say}
      onLayOut={layOutAll}
      unplacedCount={unplaced.length}
    />
  )
}
