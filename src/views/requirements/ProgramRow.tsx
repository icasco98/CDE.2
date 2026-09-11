import { useState } from 'react'
import type { Room } from '../../model'
import { categoryLabels, roomTypeById, typesByCategory } from '../../rulebook'
import { session } from '../../app/session'
import { NumberInput } from './fields'
import { storeyLabel } from './format'
import { refusalOf } from './refusals'

function floorNote(type: string, targetArea: number): string | null {
  const floor = roomTypeById(type)?.legalFloor
  if (!floor?.area || targetArea >= floor.area) return null
  const note = floor.note ? `, ${floor.note}` : ''
  return `Below the legal floor of ${floor.area} m² (${floor.source}${note}).`
}

export function ProgramRow({ room, storeys }: { room: Room; storeys: number }) {
  const [problem, setProblem] = useState<string | null>(null)
  const known = roomTypeById(room.type) !== undefined
  const below = floorNote(room.type, room.targetArea)

  return (
    <tr>
      <td>
        <input
          type="text"
          aria-label="Room name"
          value={room.name}
          onChange={(event) =>
            setProblem(refusalOf(session.actions.rename(room.id, event.target.value)))
          }
        />
      </td>
      <td>
        <select
          aria-label="Room kind"
          value={room.type}
          onChange={(event) =>
            setProblem(refusalOf(session.actions.setType(room.id, event.target.value)))
          }
        >
          {known ? null : <option value={room.type}>{room.type}</option>}
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
        <select
          aria-label="Storey"
          value={room.storey}
          onChange={(event) =>
            setProblem(refusalOf(session.actions.setStorey(room.id, Number(event.target.value))))
          }
        >
          {Array.from({ length: storeys }, (_, storey) => (
            <option key={storey} value={storey}>
              {storeyLabel(storey)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <NumberInput
          label="Target area"
          className={below ? 'below-floor' : undefined}
          value={room.targetArea}
          step={0.5}
          onCommit={(targetArea) =>
            setProblem(refusalOf(session.actions.setTargetArea(room.id, targetArea)))
          }
        />
        {below ? <span className="problem">{below}</span> : null}
        {problem ? <span className="problem">{problem}</span> : null}
      </td>
      <td>
        <button type="button" onClick={() => session.actions.removeRoom(room.id)}>
          Remove
        </button>
      </td>
    </tr>
  )
}
