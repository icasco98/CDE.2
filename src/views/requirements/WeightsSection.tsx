import { useState } from 'react'
import type { Project } from '../../model'
import { session } from '../../app/session'
import { Section } from './fields'
import { refusalOf } from './refusals'

const forces: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'client', label: 'Client' },
  { key: 'climate', label: 'Climate' },
  { key: 'budget', label: 'Budget' },
]

const middle = 0.5

export function WeightsSection({ project }: { project: Project }) {
  const [problem, setProblem] = useState<string | null>(null)

  const set = (key: string, weight: number): void =>
    setProblem(refusalOf(session.actions.setWeights({ ...project.weights, [key]: weight })))

  return (
    <Section title="Weights">
      <p className="note">
        These three stand in until the rulebook names its forces. The list is provisional.
      </p>
      <div className="row">
        {forces.map((force) => {
          const weight = project.weights[force.key] ?? middle
          return (
            <label className="field" key={force.key}>
              <span>
                {force.label} {weight.toFixed(2)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weight}
                onChange={(event) => set(force.key, Number(event.target.value))}
              />
            </label>
          )
        })}
      </div>
      {problem ? <p className="problem">{problem}</p> : null}
    </Section>
  )
}
