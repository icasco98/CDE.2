import { useMemo } from 'react'
import type { Spot } from '../../bubbles/arrange'
import { cloudsOf } from '../../bubbles/clouds'
import { categoryLabels } from '../../rulebook'
import type { BubbleZone } from './types'

const labelOf = (category: string): string =>
  (categoryLabels as Readonly<Record<string, string>>)[category] ?? category

/** Each category's cloud on each storey, drawn under the lines and bubbles and out of the hand's way. */
export function Clouds(props: {
  readonly spots: readonly Spot[]
  readonly zones: ReadonlyMap<string, BubbleZone>
  readonly dimmed: (storey: number) => boolean
}) {
  const { spots, zones } = props
  const clouds = useMemo(() => cloudsOf(spots, (id) => zones.get(id)?.category), [spots, zones])
  return (
    <g className="clouds" aria-hidden="true">
      {clouds.map((cloud) => (
        <g
          key={cloud.key}
          data-cloud={cloud.category}
          data-storey={cloud.storey}
          className={props.dimmed(cloud.storey) ? 'cloud cloud-dimmed' : 'cloud'}
        >
          <path d={cloud.path} className={`category-${cloud.category}`} />
          <text x={cloud.label.x} y={cloud.label.y - 4}>
            {labelOf(cloud.category)}
          </text>
        </g>
      ))}
    </g>
  )
}
