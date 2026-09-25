import { useProject } from '../../app/useProject'
import { HouseholdSection } from './HouseholdSection'
import { PlotSection } from './PlotSection'
import { ProgramSection } from './ProgramSection'

export function RequirementsScreen() {
  const project = useProject()
  return (
    <div className="requirements">
      <PlotSection project={project} />
      <HouseholdSection project={project} />
      <ProgramSection project={project} />
    </div>
  )
}
