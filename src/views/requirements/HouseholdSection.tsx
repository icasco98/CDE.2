import { useState } from 'react'
import { area } from '../../geometry'
import type { Household, Project } from '../../model'
import { buildableAreaOf, proposeProgram } from '../../rulebook'
import { connectDefaults } from '../../app/defaultLinks'
import { session } from '../../app/session'
import { CheckField, NumberField, Section } from './fields'
import { refusalOf } from './refusals'

export function HouseholdSection({ project }: { project: Project }) {
  const [changed, setChanged] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [reasons, setReasons] = useState<readonly string[]>([])
  const household = project.household

  const change = (patch: Partial<Household>): void => {
    setProblem(refusalOf(session.actions.setHousehold({ ...household, ...patch })))
    setReasons([])
    setChanged(true)
  }

  // The storeys are proposed with the program, each decision said in a sentence under the button.
  const rebuild = (): void => {
    const proposal = proposeProgram(
      area(project.plot.polygon),
      buildableAreaOf(project.plot),
      household,
      project.storeys,
    )
    const refusal = session.transaction(() => {
      for (const room of project.rooms) {
        const removed = session.actions.removeRoom(room.id)
        if (!removed.ok) return removed
      }
      while (session.getState().storeys < proposal.storeys) {
        const grown = session.actions.addStorey()
        if (!grown.ok) return grown
      }
      for (const room of proposal.rooms) {
        const added = session.actions.addRoom({
          type: room.type,
          name: room.name,
          targetArea: room.targetArea,
          storey: room.storey,
          storeysSpanned: room.storeysSpanned,
        })
        if (!added.ok) return added
      }
      // The rulebook's default connections come with the program, as edges: the designer removes
      // what this house does not want rather than accepting one offer at a time.
      return connectDefaults(session)
    })
    setProblem(refusalOf(refusal))
    setReasons(refusal.ok ? proposal.reasons : [])
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
        <CheckField
          label="Master bedroom on the ground floor"
          checked={household.masterOnGround}
          onChange={(masterOnGround) => change({ masterOnGround })}
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
      {reasons.length > 0 ? (
        <ul className="note proposal" aria-label="Why these storeys">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {problem ? <p className="problem">{problem}</p> : null}
    </Section>
  )
}
