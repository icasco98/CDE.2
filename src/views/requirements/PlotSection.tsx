import { useState } from 'react'
import { area, boundingBox, rectangleToPolygon } from '../../geometry'
import type { Project } from '../../model'
import { session } from '../../app/session'
import { CheckField, NumberField, Section } from './fields'
import { metres2 } from './format'
import { refusalOf } from './refusals'

const sides: readonly { readonly label: string; readonly index: number }[] = [
  { label: 'North side', index: 0 },
  { label: 'East side', index: 1 },
  { label: 'South side', index: 2 },
  { label: 'West side', index: 3 },
]

export function PlotSection({ project }: { project: Project }) {
  const [problem, setProblem] = useState<string | null>(null)
  const { plot } = project
  const box = boundingBox(plot.polygon)
  const answer = (result: ReturnType<typeof session.actions.setPlot>): void =>
    setProblem(refusalOf(result))

  const resize = (width: number, depth: number): void => {
    answer(
      session.actions.setPlot({
        ...plot,
        polygon: rectangleToPolygon({ left: 0, top: 0, width, depth }),
      }),
    )
  }

  const toggleStreet = (index: number, on: boolean): void => {
    const kept = plot.street.filter((side) => side !== index)
    answer(session.actions.setStreet(on ? [...kept, index].sort((a, b) => a - b) : kept))
  }

  return (
    <Section title="Plot">
      <div className="row">
        <NumberField
          label="Width (m)"
          value={box.width}
          step={0.5}
          onCommit={(width) => resize(width, box.depth)}
        />
        <NumberField
          label="Depth (m)"
          value={box.depth}
          step={0.5}
          onCommit={(depth) => resize(box.width, depth)}
        />
        <NumberField
          label="North (degrees from up)"
          value={plot.north}
          step={1}
          min={-360}
          onCommit={(north) => answer(session.actions.setNorth(north))}
        />
        <p className="reading">
          Plot area <strong>{metres2(area(plot.polygon))} m²</strong>
        </p>
      </div>
      <fieldset>
        <legend>Sides on a street</legend>
        {sides.map((side) => (
          <CheckField
            key={side.index}
            label={side.label}
            checked={plot.street.includes(side.index)}
            onChange={(on) => toggleStreet(side.index, on)}
          />
        ))}
      </fieldset>
      <CheckField
        label="Hold rooms inside the plot"
        checked={plot.on}
        onChange={(on) => answer(session.actions.setPlot({ ...plot, on }))}
      />
      {problem ? <p className="problem">{problem}</p> : null}
    </Section>
  )
}
