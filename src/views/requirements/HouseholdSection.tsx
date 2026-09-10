import { useState } from 'react'
import { area } from '../../geometry'
import type { Project } from '../../model'
import { defaultProgram, type Household } from '../../rulebook'
import { session } from '../../app/session'
import { useHousehold } from '../../app/useProject'
import { CheckField, NumberField, Section } from './fields'
import { refusalOf } from './refusals'

export function HouseholdSection({ project }: { project: Project }) {
  const household = useHousehold()
  const [changed, setChanged] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const change = (patch: Partial<Household>): void => {
    session.setHousehold({ ...household, ...patch })
    setChanged(true)
  }

  const rebuild = (): void => {
    let refusal: string | null = null
    for (const room of project.rooms) refusal ??= refusalOf(session.actions.removeRoom(room.id))
    for (const room of defaultProgram(area(project.plot.polygon), household))
      refusal ??= refusalOf(
        session.actions.addRoom({
          type: room.type,
          name: room.name,
          targetArea: room.targetArea,
          storey: 0,
        }),
      )
    setProblem(refusal)
    setChanged(false)
  }

  return (
    <Section title="Household">
      <div className="row">
        <NumberField
          label="Family size"
          value={household.familySize}
          onCommit={(familySize) => change({ familySize })}
        />
        <NumberField
          label="Bedrooms"
          value={household.bedrooms}
          onCommit={(bedrooms) => change({ bedrooms })}
        />
        <NumberField label="Cars" value={household.cars} onCommit={(cars) => change({ cars })} />
      </div>
      <div className="row">
        <CheckField
          label="Live-in maid"
          checked={household.maid}
          onChange={(maid) => change({ maid })}
        />
        <CheckField
          label="Driver"
          checked={household.driver}
          onChange={(driver) => change({ driver })}
        />
        <CheckField
          label="Women's reception"
          checked={household.womensReception}
          onChange={(womensReception) => change({ womensReception })}
        />
      </div>
      <div className="row">
        <button type="button" onClick={rebuild}>
          Rebuild program from household
        </button>
        {changed ? (
          <p className="note">The household changed. Rebuild the program to follow it.</p>
        ) : null}
      </div>
      {problem ? <p className="problem">{problem}</p> : null}
    </Section>
  )
}
