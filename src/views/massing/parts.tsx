import type { PointerEvent as ReactPointerEvent } from 'react'
import { outwardWalls, type Point } from '../../geometry'
import {
  MAX_BUILDING_HEIGHT_M,
  MIN_CLEAR_HEIGHT_M,
  PLAN_ELEVATION_DEG,
  PLOT_RATIO_PERCENT,
  formulas,
  presets,
  project,
  type Envelope,
  type Face,
  type Point3,
  type View,
} from '../../massing'
import type { Plot } from '../../model'
import { NumberInput } from '../requirements/fields'
import { storeyLabel } from '../requirements/format'
import { northOf, pointsOf } from './frame'

/** The length of the bar the drawing is read against, in metres. */
const SCALE_M = 5

/** How far above its roof the turn handle stands on the sheet, and how wide its grip is, in metres. */
const TURN_REACH_M = 1.6
const TURN_GRIP_M = 0.5

function oneDecimal(value: number): string {
  return value.toFixed(1)
}

/** A point of the sheet laid on the ground. */
function flat(corner: Point): Point3 {
  return [corner[0], corner[1], 0]
}

/** A wall is toned by the compass point it faces, not by where the viewer stands, so the mass keeps its modelling as it turns. */
function toneOf(facing: Point | undefined, southward: Point): string {
  if (!facing) return 'face-top'
  const south = facing[0] * southward[0] + facing[1] * southward[1]
  if (south > 0.5) return 'face-wall face-south'
  if (south < -0.5) return 'face-wall face-north'
  return 'face-wall'
}

export function Prism(props: {
  roomId: string
  name: string
  floorArea: number
  faces: readonly Face[]
  selected: boolean
  /** Whether the room stands on the storey in view, which is drawn full and the rest a shade back. */
  lit: boolean
  view: View
  /** Which way south lies on the sheet, for the tone of each wall. */
  southward: Point
  onSelect: (event: ReactPointerEvent) => void
  /** The roof is the face the hand slides the room by, so it takes the pointer for itself. */
  onGrabTop: (event: ReactPointerEvent) => void
}) {
  return (
    <g
      data-room={props.roomId}
      data-storey-lit={props.lit ? 'true' : 'false'}
      className={props.selected ? 'prism prism-selected' : 'prism'}
      onPointerDown={props.onSelect}
    >
      <title>{`${props.name}, ${oneDecimal(props.floorArea)} m²`}</title>
      {props.faces.map((face, at) => (
        <polygon
          key={at}
          points={pointsOf(face.corners, props.view)}
          className={toneOf(face.facing, props.southward)}
          onPointerDown={face.kind === 'top' ? props.onGrabTop : undefined}
        />
      ))}
    </g>
  )
}

/** The handle that turns the selected room, standing above its roof, clear of every wall. */
export function TurnHandle({
  at,
  view,
  onGrab,
}: {
  at: Point3
  view: View
  onGrab: (event: ReactPointerEvent) => void
}) {
  // Held above the roof on the sheet rather than above it in the air: looking straight down, a
  // handle raised in z would be drawn on the roof itself and stand over the grip that slides it.
  const foot = project(at, view)
  const head: Point = [foot[0], foot[1] - TURN_REACH_M]
  return (
    <g className="turn-handle">
      <line x1={foot[0]} y1={foot[1]} x2={head[0]} y2={head[1]} className="turn-stem" />
      <circle
        cx={head[0]}
        cy={head[1]}
        r={TURN_GRIP_M}
        className="turn-grip"
        data-turn-handle="true"
        onPointerDown={onGrab}
      >
        <title>Turn the room</title>
      </circle>
    </g>
  )
}

/** The plot laid flat, with its street sides heavy. */
export function Ground({ plot, view }: { plot: Plot; view: View }) {
  const walls = outwardWalls(plot.polygon)
  return (
    <g className="ground">
      <polygon
        points={pointsOf(plot.polygon.map(flat), view)}
        className={plot.on ? 'plot' : 'plot plot-off'}
      />
      {plot.street.map((index) => {
        const wall = walls[index]
        if (!wall) return null
        return (
          <polyline
            key={index}
            points={pointsOf([flat(wall.from), flat(wall.to)], view)}
            className="street"
          />
        )
      })}
    </g>
  )
}

/** North drawn on the ground beside the plot, so it turns with the view instead of floating over it. */
export function NorthMark({ at, north, view }: { at: Point; north: number; view: View }) {
  const way = northOf(north)
  const tip: Point = [at[0] + way[0] * 2.2, at[1] + way[1] * 2.2]
  const across: Point = [-way[1] * 0.5, way[0] * 0.5]
  const label = project(flat([at[0] + way[0] * 3.4, at[1] + way[1] * 3.4]), view)
  return (
    <g className="north">
      <polyline points={pointsOf([flat(at), flat(tip)], view)} className="north-stem" />
      <polygon
        points={pointsOf(
          [
            flat([tip[0] + way[0] * 0.6, tip[1] + way[1] * 0.6]),
            flat([tip[0] + across[0], tip[1] + across[1]]),
            flat([tip[0] - across[0], tip[1] - across[1]]),
          ],
          view,
        )}
        className="north-head"
      />
      <text x={label[0]} y={label[1]} className="ground-label" fontSize={0.9}>
        N
      </text>
    </g>
  )
}

