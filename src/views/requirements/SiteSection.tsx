import { useState } from 'react'
import { session } from '../../app/session'
import type { Garden, Project } from '../../model'
import { CheckField, Section } from './fields'
import { refusalOf } from './refusals'

/**
 * The two site questions forces.md leaves to the client rather than to the table: S4, whether the
 * diwaniya addresses the corner where two streets meet, and S5, where the garden goes. They are
 * answers on this project, so they stand beside the plot they are about.
 */
const gardens: readonly { readonly value: Garden; readonly label: string }[] = [
  { value: 'rear', label: 'Rear' },
  { value: 'side', label: 'A side' },
  { value: 'none', label: 'None' },
]

export function SiteSection({ project }: { project: Project }) {
  const [problem, setProblem] = useState<string | null>(null)
  const { site, plot } = project
  // A corner is a corner only where two of the plot's sides are streets; on any other plot the
  // question has no answer and is not asked.
  const corner = plot.street.length >= 2

  const answer = (next: typeof site): void => setProblem(refusalOf(session.actions.setSite(next)))

  return (
    <Section title="Site">
      {corner ? (
        <CheckField
          label="Diwaniya at the corner"
          checked={site.diwaniyaAtCorner}
          onChange={(on) => answer({ ...site, diwaniyaAtCorner: on })}
        />
      ) : (
        <p className="note">
          The diwaniya addresses the corner only on a plot with two streets. Mark a second side on a
          street above to be asked.
        </p>
      )}
      <label className="field">
        <span>Garden</span>
        <select
          aria-label="Garden"
          value={site.garden}
          onChange={(event) => answer({ ...site, garden: event.target.value as Garden })}
        >
          {gardens.map((garden) => (
            <option key={garden.value} value={garden.value}>
              {garden.label}
            </option>
          ))}
        </select>
      </label>
      {problem ? <p className="problem">{problem}</p> : null}
    </Section>
  )
}
