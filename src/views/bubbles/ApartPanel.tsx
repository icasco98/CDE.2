import type { BubbleApart } from './types'

/** The keep-apart pair in hand: the two rooms, what the pair asks, and the way to let it go. */
export function ApartPanel(props: {
  readonly pair: BubbleApart
  readonly nameOf: (id: string) => string
  readonly onAllow: () => void
}) {
  const { pair, nameOf } = props
  return (
    <section className="bubbles-panel edge-panel" aria-label="Keep apart">
      <h2>
        Keep apart: {nameOf(pair.a)} ↔ {nameOf(pair.b)}
      </h2>
      <p>
        No edge between them, and neither reached only through the other. A warning only: nothing is
        refused or moved for it.
      </p>
      <button type="button" onClick={props.onAllow}>
        Allow together
      </button>
    </section>
  )
}
