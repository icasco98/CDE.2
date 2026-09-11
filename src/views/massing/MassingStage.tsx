import { selection, useSelection } from '../../app/selection'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import type { Result } from '../../model'
import { MassingView } from './MassingView'

function report(result: Result<unknown>): void {
  if (!result.ok) result.problems.forEach((problem) => session.say(problem.message))
}

/** The massing view over the app's one store: every callback is a store action, refusals are said out loud. */
export function MassingStage() {
  const project = useProject()
  const selected = useSelection()

  return (
    <MassingView
      rooms={project.rooms}
      storeys={project.storeys}
      heights={project.heights}
      plot={project.plot}
      selected={selected}
      onSelect={selection.select}
      onHeight={(storey: number, metres: number) =>
        report(session.actions.setHeight(storey, metres))
      }
    />
  )
}
