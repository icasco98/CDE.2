import { useProject } from '../../app/useProject'
import { HouseholdSection } from './HouseholdSection'
import { PlotSection } from './PlotSection'
import { ProgramSection } from './ProgramSection'
import { SiteSection } from './SiteSection'

export function RequirementsScreen() {
  const project = useProject()
  return (
    <div className="requirements">
      <PlotSection project={project} />
      <SiteSection project={project} />
      <HouseholdSection project={project} />
      <ProgramSection project={project} />
    </div>
  )
}
