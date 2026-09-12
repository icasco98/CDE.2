import { weightOf } from '../../bubbles'
import { families, type Family, type Weights } from '../../model'

const labels: Readonly<Record<Family, string>> = {
  userRequirements: 'User requirements',
  siteConstraints: 'Site constraints',
  environmentalFactors: 'Environmental factors',
}

/** The site rows act on the plot's own coordinates here; the environmental ones are not written yet. */
const notes: Readonly<Partial<Record<Family, string>>> = {
  environmentalFactors: 'waits for milestone 3',
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
