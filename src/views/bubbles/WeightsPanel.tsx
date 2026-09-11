import { families, type Family, type Weights } from '../../model'

const labels: Readonly<Record<Family, string>> = {
  userRequirements: 'User requirements',
  siteConstraints: 'Site constraints',
  environmentalFactors: 'Environmental factors',
}

/** Where a family's forces are felt; the bubbles answer only to the first of the three. */
const notes: Readonly<Partial<Record<Family, string>>> = {
  siteConstraints: 'acts in zoning',
  environmentalFactors: 'acts in zoning',
}

/** A weight nobody has set sits in the middle, so an untouched project pulls no way in particular. */
const middle = 0.5

export function weightOf(weights: Weights, family: Family): number {
  return weights[family] ?? middle
}

/** The three families beside the diagram they change, so a slider and its answer are read together. */
export function WeightsPanel(props: {
  weights: Weights
  onSetWeight: (family: Family, weight: number) => void
}) {
  return (
    <section className="weights-panel">
      <h2>Weights</h2>
      {families.map((family) => {
        const label = labels[family]
        const weight = weightOf(props.weights, family)
        return (
          <label className="field" key={family}>
            <span>
              {label} {weight.toFixed(2)}
            </span>
            <input
              type="range"
              aria-label={label}
              min={0}
              max={1}
              step={0.05}
              value={weight}
              onChange={(event) => props.onSetWeight(family, Number(event.target.value))}
            />
            {notes[family] ? <span className="note">{notes[family]}</span> : null}
          </label>
        )
      })}
    </section>
  )
}
