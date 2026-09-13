import { useLayoutEffect, useState } from 'react'
import { removedLinks } from '../../app/defaultLinks'
import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import type { Footprint, Point } from '../../geometry'
import {
  occupiedStoreys,
  type Commit,
  type EdgeKind,
  type Endpoint,
  type Project,
  type Result,
} from '../../model'
import { partitionStorey } from '../../zoning'
import type { RoomSizes } from './defaults'
import { morphHint, type Proposal } from './morph'
import type { Placement } from './types'
import { ZoningView } from './ZoningView'

function report(result: Result<unknown>): void {
  if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
}

/**
 * What Morph is in the middle of. The proposal is view state from the press to the Accept: the
 * store hears nothing of it until then, and Back leaves the store exactly as it was.
 */
type Morphing =
  | { readonly kind: 'asking'; readonly placed: number }
  | { readonly kind: 'shown'; readonly proposal: Proposal }
  | null

/** The zoning view over the app's one store: every callback is a store action, refusals are said out loud. */
export function ZoningStage(props: {
  readonly storey: number
  readonly onStorey: (storey: number) => void
  readonly sizes: ReadonlyMap<string, RoomSizes>
}) {
  const project = useProject()
  const selected = useSelection()
  const { sizes, storey } = props
  const [morphing, setMorphing] = useState<Morphing>(null)

  const placeAll = (placements: readonly Placement[]): void =>
    report(
      session.transaction(() => {
        for (const placement of placements) {
          const result = session.actions.place(placement.id, placement.footprint)
          if (!result.ok) return result
        }
      }),
    )

  /** Where every bubble of the project stands, which is where each zone's circle opens from. */
  const bubblesOf = (house: Project): ReadonlyMap<string, Point> => {
    const from = new Map<string, Point>()
    for (const room of house.rooms)
      if (room.bubble) from.set(room.id, [room.bubble.x, room.bubble.y])
    return from
  }

  const morph = (): void => {
    setMorphing({
      kind: 'shown',
      proposal: {
        storey,
        made: partitionStorey(project, storey),
        from: bubblesOf(project),
        first: morphHint.dueFor(project.id),
        opening: true,
      },
    })
  }

  /**
   * A standing proposal is made again whenever the house under it changes: a room reduced to the
   * bottom of its range, or that click undone, gives a new plan from the same bubbles, so the
   * overflow, the outlines and the sentence move together. It opens without the animation,
   * because it is the same proposal changing rather than a new one being offered, and it is made
   * before the browser paints, so no frame ever shows a proposal against a house it did not
   * come from.
   */
  useLayoutEffect(() => {
    setMorphing((standing) =>
      standing?.kind === 'shown'
        ? {
            kind: 'shown',
            proposal: {
              ...standing.proposal,
              made: partitionStorey(project, standing.proposal.storey),
              from: bubblesOf(project),
              opening: false,
            },
          }
        : standing,
    )
  }, [project])

  const onMorph = (): void => {
    const placed = project.rooms.filter(
      (room) => room.footprint && occupiedStoreys(room).includes(storey),
    ).length
    // A storey already drawn is asked about first: what the morph would take the place of is the
    // person's own work, and nothing of it goes until they have said so.
    if (placed > 0) setMorphing({ kind: 'asking', placed })
    else morph()
  }

  const accept = (): void => {
    if (morphing?.kind === 'asking') {
      morph()
      return
    }
    if (morphing?.kind !== 'shown') return
    const { made } = morphing.proposal
    // One transaction for the whole storey, so one undo returns it to the bubbles it came from.
    report(
      session.transaction(() => {
        for (const zone of made.zones) {
          const placed = session.actions.place(zone.id, { polygon: zone.polygon, rotation: 0 })
          if (!placed.ok) return placed
        }
        for (const door of made.doors) {
          const hinted = session.actions.setEdgeHint(door.linkId, { at: door.at })
          if (!hinted.ok) return hinted
        }
      }),
    )
    setMorphing(null)
  }

  return (
    <ZoningView
      projectId={project.id}
      rooms={project.rooms}
      edges={project.edges}
      storeys={project.storeys}
      storey={storey}
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
      onConnect={(a: Endpoint, b: Endpoint, on: number) =>
        report(session.actions.connect({ a, b, kind: 'door', storey: on }))
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
      onMorph={onMorph}
      onAccept={accept}
      onBack={() => setMorphing(null)}
      onReduce={(id: string, targetArea: number) =>
        report(session.actions.setTargetArea(id, targetArea))
      }
      proposal={morphing?.kind === 'shown' ? morphing.proposal : null}
      asking={morphing?.kind === 'asking' ? morphing.placed : null}
    />
  )
}
