import { useState } from 'react'
import type { Room } from '../../model'
import { categoryLabels, roomTypeById, spansAllStoreys, typesByCategory } from '../../rulebook'
import { sendToStorey } from '../../app/sendToStorey'
import { session } from '../../app/session'
import { NumberInput } from './fields'
import { storeyLabel } from '../../rulebook'
import { refusalOf } from './refusals'
import { spanBetween, startsFor, topAfterStart, topOf, topsFor } from './spans'

type Told = (problem: string | null) => void

/** The two ends of a stair or a lift, which is what its storey column asks for instead of one storey. */
function Spans({ room, storeys, told }: { room: Room; storeys: number; told: Told }) {
  const top = topOf(room)
  const set = (from: number, to: number): void =>
    told(refusalOf(session.actions.setStorey(room.id, from, spanBetween(from, to))))
  return (
    <span className="spans">
      <label>
        <span>From</span>
        <select
          aria-label="From"
          value={room.storey}
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
          value={topAfterStart(room.storey, top, storeys)}
          onChange={(event) => set(room.storey, Number(event.target.value))}
        >
          {topsFor(room.storey, storeys).map((storey) => (
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
        {spansAllStoreys(room.type) ? (
          <Spans room={room} storeys={storeys} told={setProblem} />
        ) : (
          <select
            aria-label="Storey"
            value={room.storey}
            onChange={(event) =>
              // A room takes its companions up with it and leaves behind what it can no longer
              // hold, whether it is sent from the program or from the bubble on the sheet.
              {
                const moved = sendToStorey(session, room.id, Number(event.target.value))
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
