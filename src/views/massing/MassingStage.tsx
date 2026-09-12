import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import type { Footprint } from '../../geometry'
import type { Commit, Result } from '../../model'
import type { RoomSizes } from '../zoning/defaults'
import { MassingView } from './MassingView'

function report(result: Result<unknown>): void {
  if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
}

/** The massing view over the app's one store: every callback is a store action, refusals are said out loud. */
export function MassingStage(props: {
  readonly storey: number
  readonly onStorey: (storey: number) => void
  readonly sizes: ReadonlyMap<string, RoomSizes>
}) {
  const project = useProject()
  const selected = useSelection()

  return (
    <MassingView
      rooms={project.rooms}
      storeys={project.storeys}
      heights={project.heights}
      plot={project.plot}
      sizes={props.sizes}
      storey={props.storey}
      selected={selected}
      onSelect={selection.select}
      onStorey={props.onStorey}
      onHeight={(storey: number, metres: number) =>
        report(session.actions.setHeight(storey, metres))
      }
      onPlace={(id: string, footprint: Footprint, commit: Commit) =>
        report(session.actions.place(id, footprint, commit))
      }
      onRefuse={session.say}
    />
  )
}
