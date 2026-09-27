import { useEffect, useState } from 'react'
import { storeyLabel } from '../../rulebook'
import type { PairChoice } from './setPair'
import type { BubbleApart, BubbleLink, BubbleRoom } from './types'

type Cell = { readonly a: BubbleRoom; readonly b: BubbleRoom }

const choices: readonly { readonly choice: PairChoice; readonly label: string }[] = [
  { choice: 'door', label: 'Door' },
  { choice: 'open', label: 'Open' },
  { choice: 'apart', label: 'Keep apart' },
  { choice: 'nothing', label: 'Nothing' },
]

function storeysOf(room: BubbleRoom): readonly number[] {
  return Array.from(
    { length: Math.max(1, Math.trunc(room.storeysSpanned)) },
    (_, i) => room.storey + i,
  )
}

const meet = (a: BubbleRoom, b: BubbleRoom): boolean =>
  storeysOf(a).some((storey) => storeysOf(b).includes(storey))

const between = (a: string, b: string) => (pair: { a: string; b: string }) =>
  (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a)

/**
 * Every pair of rooms once, as the lower half of a grid: a room down the side meets every room
 * above it in the list. The same store and undo as the diagram, so the two are never out of step.
 */
export function Matrix(props: {
  readonly rooms: readonly BubbleRoom[]
  readonly edges: readonly BubbleLink[]
  readonly apart: readonly BubbleApart[]
  readonly onSet: (a: string, b: string, choice: PairChoice) => void
  readonly onClose: () => void
}) {
  const [picked, setPicked] = useState<Cell | null>(null)
  const rooms = [...props.rooms].sort((one, other) => one.storey - other.storey)
  const { onClose } = props

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stateOf = (a: string, b: string) => {
    const edge = props.edges.find(between(a, b))
    const kept = props.apart.some(between(a, b))
    return { kind: edge?.kind, kept }
  }

  const pickedState = picked && stateOf(picked.a.id, picked.b.id)

  return (
    <div className="matrix-backdrop" onPointerDown={onClose}>
      <div
        className="matrix"
        role="dialog"
        aria-label="Matrix"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Matrix</h2>
          <p>Every pair of rooms once. Click a cell to change it.</p>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="matrix-pick" aria-live="polite">
          {picked && pickedState ? (
            <>
              <b>
                {picked.a.name} ↔ {picked.b.name}
              </b>
              <span role="group" aria-label="Set the pair">
                {choices.map(({ choice, label }) => {
                  const joins = choice === 'door' || choice === 'open'
                  const apartStoreys = joins && !meet(picked.a, picked.b)
                  const on =
                    choice === 'apart'
                      ? pickedState.kept
                      : choice === 'nothing'
                        ? !pickedState.kind && !pickedState.kept
                        : pickedState.kind === choice
                  return (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={on}
                      disabled={apartStoreys || (joins && pickedState.kind === 'main-door')}
                      title={apartStoreys ? 'Only a stair joins two storeys.' : undefined}
                      onClick={() => props.onSet(picked.a.id, picked.b.id, choice)}
                    >
                      {label}
                    </button>
                  )
                })}
              </span>
            </>
          ) : (
            <span>No pair picked.</span>
          )}
        </div>
        <div className="matrix-scroll">
          <table>
            <thead>
              <tr>
                <th />
                {rooms.slice(0, -1).map((room) => (
                  <th key={room.id} scope="col" className="matrix-col">
                    <span>{room.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.slice(1).map((row, index) => (
                <tr key={row.id}>
                  <th scope="row">
                    {row.name} <small>{storeyLabel(row.storey)}</small>
                  </th>
                  {rooms.slice(0, index + 1).map((column) => {
                    const { kind, kept } = stateOf(row.id, column.id)
                    const mark = `${kind === 'open' ? 'O' : kind ? 'D' : ''}${kept ? '✕' : ''}`
                    const chosen = picked?.a.id === row.id && picked.b.id === column.id
                    return (
                      <td key={column.id}>
                        <button
                          type="button"
                          aria-label={`${row.name} and ${column.name}`}
                          data-state={`${kind ?? 'none'}${kept ? ' apart' : ''}`}
                          className={[
                            chosen ? 'chosen' : '',
                            kept ? 'kept' : '',
                            meet(row, column) ? '' : 'apart-storeys',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => setPicked({ a: row, b: column })}
                        >
                          {mark}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="matrix-key">
          D door · O open · ✕ keep apart · a shaded cell is two storeys a stair does not join
        </p>
      </div>
    </div>
  )
}
