import { useState } from 'react'
import { area } from '../../geometry'
import type { Project } from '../../model'
import {
  buildableAreaOf,
  categoryLabels,
  feasibility,
  fitSentence,
  storeyFits,
  storeyLabel,
  typesByCategory,
} from '../../rulebook'
import { session } from '../../app/session'
import { addRoomWithCompanion } from './addRoom'
import { Section } from './fields'
import { addStorey, removeStorey } from './storeys'
import { metres2 } from './format'
import { ProgramRow } from './ProgramRow'
import { refusalOf } from './refusals'

export function ProgramSection({ project }: { project: Project }) {
  const [kind, setKind] = useState('bedroom')
  const [problem, setProblem] = useState<string | null>(null)
  const plotArea = area(project.plot.polygon)

  const addRoom = (): void => {
    setProblem(refusalOf(addRoomWithCompanion(session, kind, plotArea, project.storeys)))
  }

  // The same reading the bubbles sheet gives, from the same function: what each storey's targets
  // come to against the floor the setbacks leave it, a stair counted on every storey it reaches.
  const fits = storeyFits(project.rooms, buildableAreaOf(project.plot), project.storeys)
  const total = fits.reduce((sum, fit) => sum + fit.needed, 0)
  // The brief checked before a bubble moves: what this program asks of geometry that geometry
  // cannot give. A finding never stops a settle; it says what to change and waits.
  const findings = feasibility(project.rooms, project.edges, project.plot, project.storeys)

  return (
    <Section title="Program">
      <table className="program">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Storey</th>
            <th>Target area (m²)</th>
            <th>
              <span className="hidden-label">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {project.rooms.map((room) => (
            <ProgramRow key={room.id} room={room} storeys={project.storeys} />
          ))}
        </tbody>
      </table>
      {project.rooms.length === 0 ? (
        <p className="note">No rooms yet. Add one, or rebuild the program from the household.</p>
      ) : null}
      <div className="row">
        <label className="field">
          <span>Kind to add</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {typesByCategory().map(([category, types]) => (
              <optgroup key={category} label={categoryLabels[category]}>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" onClick={addRoom}>
          Add room
        </button>
        <button type="button" onClick={() => setProblem(refusalOf(addStorey(session)))}>
          Add storey
        </button>
        <button type="button" onClick={() => setProblem(refusalOf(removeStorey(session)))}>
          Remove storey
        </button>
      </div>
      {problem ? <p className="problem">{problem}</p> : null}
      <dl className="totals">
        {fits.map((fit) => (
          <div key={fit.storey} className={fit.over ? 'fit-over' : undefined}>
            <dt>{storeyLabel(fit.storey)}</dt>
            <dd>{metres2(fit.needed)} m²</dd>
            <dd className="fit">{fitSentence(fit)}</dd>
          </div>
        ))}
        <div>
          <dt>All storeys</dt>
          <dd>{metres2(total)} m²</dd>
        </div>
        <div>
          <dt>Plot</dt>
          <dd>{metres2(plotArea)} m²</dd>
        </div>
      </dl>
      {findings.length > 0 ? (
        <ul className="findings">
          {findings.map((finding) => (
            <li key={`${finding.code}:${finding.storey}:${finding.sentence}`}>
              {finding.sentence}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  )
}
