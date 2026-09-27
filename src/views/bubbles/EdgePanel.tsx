import type { EdgeKind } from '../../model'
import type { BubbleLink } from './types'

const kinds: readonly { readonly kind: EdgeKind; readonly label: string }[] = [
  { kind: 'door', label: 'Door' },
  { kind: 'open', label: 'Open' },
]

/** The connection in hand: the two rooms it joins, where it came from, its kind, and the way out. */
export function EdgePanel(props: {
  readonly edge: BubbleLink
  readonly nameOf: (id: string) => string
  readonly onSetKind: (kind: EdgeKind) => void
  readonly onDelete: () => void
}) {
  const { edge } = props
  const front = edge.kind === 'main-door'
  return (
    <section className="bubbles-panel edge-panel" aria-label="Connection">
      <h2>
        {props.nameOf(edge.a)} ↔ {props.nameOf(edge.b)}
      </h2>
      <p className="edge-source">{edge.source ?? 'Added by hand.'}</p>
      {front ? (
        <p className="edge-kind">The front door: it stays a door.</p>
      ) : (
        <div className="edge-kind" role="group" aria-label="Kind">
          {kinds.map((each) => (
            <button
              key={each.kind}
              type="button"
              aria-pressed={edge.kind === each.kind}
              onClick={() => props.onSetKind(each.kind)}
            >
              {each.label}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={props.onDelete}>
        Delete connection
      </button>
    </section>
  )
}
