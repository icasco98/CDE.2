import { useState } from 'react'
import type { Zone } from '../../model'
import { categoryLabels, zoneTypeById, spansAllStoreys, typesByCategory } from '../../rulebook'
import { sendToStorey } from '../../app/sendToStorey'
import { session } from '../../app/session'
import { NumberInput } from './fields'
import { storeyLabel } from '../../rulebook'
import { refusalOf } from './refusals'
import { spanBetween, startsFor, topAfterStart, topOf, topsFor } from './spans'

type Told = (problem: string | null) => void

/** The two ends of a stair or a lift, which is what its storey column asks for instead of one storey. */
function Spans({ zone, storeys, told }: { zone: Zone; storeys: number; told: Told }) {
  const top = topOf(zone)
  const set = (from: number, to: number): void =>
    told(refusalOf(session.actions.setStorey(zone.id, from, spanBetween(from, to))))
  return (
    <span className="spans">
      <label>
        <span>From</span>
        <select
          aria-label="From"
          value={zone.storey}
          onChange={(event) => {
            const from = Number(event.target.value)
            set(from, topAfterStart(from, top, storeys))
          }}
        >
          {startsFor(storeys).map((storey) => (
            <option key={storey} value={storey}>
              {storeyLabel(storey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>To</span>
        <select
          aria-label="To"
          value={topAfterStart(zone.storey, top, storeys)}
          onChange={(event) => set(zone.storey, Number(event.target.value))}
        >
          {topsFor(zone.storey, storeys).map((storey) => (
            <option key={storey} value={storey}>
              {storeyLabel(storey)}
            </option>
          ))}
        </select>
      </label>
    </span>
  )
}

function floorNote(type: string, targetArea: number): string | null {
  const floor = zoneTypeById(type)?.legalFloor
  if (!floor?.area || targetArea >= floor.area) return null
  const note = floor.note ? `, ${floor.note}` : ''
  return `Below the legal floor of ${floor.area} m² (${floor.source}${note}).`
}

export function ProgramRow({ zone, storeys }: { zone: Zone; storeys: number }) {
  const [problem, setProblem] = useState<string | null>(null)
  const known = zoneTypeById(zone.type) !== undefined
  const below = floorNote(zone.type, zone.targetArea)

  return (
    <tr>
      <td>
        <input
          type="text"
          aria-label="Zone name"
          value={zone.name}
          onChange={(event) =>
            setProblem(refusalOf(session.actions.rename(zone.id, event.target.value)))
          }
        />
      </td>
      <td>
        <select
          aria-label="Zone kind"
          value={zone.type}
          onChange={(event) =>
            setProblem(refusalOf(session.actions.setType(zone.id, event.target.value)))
          }
        >
          {known ? null : <option value={zone.type}>{zone.type}</option>}
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
      </td>
      <td>
        {spansAllStoreys(zone.type) ? (
          <Spans zone={zone} storeys={storeys} told={setProblem} />
        ) : (
          <select
            aria-label="Storey"
            value={zone.storey}
            onChange={(event) =>
              // A zone takes its companions up with it and leaves behind what it can no longer
              // hold, whether it is sent from the program or from the bubble diagram.
              {
                const moved = sendToStorey(session, zone.id, Number(event.target.value))
                if (moved.ok) moved.value.forEach((sentence) => session.say(sentence))
                setProblem(refusalOf(moved))
              }
            }
          >
            {Array.from({ length: storeys }, (_, storey) => (
              <option key={storey} value={storey}>
                {storeyLabel(storey)}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <NumberInput
          label="Target area"
          className={below ? 'below-floor' : undefined}
          value={zone.targetArea}
          step={0.5}
          onCommit={(targetArea) =>
            setProblem(refusalOf(session.actions.setTargetArea(zone.id, targetArea)))
          }
        />
        {below ? <span className="problem">{below}</span> : null}
        {problem ? <span className="problem">{problem}</span> : null}
      </td>
      <td>
        <button type="button" onClick={() => session.actions.removeZone(zone.id)}>
          Remove
        </button>
      </td>
    </tr>
  )
}
