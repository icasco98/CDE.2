/**
 * The program: one block per room, in the order of importance. A hollow block is still to place and
 * drags onto the sheet or is drawn; a filled one selects the room it stands for. The grip reorders.
 */

import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  KINDS,
  KIND_INFO,
  STOREY_MARK,
  acrossStoreys,
  areaOf,
  fmt,
  r2,
  storeyOf,
  type Room,
  type Sheet,
} from '../../sheet'
import { reorderSide, type Shape } from './gestures'

type ProgramProps = {
  sheet: Sheet
  selection: string[]
  /** The room a shape is being drawn for, so its Draw button reads as in hand. */
  drawingId: string | null
  drawMenuFor: string | null
  onNewDown: (room: Room, event: ReactPointerEvent) => void
  onPick: (room: Room) => void
  onRemove: (room: Room) => void
  onReorder: (id: string, before: string | null) => void
  onDrawMenu: (id: string | null) => void
  onDraw: (id: string, shape: Shape) => void
  onAdd: (kind: string, name: string, area: number) => void
}

const shapes: [Shape, string, string][] = [
  ['rect', 'A rectangle', 'drag corner to corner'],
  ['circle', 'A circle', 'drag from the centre'],
  ['poly', 'A polygon', 'click the corners'],
]

export function Program(props: ProgramProps) {
  const { sheet } = props
  const list = sheet.rooms.filter((r) => !r.extra)
  const unplaced = list.filter((r) => !r.placed)
  const upstairs = list.some((r) => r.placed && storeyOf(r) > 0)

  const beginReorder = (room: Room, event: ReactPointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const move = (moving: PointerEvent) => {
      const under = document.elementFromPoint(moving.clientX, moving.clientY)
      const item = under?.closest('.tray .item')
      const overId = item instanceof HTMLElement ? item.dataset.room : undefined
      if (!overId || overId === room.id) return
      const box = item!.getBoundingClientRect()
      const order = sheet.rooms.map((r) => r.id).filter((id) => id !== room.id)
      const at = order.indexOf(overId)
      const side = reorderSide(moving.clientY, box)
      const before = side === 'after' ? (order[at + 1] ?? null) : overId
      props.onReorder(room.id, before)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
  }

  return (
    <aside>
      <h2>
        <span>Program</span>
        <span className="mono">{unplaced.length ? `${unplaced.length} left` : 'all placed'}</span>
      </h2>
      <div className="tray">
        {list.map((room) => {
          const drawing = props.drawingId === room.id
          return (
            <div
              key={room.id}
              className={`item ${room.cat} ${room.placed ? 'placed' : 'hollow'}${
                room.placed && props.selection.includes(room.id) ? ' selected' : ''
              }${room.group ? ' grouped' : ''}`}
              data-room={room.id}
              style={{ flex: `${room.target} 1 0`, background: room.color ?? undefined }}
              title={`${room.name} · ${fmt(room.target)} m² · ${fmt(room.w)} × ${fmt(room.h)} m${
                room.placed ? ': click to select it' : ': drag it onto the sheet, or Draw it'
              }`}
              onPointerDown={(event) => {
                if (event.target instanceof Element && event.target.closest('button')) return
                if (room.placed) return
                props.onNewDown(room, event)
              }}
              onClick={() => {
                if (room.placed) props.onPick(room)
              }}
            >
              <span
                className="grip"
                title="Drag to reorder: higher in the list is more important and never gives way to a room below it"
                onPointerDown={(event) => beginReorder(room, event)}
              >
                ⋮
              </span>
              {room.placed && <i className="swatch" />}
              <div className="n">
                {room.name}
                {room.placed && (storeyOf(room) > 0 || upstairs) && (
                  <span className="st">
                    {' '}
                    {acrossStoreys(room, sheet.settings) ? 'all' : STOREY_MARK[storeyOf(room)]}
                  </span>
                )}
              </div>
              <div className="a mono">
                {room.placed
                  ? `${fmt(r2(areaOf(room)))} of ${fmt(room.target)}`
                  : `${fmt(room.target)} m²`}
              </div>
              {!room.placed && (
                <div className="ways">
                  <button
                    type="button"
                    className={drawing || props.drawMenuFor === room.id ? 'on' : ''}
                    title="Draw this room on the sheet instead of dropping it"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => props.onDrawMenu(props.drawMenuFor === room.id ? null : room.id)}
                  >
                    {drawing ? 'Drawing…' : 'Draw ▾'}
                  </button>
                </div>
              )}
              <button
                type="button"
                className="x"
                title={`Remove ${room.name} from the program`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => props.onRemove(room)}
              >
                ×
              </button>
              {props.drawMenuFor === room.id && (
                <div className="ctx" style={{ left: 0, top: '100%' }}>
                  <div className="head">Draw {room.name} as</div>
                  {shapes.map(([shape, label, how]) => (
                    <button key={shape} type="button" onClick={() => props.onDraw(room.id, shape)}>
                      {label}
                      <span className="m">{how}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <AddRoom onAdd={props.onAdd} />
    </aside>
  )
}

/** A room added to the program: its kind, a name of its own, and a size from the kind's range. */
function AddRoom({ onAdd }: { onAdd: ProgramProps['onAdd'] }) {
  const kinds = Object.keys(KIND_INFO).filter((kind) => kind in KINDS)
  const [kind, setKind] = useState(kinds[0] ?? 'room')
  const [name, setName] = useState('')
  const [size, setSize] = useState('medium')
  const [area, setArea] = useState('12')
  const info = KIND_INFO[kind]
  const target =
    size === 'custom'
      ? Number(area)
      : !info
        ? 0
        : size === 'big'
          ? info[2]
          : size === 'small'
            ? info[1]
            : r2((info[1] + info[2]) / 2)
  return (
    <div className="add-room">
      <label>
        <span className="mono" hidden>
          Kind
        </span>
        <select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          {kinds.map((key) => (
            <option key={key} value={key}>
              {KIND_INFO[key]![0]}
            </option>
          ))}
        </select>
      </label>
      <div className="add-line">
        <input
          type="text"
          aria-label="Name"
          placeholder="Name"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select aria-label="Size" value={size} onChange={(event) => setSize(event.target.value)}>
          <option value="big">big</option>
          <option value="medium">medium</option>
          <option value="small">small</option>
          <option value="custom">m²…</option>
        </select>
        {size === 'custom' && (
          <input
            type="number"
            aria-label="Area in m²"
            min={1}
            step={0.5}
            value={area}
            onChange={(event) => setArea(event.target.value)}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          onAdd(kind, name, target)
          setName('')
        }}
      >
        + Add to the program
      </button>
    </div>
  )
}
