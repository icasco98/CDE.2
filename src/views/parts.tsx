import { GRID_M, outwardWalls, type Point, type Polygon } from '../geometry'
import type { Plot } from '../model'
import { pointsOf } from './frame'
import './sheet.css'

/*
 * The marks both sheets draw: the plot with its street sides, the buildable line the setbacks
 * leave, north, and the scale bar. One copy, so the bubbles and the plan are the same ground.
 * The arrow and the bar are drawn in pixels inside a group counter-scaled by `perPixel`, the
 * metres one pixel covers, so they hold their size on the screen at any zoom.
 */

/** The scale bar at its longest, in pixels: it shortens its run rather than run off the sheet. */
const SCALE_BAR_PX = 160

/** The runs a scale bar will admit, longest first, each with the length of its ticks, in metres. */
const SCALE_RUNS = [
  { length: 5, tick: 1 },
  { length: 2, tick: 0.5 },
  { length: 1, tick: 0.25 },
  { length: 0.5, tick: 0.1 },
] as const

export function PlotSheet({ plot }: { plot: Plot }) {
  const walls = outwardWalls(plot.polygon)
  return (
    <g>
      <defs>
        <pattern
          id="sheet-grid"
          width={GRID_M}
          height={GRID_M}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <path d={`M ${GRID_M} 0 L 0 0 L 0 ${GRID_M}`} className="grid-line" />
        </pattern>
      </defs>
      <polygon
        points={pointsOf(plot.polygon)}
        fill="url(#sheet-grid)"
        className={plot.on ? 'plot' : 'plot plot-off'}
      />
      {plot.street.map((index) => {
        const wall = walls[index]
        if (!wall) return null
        const middle: Point = [
          (wall.from[0] + wall.to[0]) / 2 + wall.normal[0] * 0.9,
          (wall.from[1] + wall.to[1]) / 2 + wall.normal[1] * 0.9,
        ]
        return (
          <g key={index}>
            <line
              x1={wall.from[0]}
              y1={wall.from[1]}
              x2={wall.to[0]}
              y2={wall.to[1]}
              className="street"
            />
            <text x={middle[0]} y={middle[1]} className="street-label">
              street
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** The line the Municipality setbacks leave to build on: a wall, so it is drawn as one, not filled. */
export function BuildableLine({ polygon }: { polygon: Polygon }) {
  if (polygon.length < 3) return null
  return (
    <polygon points={pointsOf(polygon)} className="buildable" data-buildable="">
      <title>The buildable area inside the Municipality setbacks</title>
    </polygon>
  )
}

export function NorthArrow({
  north,
  at,
  perPixel,
}: {
  north: number
  at: Point
  perPixel: number
}) {
  return (
    <g
      className="north"
      transform={`translate(${at[0]} ${at[1]}) scale(${perPixel}) rotate(${north})`}
    >
      <line x1={0} y1={22} x2={0} y2={-22} />
      <polygon points="0,-30 7,-14 -7,-14" />
      <text x={0} y={38}>
        N
      </text>
    </g>
  )
}

/** The longest run that still fits the bar's screen length, so the number under it stays honest. */
export function ScaleBar({ at, perPixel }: { at: Point; perPixel: number }) {
  const run =
    SCALE_RUNS.find((entry) => entry.length / perPixel <= SCALE_BAR_PX) ??
    SCALE_RUNS[SCALE_RUNS.length - 1]
  if (!run) return null
  const across = run.length / perPixel
  const ticks = Math.round(run.length / run.tick)
  return (
    <g className="scale-bar" transform={`translate(${at[0]} ${at[1]}) scale(${perPixel})`}>
      <line x1={0} y1={0} x2={across} y2={0} />
      {Array.from({ length: ticks + 1 }, (_unused, index) => {
        const x = (index * across) / ticks
        return <line key={index} x1={x} y1={-5} x2={x} y2={5} />
      })}
      <text x={across} y={20}>
        {`${run.length} m`}
      </text>
    </g>
  )
}
