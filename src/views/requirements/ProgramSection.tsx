import { useState } from 'react'
import { area } from '../../geometry'
import type { Project } from '../../model'
import { categoryLabels, roomTypeById, typesByCategory, typicalArea } from '../../rulebook'
import { session } from '../../app/session'
import { Section } from './fields'
import { metres2, storeyLabel } from './format'
import { ProgramRow } from './ProgramRow'
import { refusalOf } from './refusals'

export function ProgramSection({ project }: { project: Project }) {
  const [kind, setKind] = useState('bedroom')
  const [problem, setProblem] = useState<string | null>(null)
  const plotArea = area(project.plot.polygon)

  const addRoom = (): void => {
    const type = roomTypeById(kind)
    setProblem(
      refusalOf(
        session.actions.addRoom({
          type: kind,
          name: type?.label ?? kind,
          targetArea: typicalArea(kind, plotArea),
          storey: 0,
        }),
      ),
    )
  }

  const perStorey = Array.from({ length: project.storeys }, (_, storey) =>
    project.rooms
      .filter((room) => room.storey === storey)
      .reduce((sum, room) => sum + room.targetArea, 0),
  )
  const total = perStorey.reduce((sum, value) => sum + value, 0)

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
        <button type="button" onClick={() => setProblem(refusalOf(session.actions.addStorey()))}>
          Add storey
        </button>
        <button type="button" onClick={() => setProblem(refusalOf(session.actions.removeStorey()))}>
          Remove storey
        </button>
      </div>
      {problem ? <p className="problem">{problem}</p> : null}
      <dl className="totals">
        {perStorey.map((value, storey) => (
          <div key={storey}>
            <dt>{storeyLabel(storey)}</dt>
            <dd>{metres2(value)} m²</dd>
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
    </Section>
  )
}
