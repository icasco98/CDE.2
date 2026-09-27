/**
 * The question a door asks when it is put on a wall between two rooms with no edge: a door is the
 * drawing of an edge, so it is placed only with the connection it draws, or not at all.
 */
export function DoorOffer(props: {
  readonly at: { readonly x: number; readonly y: number }
  readonly names: readonly [string, string]
  readonly onAccept: () => void
  readonly onDecline: () => void
}) {
  return (
    <div
      className="door-offer"
      role="dialog"
      aria-label="Add connection"
      style={{ left: `${props.at.x}px`, top: `${props.at.y}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p>
        Add connection {props.names[0]} ↔ {props.names[1]}?
      </p>
      <div>
        <button type="button" className="primary" onClick={props.onAccept}>
          Add connection
        </button>
        <button type="button" onClick={props.onDecline}>
          Cancel
        </button>
      </div>
    </div>
  )
}
