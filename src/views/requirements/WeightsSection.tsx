import { useState } from 'react'
import { families, type Family, type Project } from '../../model'
import { session } from '../../app/session'
import { Section } from './fields'
import { refusalOf } from './refusals'

const labels: Readonly<Record<Family, string>> = {
  userRequirements: 'User requirements',
  siteConstraints: 'Site constraints',
  environmentalFactors: 'Environmental factors',
}

const middle = 0.5

export function WeightsSection({ project }: { project: Project }) {
  const [problem, setProblem] = useState<string | null>(null)

  const set = (key: Family, weight: number): void =>
    setProblem(refusalOf(session.actions.setWeights({ ...project.weights, [key]: weight })))

  return (
    <Section title="Weights">
      <p className="note">
        The three families of forces the tool balances; the forces inside each are listed in the
        rulebook.
      </p>
      <div className="row">
        {families.map((family) => {
          const label = labels[family]
          const weight = project.weights[family] ?? middle
          return (
            <label className="field" key={family}>
              <span>
                {label} {weight.toFixed(2)}
              </span>
              <input
                type="range"
                aria-label={label}
                min={0}
                max={1}
                step={0.05}
                value={weight}
                onChange={(event) => set(family, Number(event.target.value))}
              />
            </label>
          )
        })}
      </div>
      {problem ? <p className="problem">{problem}</p> : null}
    </Section>
  )
}
