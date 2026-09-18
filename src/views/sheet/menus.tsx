/**
 * The right-click menus: a room's, an enclosed space's, and the note where a right-click finds
 * neither. Each row names one choice; the stage turns the choice into one action.
 */

import {
  acrossStoreys,
  courtWhy,
  fmt,
  isOpen,
  storeyNameOf,
  type Point,
  type Pocket,
  type Room,
  type Settings,
  type Sheet,
} from '../../sheet'

/** Where a menu stands, in pixels inside the sheet's box. */
type MenuAt = { x: number; y: number }

export type RoomChoice =
  | { kind: 'pivot'; at: Point | null }
  | { kind: 'quarter' }
  | { kind: 'north' }
  | { kind: 'mirror'; axis: 'x' | 'y' }
  | { kind: 'lock'; on: boolean }
  | { kind: 'group' }
  | { kind: 'ungroup' }
  | { kind: 'combine'; survivor: string }
  | { kind: 'reshape' }
  | { kind: 'give'; how: 'carve' | 'push' }
  | { kind: 'cut' }
  | { kind: 'colour' }
  | { kind: 'colourReset' }
  | { kind: 'labelReset' }
  | { kind: 'restore' }
  | { kind: 'copy' }
  /** One storey up or down, the room's place kept; a copy leaves the original where it stands. */
  | { kind: 'setStorey'; to: number }
  | { kind: 'copyStorey'; to: number }
  | { kind: 'back' }

type RoomMenuProps = {
  at: MenuAt
  /** The corner the right-click landed near, which the selection can turn about. */
  corner: Point | null
  pivotSet: boolean
  room: Room
  selection: Room[]
  /** The rooms the selection lies over, with whether any of them can give way. */
  under: { names: string[]; can: boolean }
  canRestore: boolean
  pastSetback: boolean
  settings: Settings
  /** The storey in hand and how many the plan has, for the rows that send a room up or down. */
  storey: number
  storeys: number
  onChoose: (choice: RoomChoice) => void
}

const style = (at: MenuAt) => ({
  left: `${Math.max(4, at.x + 2)}px`,
  top: `${Math.max(4, at.y + 2)}px`,
})

export function RoomMenu(props: RoomMenuProps) {
  const sel = props.selection
  const many = sel.length > 1
  const allLocked = sel.every((o) => o.locked)
  const head = many ? `${sel.length} rooms` : props.room.name
  const oneGroup = sel.every((o) => o.group) && new Set(sel.map((o) => o.group)).size === 1
  const these = many ? 'these zones' : 'this zone'
  if (allLocked)
    return (
      <div className="ctx" style={style(props.at)} onPointerDown={(e) => e.stopPropagation()}>
        <div className="head">{head}</div>
        <button type="button" onClick={() => props.onChoose({ kind: 'lock', on: false })}>
          Unlock<span className="m">locked in place</span>
        </button>
      </div>
    )
  return (
    <div
      className="ctx"
      style={style(props.at)}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="head">{head}</div>
      {props.corner && (
        <button type="button" onClick={() => props.onChoose({ kind: 'pivot', at: props.corner })}>
          Turn about this corner
          <span className="m">
            {fmt(props.corner[0])}, {fmt(props.corner[1])}
          </span>
        </button>
      )}
      {props.pivotSet && (
        <button type="button" onClick={() => props.onChoose({ kind: 'pivot', at: null })}>
          Turn about the middle again
        </button>
      )}
      <button type="button" onClick={() => props.onChoose({ kind: 'quarter' })}>
        Quarter turn<span className="m">R</span>
      </button>
      <button type="button" onClick={() => props.onChoose({ kind: 'north' })}>
        Face north<span className="m">again turns a quarter</span>
      </button>
      <button type="button" onClick={() => props.onChoose({ kind: 'mirror', axis: 'x' })}>
        Mirror left to right
      </button>
      <button type="button" onClick={() => props.onChoose({ kind: 'mirror', axis: 'y' })}>
        Mirror top to bottom
      </button>
      <button type="button" onClick={() => props.onChoose({ kind: 'lock', on: true })}>
        Lock in place<span className="m">nothing moves it</span>
      </button>
      {many && !oneGroup && (
        <button type="button" onClick={() => props.onChoose({ kind: 'group' })}>
          Group together<span className="m">move, turn, lock as one</span>
        </button>
      )}
      {sel.some((o) => o.group) && (
        <button type="button" onClick={() => props.onChoose({ kind: 'ungroup' })}>
          Ungroup
        </button>
      )}
      {many && sel.every((o) => !isOpen(o)) && (
        <>
          <div className="head">Combine into</div>
          {sel.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => props.onChoose({ kind: 'combine', survivor: o.id })}
            >
              {o.name}
              <span className="m">keeps its name and target</span>
            </button>
          ))}
        </>
      )}
      {!many && (
        <button type="button" onClick={() => props.onChoose({ kind: 'reshape' })}>
          Reshape<span className="m">draw what to take away or add</span>
        </button>
      )}
      {props.under.names.length > 0 && (
        <>
          <div className="head">Over {props.under.names.join(', ')}</div>
          <button
            type="button"
            disabled={!props.under.can}
            onClick={() => props.onChoose({ kind: 'give', how: 'carve' })}
          >
            Carve below
            <span className="m">
              {these} cut {many ? 'their shapes' : 'its shape'} out of the zones under{' '}
              {many ? 'them' : 'it'}
            </span>
          </button>
          <button
            type="button"
            disabled={!props.under.can}
            onClick={() => props.onChoose({ kind: 'give', how: 'push' })}
          >
            Push others
            <span className="m">the zones under {many ? 'them' : 'it'} slide aside</span>
          </button>
        </>
      )}
      {props.pastSetback && (
        <button type="button" onClick={() => props.onChoose({ kind: 'cut' })}>
          Cut by the setback<span className="m">what lies past the line goes</span>
        </button>
      )}
      <button type="button" onClick={() => props.onChoose({ kind: 'colour' })}>
        Colour…<span className="m">this room&rsquo;s own</span>
      </button>
      {sel.some((o) => o.color) && (
        <button type="button" onClick={() => props.onChoose({ kind: 'colourReset' })}>
          Back to the category colour
        </button>
      )}
      {sel.some((o) => o.labelAt) && (
        <button type="button" onClick={() => props.onChoose({ kind: 'labelReset' })}>
          Put the name back where it goes by itself
        </button>
      )}
      {props.canRestore && (
        <button type="button" onClick={() => props.onChoose({ kind: 'restore' })}>
          Restore shape
        </button>
      )}
      <button type="button" onClick={() => props.onChoose({ kind: 'copy' })}>
        Copy<span className="m">Ctrl+C · Ctrl+V pastes</span>
      </button>
      {sel.some((o) => !acrossStoreys(o, props.settings)) && (
        <>
          {props.storey < props.storeys - 1 && (
            <>
              <button
                type="button"
                onClick={() => props.onChoose({ kind: 'copyStorey', to: props.storey + 1 })}
              >
                Copy to the {storeyNameOf(props.storey + 1).toLowerCase()} storey
                <span className="m">a copy, same place, one storey up</span>
              </button>
              <button
                type="button"
                onClick={() => props.onChoose({ kind: 'setStorey', to: props.storey + 1 })}
              >
                Move up to the {storeyNameOf(props.storey + 1).toLowerCase()} storey
                <span className="m">same place, one storey up</span>
              </button>
            </>
          )}
          {props.storey > 0 && (
            <button
              type="button"
              onClick={() => props.onChoose({ kind: 'setStorey', to: props.storey - 1 })}
            >
              Move down to the {storeyNameOf(props.storey - 1).toLowerCase()}
              {props.storey === 1 ? '' : ' storey'}
              <span className="m">same place, one storey down</span>
            </button>
          )}
        </>
      )}
      <button type="button" onClick={() => props.onChoose({ kind: 'back' })}>
        Send back to the tray<span className="m">Delete</span>
      </button>
    </div>
  )
}

