import type { ConnectionKind } from '../../model'
import type { BubbleLink } from './types'

const kinds: readonly { readonly kind: ConnectionKind; readonly label: string }[] = [
  { kind: 'door', label: 'Door' },
  { kind: 'open', label: 'Open' },
]

/** The connection in hand: the two zones it joins, where it came from, its kind, and the way out. */
export function ConnectionPanel(props: {
  readonly connection: BubbleLink
  readonly nameOf: (id: string) => string
  readonly onSetKind: (kind: ConnectionKind) => void
  readonly onDelete: () => void
}) {
  const { connection } = props
  const front = connection.kind === 'main-door'
  return (
    <section className="bubbles-panel connection-panel" aria-label="Connection">
      <h2>
        {props.nameOf(connection.a)} ↔ {props.nameOf(connection.b)}
      </h2>
      <p className="connection-source">{connection.source ?? 'Added by hand.'}</p>
      {front ? (
        <p className="connection-kind">The front door: it stays a door.</p>
      ) : (
        <div className="connection-kind" role="group" aria-label="Kind">
          {kinds.map((each) => (
            <button
              key={each.kind}
              type="button"
              aria-pressed={connection.kind === each.kind}
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
