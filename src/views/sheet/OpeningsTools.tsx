/**
 * The Openings toolbar: the door types with the width they arrive at, and, beside them, the controls
 * of the door in hand, so nothing floats over the sheet.
 */

import { DOOR, fmt, r2, type DoorRead, type DoorType } from '../../sheet'

const TYPES = Object.keys(DOOR) as DoorType[]

type OpeningsToolsProps = {
  armed: DoorType | null
  width: number
  door: DoorRead | null
  onArm: (type: DoorType | null) => void
  onWidth: (metres: number) => void
  onSwing: () => void
  onHinge: () => void
  onWider: (by: number) => void
  onRemove: () => void
  onReattach: () => void
}

export function OpeningsTools(props: OpeningsToolsProps) {
  const { door } = props
  return (
    <span className="grp place">
      {TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={props.armed === type ? 'on' : ''}
          onClick={() => props.onArm(props.armed === type ? null : type)}
        >
          {DOOR[type].label}
        </button>
      ))}
      <label className="wlab">
        width
        <input
          type="number"
          aria-label="Door width in metres"
          min={0.6}
          max={3}
          step={0.1}
          value={props.width}
          onChange={(event) => {
            const typed = Number.parseFloat(event.target.value)
            if (typed >= 0.6 && typed <= 3) props.onWidth(r2(typed))
          }}
        />
        m
      </label>
      {door && !door.onWall && (
        <span className="door-ctl">
          <span className="who">
            {door.label} on {door.room}, lost its wall
          </span>
          <button type="button" onClick={props.onReattach}>
            Put on the nearest wall
          </button>
          <button type="button" title="Delete" onClick={props.onRemove}>
            Remove
          </button>
        </span>
      )}
      {door && door.onWall && (
        <span className="door-ctl">
          <span className="who">
            {door.label} on {door.room}
          </span>
          {door.swings && (
            <button type="button" title="F" onClick={props.onSwing}>
              Swing
            </button>
          )}
          {door.hinges && (
            <button type="button" title="H or Space" onClick={props.onHinge}>
              Hinge
            </button>
          )}
          <button type="button" title="10 cm narrower" onClick={() => props.onWider(-0.1)}>
            −
          </button>
          <span className="w mono">{fmt(door.width)} m</span>
          <button type="button" title="10 cm wider" onClick={() => props.onWider(0.1)}>
            +
          </button>
          <button type="button" title="Delete" onClick={props.onRemove}>
            Remove
          </button>
        </span>
      )}
    </span>
  )
}