export type PocketChoice = { kind: 'give'; room: string } | { kind: 'court' } | { kind: 'corridor' }

/** Every room that walls the space in, then a court and a corridor. */
export function PocketMenu(props: {
  at: MenuAt
  pocket: Pocket
  sheet: Sheet
  onChoose: (choice: PocketChoice) => void
}) {
  const why = courtWhy(props.pocket, props.sheet.settings)
  const rows = [...props.pocket.touch.entries()]
    .map(([id, length]) => ({
      room: props.sheet.rooms.find((o) => o.id === id && o.placed && !o.fixed),
      length,
    }))
    .filter((row): row is { room: Room; length: number } => !!row.room)
    .sort((p, q) => q.length - p.length)
  return (
    <div
      className="ctx"
      style={style(props.at)}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="head">Give this {fmt(props.pocket.area)} m² to</div>
      {rows.map((row) => (
        <button
          key={row.room.id}
          type="button"
          onClick={() => props.onChoose({ kind: 'give', room: row.room.id })}
        >
          {row.room.name}
          <span className="m">{fmt(row.length)} m of wall</span>
        </button>
      ))}
      <div className="head">Or make it</div>
      <button type="button" disabled={!!why} onClick={() => props.onChoose({ kind: 'court' })}>
        A court
      </button>
      {why && <div className="why">{why}</div>}
      <button type="button" onClick={() => props.onChoose({ kind: 'corridor' })}>
        A corridor
      </button>
    </div>
  )
}

/** A right-click on empty space that no room walls in says only why there is nothing to do. */
export function EmptyNote(props: { at: MenuAt; note: string }) {
  return (
    <div className="ctx" style={style(props.at)} onPointerDown={(e) => e.stopPropagation()}>
      <div className="why" style={{ maxWidth: '240px' }}>
        {props.note}
      </div>
    </div>
  )
}

/** The three answers for the space in hand, beside it on the sheet. */
export function PocketBar(props: {
  at: MenuAt
  pocket: Pocket
  settings: Settings
  to: Room | null
  onChoose: (choice: PocketChoice) => void
}) {
  const why = courtWhy(props.pocket, props.settings)
  return (
    <div
      className="pocket-bar"
      style={{ left: `${props.at.x}px`, top: `${props.at.y}px` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={!props.to}
        onClick={() => props.to && props.onChoose({ kind: 'give', room: props.to.id })}
      >
        Give to {props.to ? props.to.name : 'a room'}
      </button>
      <button type="button" disabled={!!why} onClick={() => props.onChoose({ kind: 'court' })}>
        Court
      </button>
      <button type="button" onClick={() => props.onChoose({ kind: 'corridor' })}>
        Corridor
      </button>
      <span className="why">
        {why ? why : `${fmt(props.pocket.area)} m². Or click any room to give it there.`}
      </span>
    </div>
  )
}
