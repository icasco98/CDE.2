import type { Check } from '../../graph/types'

/** The graph's warnings beside the diagram, each with its rule and source one line under it. */
export function ChecksPanel(props: {
  readonly checks: readonly Check[]
  readonly onPick: (room: string) => void
}) {
  return (
    <section className="bubbles-panel checks" aria-label="Checks">
      <h2>Checks</h2>
      {props.checks.length === 0 ? (
        <p className="checks-clear">Nothing to warn of.</p>
      ) : (
        <ol>
          {props.checks.map((check, index) => (
            <li key={`${check.code}-${index}`} data-check={check.code}>
              <button
                type="button"
                className="check-sentence"
                disabled={check.rooms.length === 0}
                onClick={() => check.rooms[0] && props.onPick(check.rooms[0])}
              >
                {check.sentence}
              </button>
              <details>
                <summary>Rule and source</summary>
                <p>{check.rule}</p>
                <p className="check-source">{check.source}</p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