/** Five metres along the ground's own x axis, so the drawing can be measured whichever way it faces. */
export function ScaleReference({ at, view }: { at: Point; view: View }) {
  const from = flat(at)
  const to = flat([at[0] + SCALE_M, at[1]])
  const end = project(to, view)
  return (
    <g className="scale-reference">
      <polyline points={pointsOf([from, to], view)} />
      {[0, SCALE_M].map((metre) => (
        <polyline
          key={metre}
          points={pointsOf(
            [flat([at[0] + metre, at[1] - 0.3]), flat([at[0] + metre, at[1] + 0.3])],
            view,
          )}
        />
      ))}
      <text x={end[0]} y={end[1] + 1} className="ground-label" fontSize={0.9}>
        {`${SCALE_M} m`}
      </text>
    </g>
  )
}

export function Views(props: {
  view: View
  /** Where the viewer stands to draw this plot's north straight up the screen. */
  planAzimuth: number
  onGoTo: (view: View) => void
  onFit: () => void
}) {
  const standing = (azimuth: number, elevation: number): boolean =>
    Math.abs(props.view.azimuth - azimuth) < 0.5 && Math.abs(props.view.elevation - elevation) < 0.5
  return (
    <div className="massing-views" role="group" aria-label="View">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-pressed={standing(preset.azimuth, preset.elevation)}
          onClick={() => props.onGoTo({ azimuth: preset.azimuth, elevation: preset.elevation })}
        >
          {preset.id}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={standing(props.planAzimuth, PLAN_ELEVATION_DEG)}
        onClick={() => props.onGoTo({ azimuth: props.planAzimuth, elevation: PLAN_ELEVATION_DEG })}
      >
        Plan
      </button>
      <button type="button" onClick={props.onFit}>
        Fit
      </button>
    </div>
  )
}

/** One editable floor-to-floor height per storey, with the Municipality's walls said beside it. */
export function Heights(props: {
  heights: readonly number[]
  total: number
  onHeight: (storey: number, metres: number) => void
}) {
  const tall = props.total > MAX_BUILDING_HEIGHT_M
  return (
    <section className="massing-heights">
      <h3>Storey heights</h3>
      <ul>
        {props.heights.map((height, storey) => (
          <li key={storey}>
            <span className="height-name">{storeyLabel(storey)}</span>
            <NumberInput
              label={`Height of ${storeyLabel(storey)}`}
              value={height}
              step={0.1}
              min={0}
              onCommit={(metres) => props.onHeight(storey, metres)}
            />
            <span className="height-unit">m</span>
            {height < MIN_CLEAR_HEIGHT_M && (
              <span className="warning">
                {`under the Municipality's ${MIN_CLEAR_HEIGHT_M} m clear minimum`}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className={tall ? 'warning' : 'height-total'}>
        {`${oneDecimal(props.total)} m in all` +
          (tall ? `, over the Municipality's ${MAX_BUILDING_HEIGHT_M} m maximum` : '')}
      </p>
    </section>
  )
}

function Figure({
  name,
  label,
  value,
  formula,
}: {
  name: string
  label: string
  value: string
  formula: string
}) {
  return (
    <div className="number" title={formula}>
      <dt>{label}</dt>
      <dd data-number={name}>{value}</dd>
    </div>
  )
}

export function Numbers({ envelope, plotArea }: { envelope: Envelope; plotArea: number }) {
  const over = envelope.plotRatioPercent > PLOT_RATIO_PERCENT
  return (
    <section className="massing-numbers">
      <h3>The envelope</h3>
      <dl>
        <Figure
          name="gross-floor"
          label="Gross floor area"
          value={`${oneDecimal(envelope.grossFloorArea)} m²`}
          formula={formulas.grossFloorArea}
        />
        <Figure
          name="plot-ratio"
          label="Of the plot"
          value={
            plotArea > 0
              ? `${oneDecimal(envelope.plotRatioPercent)}% of ${oneDecimal(plotArea)} m²`
              : 'no plot drawn'
          }
          formula={formulas.plotRatioPercent}
        />
        <Figure
          name="wall-area"
          label="Envelope wall"
          value={`${oneDecimal(envelope.wallArea)} m²`}
          formula={formulas.wallArea}
        />
        <Figure
          name="roof-area"
          label="Roof"
          value={`${oneDecimal(envelope.roofArea)} m²`}
          formula={formulas.roofArea}
        />
        <Figure
          name="volume"
          label="Volume"
          value={`${oneDecimal(envelope.volume)} m³`}
          formula={formulas.volume}
        />
        {/* Three places, because one would round every villa's ratio to the same 0.7. */}
        <Figure
          name="surface-to-volume"
          label="Surface to volume"
          value={`${envelope.surfaceToVolume.toFixed(3)} per m`}
          formula={formulas.surfaceToVolume}
        />
        <Figure
          name="building-height"
          label="Height"
          value={`${oneDecimal(envelope.buildingHeight)} m`}
          formula={formulas.buildingHeight}
        />
      </dl>
      <p className={over ? 'warning' : 'against'}>
        {`The Municipality allows ${PLOT_RATIO_PERCENT}% of the plot area on a plot of 401 m² and above, and ${MAX_BUILDING_HEIGHT_M} m of height.`}
      </p>
      <h3>Storey by storey</h3>
      <table className="massing-storeys">
        <thead>
          <tr>
            <th scope="col">Storey</th>
            <th scope="col" title={formulas.floorArea}>
              Floor
            </th>
            <th scope="col" title={formulas.outlineArea}>
              Outline
            </th>
            <th scope="col" title={formulas.outlinePerimeter}>
              Perimeter
            </th>
          </tr>
        </thead>
        <tbody>
          {envelope.perStorey.map((numbers) => (
            <tr key={numbers.storey} data-storey={numbers.storey}>
              <th scope="row">{storeyLabel(numbers.storey)}</th>
              <td>{`${oneDecimal(numbers.floorArea)} m²`}</td>
              <td>{`${oneDecimal(numbers.outlineArea)} m²`}</td>
              <td>{`${oneDecimal(numbers.outlinePerimeter)} m`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
