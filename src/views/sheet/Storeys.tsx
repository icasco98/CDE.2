/**
 * The storey switch above the sheet: one button per storey, + up to the rulebook's three, − for an
 * empty top one. The sheet shows the storey in hand; the mass shows them all.
 */

import { storeyCountOf, storeyNameOf, storeyOf, MAX_STOREYS, type Sheet } from '../../sheet'

type StoreysProps = {
  sheet: Sheet
  storey: number
  onStorey: (k: number) => void
  onAdd: () => void
  onDrop: () => void
}

export function Storeys(props: StoreysProps) {
  const n = storeyCountOf(props.sheet)
  const topEmpty = n > 2 && !props.sheet.rooms.some((r) => r.placed && storeyOf(r) === n - 1)
  return (
    <span
      className="seg storeys"
      title="The storey the sheet shows; the mass shows them all"
      data-storeys={n}
    >
      {Array.from({ length: n }, (_unused, k) => (
        <button
          key={k}
          type="button"
          data-storey={k}
          className={k === props.storey ? 'on' : ''}
          onClick={() => props.onStorey(k)}
        >
          {storeyNameOf(k)}
        </button>
      ))}
      {n < MAX_STOREYS && (
        <button
          type="button"
          data-add-storey
          title={`Add a storey above the ${storeyNameOf(n - 1).toLowerCase()}`}
          onClick={props.onAdd}
        >
          +
        </button>
      )}
      {topEmpty && (
        <button
          type="button"
          data-drop-storey
          title={`Take the empty ${storeyNameOf(n - 1).toLowerCase()} storey away`}
          onClick={props.onDrop}
        >
          −
        </button>
      )}
    </span>
  )
}
