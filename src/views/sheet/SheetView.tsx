/**
 * The sheet itself: the plot, the setback line, the rooms and every mark the mock draws over them.
 * It draws what it is given and reports where the pointer landed; the stage decides what that means.
 */

import {
  Fragment,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  BUILD,
  NORTH,
  acrossStoreys,
  allPlaced,
  centreOfFootprint,
  ghostsOf,
  isCourt,
  isGhost,
  PLOT,
  PLOT_BOX,
  areaOf,
  bboxOf,
  boundaryWalls,
  facing,
  fmt,
  isOpen,
  loopsOf,
  norm,
  outlineOf,
  piecesOf,
  r2,
  sideOf,
  square,
  storeyOf,
  type LabelPlan,
  type Point,
  type Poly,
  type Report,
  type Room,
  type Seg,
  type Settings,
  type Sheet,
  type Side4,
  type Pocket,
} from '../../sheet'
import { viewBoxOf, type Camera, type Extent } from '../camera'
import {
  angleShown,
  shapePolygon,
  shownRoom,
  type Drag,
  type Drawing,
  type Measure,
} from './gestures'
import { snapWord } from './sentence'
import { frameOf, p4 } from './shape'
import { Doors, type OpeningsDraw } from './Doors'

/** How far past the plot the sheet is drawn, so the north arrow and the street names have room. */
const PAD = 1.6

export const sheetExtent: Extent = {
  minX: -PAD,
  minY: -PAD,
  width: PLOT.w + 2 * PAD,
  height: PLOT.h + 2 * PAD,
}

/** Everything the sheet draws that is read from the sheet rather than from the hand. */
export type SheetRead = {
  rooms: Room[]
  labels: Map<string, LabelPlan>
  overlaps: { ids: [string, string]; polys: Poly[] }[]
  pockets: Pocket[]
  read: Report
  /** The sides built past their budget, so a boundary wall is drawn in the warning colour. */
  over: Set<string>
  /** How many doors in each room stands, and which the walk never reaches: the Openings step only. */
  walk: { depth: Map<string, number>; unreached: Set<string> } | null
}

export type SheetHandlers = {
  onRoomDown: (room: Room, event: ReactPointerEvent) => void
  onRoomMenu: (room: Room, event: ReactMouseEvent) => void
  onWallDown: (
    room: Room,
    wall: number,
    side: Side4 | null,
    shared: string | null,
    event: ReactPointerEvent,
  ) => void
  onCornerDown: (room: Room, index: number, loop: Poly, event: ReactPointerEvent) => void
  onTurnDown: (room: Room, event: ReactPointerEvent) => void
  onGroupTurnDown: (event: ReactPointerEvent) => void
  onLabelDown: (room: Room, event: ReactPointerEvent) => void
  onBackgroundDown: (event: ReactPointerEvent) => void
  onBackgroundMenu: (event: ReactMouseEvent) => void
  onPocketDown: (index: number, event: ReactPointerEvent) => void
  onPocketMenu: (index: number, event: ReactMouseEvent) => void
  onTypeSize: (room: Room, what: 'w' | 'h' | 'angle' | 'area', event: ReactMouseEvent) => void
  onWheel: (event: ReactWheelEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onDoubleClick: () => void
}

type SheetViewProps = {
  sheet: Sheet
  storey: number
  view: SheetRead
  selection: string[]
  drag: Drag | null
  drawing: Drawing | null
  measure: Measure | null
  reshaping: string | null
  pocketPicked: number | null
  /** The room the pointer is over, in the sheet or in the mass: hover is shared between them. */
  hover: string | null
  /** The Openings step: the doors answer the hand, and the room lit from the program list. */
  openings: OpeningsDraw | null
  lit: string | null
  panning: boolean
  camera: Camera
  svgRef: (element: SVGSVGElement | null) => void
  on: SheetHandlers
}

const bodyPath = (r: Room) =>
  piecesOf(r)
    .map(
      (p) =>
        'M' +
        facing(p)
          .map((pt) => `${p4(pt[0])} ${p4(pt[1])}`)
          .join('L') +
        'z',
    )
    .join('')

const wallPath = (r: Room) =>
  outlineOf(r)
    .map((s) => `M${p4(s.a[0])} ${p4(s.a[1])}L${p4(s.b[0])} ${p4(s.b[1])}`)
    .join('')

const points = (p: Poly) => p.map((v) => `${p4(v[0])},${p4(v[1])}`).join(' ')

/** A plain room's neighbour on the other side of a whole shared wall, which a drag takes with it. */
function sharedWallOf(r: Room, side: Side4, rooms: Room[], settings: Settings): Room | null {
  if (!settings.sharedWalls || !square(r) || (r.pieces && r.pieces.length)) return null
  const tol = 0.02
  const right = (o: Room) => o.x + o.w
  const bottom = (o: Room) => o.y + o.h
  return (
    rooms.find(
      (o) =>
        o !== r &&
        square(o) &&
        !(o.pieces && o.pieces.length) &&
        ((side === 'right' &&
          Math.abs(o.x - right(r)) < tol &&
          o.y < bottom(r) &&
          bottom(o) > r.y) ||
          (side === 'left' &&
            Math.abs(right(o) - r.x) < tol &&
            o.y < bottom(r) &&
            bottom(o) > r.y) ||
          (side === 'bottom' &&
            Math.abs(o.y - bottom(r)) < tol &&
            o.x < right(r) &&
            right(o) > r.x) ||
          (side === 'top' && Math.abs(bottom(o) - r.y) < tol && o.x < right(r) && right(o) > r.x)),
    ) ?? null
  )
}

export function SheetView(props: SheetViewProps) {
  const { sheet, view, selection, drag, drawing, measure, reshaping, hover, on } = props
  const { settings } = sheet
  const background = useMemo(() => <Background settings={settings} />, [settings])
  const shown = view.rooms.map((r) => shownRoom(r, drag))
  const storey = props.storey
  // The storey below is drawn faint under the one in hand, and what stands open to below with an X.
  const under = useMemo(
    () =>
      storey > 0 && settings.showUnder
        ? allPlaced(sheet).filter(
            (r) =>
              storeyOf(r) === storey - 1 &&
              !acrossStoreys(r, settings) &&
              !isGhost(r, storey, sheet),
          )
        : [],
    [sheet, settings, storey],
  )
  const ghosts = useMemo(() => ghostsOf(sheet, storey), [sheet, storey])
  const focusId =
    drag && 'id' in drag && drag.kind !== 'new'
      ? drag.id
      : selection.length === 1
        ? selection[0]!
        : null
  const focus = shown.find((r) => r.id === focusId && !r.fixed) ?? null
  const chosen = shown.filter((r) => selection.includes(r.id))
  const guides = drag && 'guides' in drag ? drag.guides : (drawing?.snap?.guides ?? [])
  const drawn = drawing ? shapePolygon(drawing) : null
  return (
    <svg
      className={`sheet${props.openings ? ' doormode' : ''}${drawing ? ' drawing' : ''}${measure ? ' measuring' : ''}${reshaping ? ' reshaping' : ''}${props.panning ? ' panning' : ''}`}
      ref={props.svgRef}
      viewBox={viewBoxOf(sheetExtent, props.camera)}
      onPointerDown={on.onBackgroundDown}
      onPointerMove={on.onPointerMove}
      onContextMenu={on.onBackgroundMenu}
      onWheel={on.onWheel}
      onDoubleClick={on.onDoubleClick}
    >
      <defs>
        <pattern
          id="sheet-hatch"
          width={0.5}
          height={0.5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={0.5}
            stroke="var(--build)"
            strokeWidth={0.03}
            strokeOpacity={0.5}
          />
        </pattern>
      </defs>
      {background}
      {view.pockets.map((pocket, i) => (
        <g key={`pocket-${i}`} data-pocket={i}>
          {pocket.pieces.map((piece, j) => (
            <polygon
              key={j}
              points={points(piece)}
              className={`pocket${i === props.pocketPicked ? ' picked' : ''}`}
              onPointerDown={(event) => on.onPocketDown(i, event)}
              onContextMenu={(event) => on.onPocketMenu(i, event)}
            />
          ))}
          <text className="pocket-label" x={p4(pocket.centre[0])} y={p4(pocket.centre[1] + 0.15)}>
            {fmt(pocket.area)} m²
          </text>
        </g>
      ))}
      {view.overlaps.map((o, i) =>
        o.polys.map((poly, j) => (
          <polygon key={`overlap-${i}-${j}`} points={points(poly)} className="overlap-poly" />
        )),
      )}
      {under.map((r) => (
        <g key={`under-${r.id}`} className="room under" transform={frameOf(r)}>
          <path className="body" d={bodyPath(r)} fillRule="evenodd" />
        </g>
      ))}
      {ghosts.map((r) => {
        const pts = piecesOf(r).flat()
        const x0 = Math.min(...pts.map((q) => q[0]))
        const y0 = Math.min(...pts.map((q) => q[1]))
        const x1 = Math.max(...pts.map((q) => q[0]))
        const y1 = Math.max(...pts.map((q) => q[1]))
        const c = centreOfFootprint(r)
        return (
          <g key={`below-${r.id}`} className={`room below ${r.cat}`} transform={frameOf(r)}>
            <path className="body" d={bodyPath(r)} fillRule="evenodd" />
            <line className="x" x1={p4(x0)} y1={p4(y0)} x2={p4(x1)} y2={p4(y1)} />
            <line className="x" x1={p4(x1)} y1={p4(y0)} x2={p4(x0)} y2={p4(y1)} />
            <text className="below-label" x={p4(c[0])} y={p4(c[1] + 0.15)}>
              {isCourt(r) ? 'court · open to the sky' : 'open to below'}
            </text>
          </g>
        )
      })}
      {props.storey === 0 &&
        shown
          .filter((r) => !r.fixed && !isOpen(r))
          .flatMap((r) =>
            boundaryWalls(r).map((wall, i) => (
              <BoundaryWall key={`b-${r.id}-${i}`} wall={wall} over={view.over.has(wall.side)} />
            )),
          )}
      {shown.map((r) => {
        const over = view.overlaps.some((o) => o.ids.includes(r.id))
        const picked = selection.includes(r.id)
        const plan = view.labels.get(r.id)
        const spill = view.read.spills.includes(r.name)
        const depth = view.walk?.depth.get(r.id)
        return (
          <g
            key={r.id}
            className={`room ${r.cat}${picked ? ' selected' : ''}${hover === r.id ? ' hover' : ''}${over ? ' over' : ''}${
              drag && 'id' in drag && drag.id === r.id ? ' moving' : ''
            }${r.locked ? ' locked' : ''}${reshaping === r.id ? ' target' : ''}${
              view.walk?.unreached.has(r.id) ? ' unreached' : ''
            }${props.lit === r.id ? ' lit' : ''}`}
            transform={frameOf(r)}
            data-room={r.id}
            onPointerDown={(event) => on.onRoomDown(r, event)}
            onContextMenu={(event) => on.onRoomMenu(r, event)}
          >
            <path className="body" d={bodyPath(r)} fill={r.color ?? undefined} />
            {r.fixed && <path className="court-hatch" d={bodyPath(r)} />}
            {r.locked && (
              <path
                className="lock-mark"
                d={`M${p4(r.w - 0.55)} 0.42h0.35v0.28h-0.35zM${p4(r.w - 0.48)} 0.42v-0.12a0.105 0.105 0 0 1 0.21 0v0.12`}
              />
            )}
            <path className="wall" d={wallPath(r)} />
            {spill && (
              <rect className="spill" x={0.04} y={0.04} width={r.w - 0.08} height={r.h - 0.08} />
            )}
            {plan && (
              <Label
                room={r}
                plan={plan}
                depth={depth === undefined ? null : `${depth} ${depth === 1 ? 'door' : 'doors'} in`}
                movable={
                  picked &&
                  selection.length === 1 &&
                  !r.fixed &&
                  !measure &&
                  !reshaping &&
                  !drawing &&
                  !props.openings
                }
                typable={picked && selection.length === 1 && !r.fixed && !r.locked && !isOpen(r)}
                on={on}
              />
            )}
          </g>
        )
      })}
      {drawing && drawn && (
        <g className="draw-preview">
          <polygon points={points(drawn)} />
          {drawing.pts.map((pt, i) => (
            <circle key={i} className="dot" cx={p4(pt[0])} cy={p4(pt[1])} r={0.12} />
          ))}
          {drawing.shape === 'poly' && drawing.pts.length > 0 && drawing.at && (
            <line
              x1={p4(drawing.pts[drawing.pts.length - 1]![0])}
              y1={p4(drawing.pts[drawing.pts.length - 1]![1])}
              x2={p4(drawing.at[0])}
              y2={p4(drawing.at[1])}
            />
          )}
        </g>
      )}
      {drawing?.snap && drawing.at && <SnapMarks snap={drawing.snap} at={drawing.at} />}
      {settings.guides !== 0 &&
        guides.map((g, i) => (
          <line key={`guide-${i}`} className="guide" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
        ))}
      {chosen.length > 1 && !measure && !reshaping && <GroupKnob rooms={chosen} on={on} />}
      {drag && 'lock' in drag && drag.lock && (
        <Fragment>
          {drag.lock.through.map((c, i) => {
            const a = (drag.lock!.angle * Math.PI) / 180
            const reach = Math.max(PLOT.w, PLOT.h) / 3
            return (
              <line
                key={`lock-${i}`}
                className="lock"
                x1={r2(c[0] - Math.cos(a) * reach)}
                y1={r2(c[1] - Math.sin(a) * reach)}
                x2={r2(c[0] + Math.cos(a) * reach)}
                y2={r2(c[1] + Math.sin(a) * reach)}
              />
            )
          })}
          {drag.lock.mate && (
            <path
              className="mate"
              transform={frameOf(drag.lock.mate)}
              d={bodyPath(drag.lock.mate)}
            />
          )}
        </Fragment>
      )}
      {measure && <MeasureMarks measure={measure} />}
      {drag && 'corner' in drag && drag.corner && (
        <Fragment>
          <rect
            className="snap-mark corner"
            x={p4(drag.corner[0] - 0.18)}
            y={p4(drag.corner[1] - 0.18)}
            width={0.36}
            height={0.36}
          />
          <text className="snap-note" x={p4(drag.corner[0] + 0.35)} y={p4(drag.corner[1] - 0.3)}>
            corner
          </text>
        </Fragment>
      )}
      {drag?.kind === 'mark' && (
        <rect
          className="mark"
          x={r2(Math.min(drag.start[0], drag.now[0]))}
          y={r2(Math.min(drag.start[1], drag.now[1]))}
          width={r2(Math.abs(drag.now[0] - drag.start[0]))}
          height={r2(Math.abs(drag.now[1] - drag.start[1]))}
        />
      )}
      {[...new Set(shown.filter((r) => r.group).map((r) => r.group))].map((group) => {
        const members = shown.filter((r) => r.group === group)
        if (members.length < 2) return null
        const b = boxOf(members)
        return (
          <rect
            key={`group-${group}`}
            className="group-box"
            x={r2(b.x - 0.22)}
            y={r2(b.y - 0.22)}
            width={r2(b.w + 0.44)}
            height={r2(b.h + 0.44)}
            rx={0.15}
          />
        )
      })}
      <Doors sheet={sheet} storey={storey} rooms={shown} openings={props.openings} />
      {focus && settings.dims !== 'none' && !reshaping && (
        <Dims room={focus} rooms={shown} settings={settings} typable={!drag} on={on} />
      )}
      {focus &&
        !focus.locked &&
        chosen.length <= 1 &&
        !measure &&
        !reshaping &&
        (!drag || drag.kind === 'turn') && (
          <Handles
            room={focus}
            rooms={shown}
            settings={settings}
            turning={drag?.kind === 'turn'}
            degrees={angleShown(drag, focus.angle || 0)}
            on={on}
          />
        )}
      {drag?.kind === 'new' && drag.started && (
        <g className="ghost" transform={frameOf(drag.room)}>
          <rect x={0} y={0} width={drag.room.w} height={drag.room.h} />
        </g>
      )}
    </svg>
  )
}

const boxOf = (rooms: Room[]) => {
  const boxes = rooms.map(bboxOf)
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  }
}

/** The plot, the grid, the setback line and the strip out to the boundary: they change with nothing. */
function Background({ settings }: { settings: Settings }) {
  const step = settings.grid > 0 ? settings.grid : 1
  const across: number[] = []
  const down: number[] = []
  for (let x = 0; x <= PLOT.w + 1e-9; x = r2(x + step)) across.push(x)
  for (let y = 0; y <= PLOT.h + 1e-9; y = r2(y + step)) down.push(y)
  const box =
    settings.boundary === 'off'
      ? null
      : settings.boundary === 'sides'
        ? { x: 0, y: 0, w: PLOT.w, h: BUILD.y + BUILD.h }
        : PLOT_BOX
  return (
    <Fragment>
      <g className="grid">
        {across.map((x) => (
          <line
            key={`x${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={PLOT.h}
            className={Number.isInteger(x) ? 'm' : ''}
          />
        ))}
        {down.map((y) => (
          <line
            key={`y${y}`}
            x1={0}
            y1={y}
            x2={PLOT.w}
            y2={y}
            className={Number.isInteger(y) ? 'm' : ''}
          />
        ))}
      </g>
      <rect x={0} y={0} width={PLOT.w} height={PLOT.h} className="plot" />
      {box && (
        <path
          className="strip"
          d={`M${box.x} ${box.y}h${box.w}v${box.h}h${-box.w}zM${BUILD.x} ${BUILD.y}h${BUILD.w}v${BUILD.h}h${-BUILD.w}z`}
        />
      )}
      <rect x={BUILD.x} y={BUILD.y} width={BUILD.w} height={BUILD.h} className="buildable" />
      {settings.streetLabels !== 0 && (
        <Fragment>
          <text x={PLOT.w / 2} y={PLOT.h + 0.9} textAnchor="middle" className="street">
            service street
          </text>
          <text
            x={PLOT.w + 0.9}
            y={PLOT.h / 2}
            textAnchor="middle"
            className="street"
            transform={`rotate(90 ${PLOT.w + 0.9} ${PLOT.h / 2})`}
          >
            side street
          </text>
        </Fragment>
      )}
      <g className="north" transform={`translate(${PLOT.w + 1.3} -0.6) rotate(${NORTH})`}>
        <path d="M0 1.1 L0 -0.6 M-0.25 -0.25 L0 -0.6 L0.25 -0.25" />
        <text x={0} y={1.9} textAnchor="middle">
          N
        </text>
      </g>
    </Fragment>
  )
}

function BoundaryWall({ wall, over }: { wall: Seg & { side: string }; over: boolean }) {
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
  const mx = (wall.a[0] + wall.b[0]) / 2 - wall.n[0] * 0.28
  const my = (wall.a[1] + wall.b[1]) / 2 - wall.n[1] * 0.28
  const angle = wall.side === 'west' ? -90 : wall.side === 'east' ? 90 : 0
  return (
    <g className={`bwall${over ? ' over' : ''}`}>
      <line x1={p4(wall.a[0])} y1={p4(wall.a[1])} x2={p4(wall.b[0])} y2={p4(wall.b[1])} />
      {length >= 1.6 && (
        <text
          x={p4(mx)}
          y={p4(my)}
          textAnchor="middle"
          transform={`rotate(${angle} ${p4(mx)} ${p4(my)})`}
        >
          {wall.side === 'street'
            ? 'boundary · service street'
            : wall.side === 'east'
              ? 'boundary · side street'
              : 'boundary · blind'}
        </text>
      )}
    </g>
  )
}

function Label({
  room,
  plan,
  depth,
  movable,
  typable,
  on,
}: {
  room: Room
  plan: LabelPlan
  /** How many doors in the room stands, written over its name while the walk is read. */
  depth: string | null
  movable: boolean
  typable: boolean
  on: SheetHandlers
}) {
  const [cx, cy] = plan.pt
  const world = norm((room.angle || 0) + (plan.along ? 90 : 0))
  const flip = world > 90 && world < 270
  const rotation = (plan.along ? 90 : 0) + (flip ? 180 : 0)
  const area = r2(areaOf(room))
  const short = area < room.target - 0.05
  const line = plan.lines[0]
  return (
    <g
      className={`label${movable ? ' movable' : ''}`}
      transform={`rotate(${rotation} ${p4(cx)} ${p4(cy)})`}
      onPointerDown={movable ? (event) => on.onLabelDown(room, event) : undefined}
    >
      <text
        className="name"
        x={p4(cx)}
        y={p4(cy + (line ? -0.1 : plan.size * 0.35))}
        textAnchor="middle"
        style={{ fontSize: `${p4(plan.size)}px` }}
      >
        {plan.name}
      </text>
      {depth && (
        <text
          className="depth"
          x={p4(cx)}
          y={p4(cy - (line ? plan.size * 0.9 + 0.35 : plan.size * 0.5 + 0.4))}
          textAnchor="middle"
        >
          {depth}
        </text>
      )}
      {line && (
        <text
          className={`area${short ? ' short' : ''}${typable ? ' typable' : ''}`}
          x={p4(cx)}
          y={p4(cy + line[1] * 1.05 + 0.05)}
          textAnchor="middle"
          style={{ fontSize: `${p4(line[1])}px` }}
          onPointerDown={typable ? (event) => event.stopPropagation() : undefined}
          onClick={typable ? (event) => on.onTypeSize(room, 'area', event) : undefined}
        >
          {line[0]}
        </text>
      )}
    </g>
  )
}

function SnapMarks({ snap, at }: { snap: NonNullable<Drawing['snap']>; at: Point }) {
  const word =
    snap.kind === 'corner'
      ? 'corner'
      : snap.kind === 'meet'
        ? 'where two walls meet'
        : snap.kind === 'wall'
          ? 'on the wall'
          : snap.kind === 'line'
            ? 'in line with a wall'
            : snap.kind === 'angle' && snap.ray
              ? `${Math.round(snap.ray.angle)}°, with the neighbours · ${fmt(snap.ray.length)} m`
              : snapWord(snap.kind)
  return (
    <Fragment>
      {snap.marks.map((mark, i) => {
        if (mark.type === 'corner')
          return (
            <rect
              key={i}
              className="snap-mark corner"
              x={p4(mark.at[0] - 0.18)}
              y={p4(mark.at[1] - 0.18)}
              width={0.36}
              height={0.36}
            />
          )
        if (mark.type === 'square' && mark.u && mark.n) {
          const s = 0.32
          const o = [mark.at[0] + mark.n[0] * 0.04, mark.at[1] + mark.n[1] * 0.04]
          return (
            <path
              key={i}
              className="snap-mark square"
              d={`M${p4(o[0]! + mark.u[0] * s)} ${p4(o[1]! + mark.u[1] * s)}L${p4(o[0]! + mark.u[0] * s + mark.n[0] * s)} ${p4(o[1]! + mark.u[1] * s + mark.n[1] * s)}L${p4(o[0]! + mark.n[0] * s)} ${p4(o[1]! + mark.n[1] * s)}`}
            />
          )
        }
        if (mark.u)
          return (
            <line
              key={i}
              className="snap-mark"
              x1={p4(mark.at[0] + mark.u[1] * 0.3)}
              y1={p4(mark.at[1] - mark.u[0] * 0.3)}
              x2={p4(mark.at[0] - mark.u[1] * 0.3)}
              y2={p4(mark.at[1] + mark.u[0] * 0.3)}
            />
          )
        return null
      })}
      {snap.ray && (
        <line
          className="snap-ray"
          x1={p4(snap.ray.from[0])}
          y1={p4(snap.ray.from[1])}
          x2={p4(
            snap.ray.from[0] + Math.cos((snap.ray.angle * Math.PI) / 180) * (snap.ray.length + 2),
          )}
          y2={p4(
            snap.ray.from[1] + Math.sin((snap.ray.angle * Math.PI) / 180) * (snap.ray.length + 2),
          )}
        />
      )}
      <text className="snap-note" x={p4(at[0] + 0.35)} y={p4(at[1] - 0.3)}>
        {word}
      </text>
    </Fragment>
  )
}

function MeasureMarks({ measure }: { measure: Measure }) {
  const a = measure.a
  const b = measure.b ?? measure.at
  if (!a) return null
  const length = b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0
  const angle = b ? norm((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) : 0
  return (
    <g className="measure">
      <circle cx={p4(a[0])} cy={p4(a[1])} r={0.1} />
      {b && (
        <Fragment>
          <line x1={p4(a[0])} y1={p4(a[1])} x2={p4(b[0])} y2={p4(b[1])} />
          <circle cx={p4(b[0])} cy={p4(b[1])} r={0.1} />
          <text x={p4((a[0] + b[0]) / 2 + 0.3)} y={p4((a[1] + b[1]) / 2 - 0.3)}>
            {fmt(length)} m · {Math.round(angle)}°
          </text>
          {Math.abs(b[0] - a[0]) > 0.05 && Math.abs(b[1] - a[1]) > 0.05 && (
            <text x={p4((a[0] + b[0]) / 2 + 0.3)} y={p4((a[1] + b[1]) / 2 + 0.2)}>
              {fmt(Math.abs(b[0] - a[0]))} across · {fmt(Math.abs(b[1] - a[1]))} down
            </text>
          )}
        </Fragment>
      )}
    </g>
  )
}

function GroupKnob({ rooms, on }: { rooms: Room[]; on: SheetHandlers }) {
  const b = boxOf(rooms)
  return (
    <Fragment>
      <rect
        className="group"
        x={r2(b.x - 0.15)}
        y={r2(b.y - 0.15)}
        width={r2(b.w + 0.3)}
        height={r2(b.h + 0.3)}
      />
      <g className="turn">
        <line
          x1={r2(b.x + b.w / 2)}
          y1={r2(b.y - 0.25)}
          x2={r2(b.x + b.w / 2)}
          y2={r2(b.y - 1.1)}
        />
        <circle
          cx={r2(b.x + b.w / 2)}
          cy={r2(b.y - 1.35)}
          r={0.22}
          onPointerDown={(event) => on.onGroupTurnDown(event)}
        />
      </g>
    </Fragment>
  )
}

/** The room's own size, written in its frame so it turns with it, and the gaps round a square room. */
function Dims({
  room,
  rooms,
  settings,
  typable,
  on,
}: {
  room: Room
  rooms: Room[]
  settings: Settings
  typable: boolean
  on: SheetHandlers
}) {
  const off = 0.45
  const size = settings.dimSize
  const gaps = settings.dims === 'all' && square(room) ? gapsRound(room, rooms) : []
  return (
    <Fragment>
      <g className="dim" transform={frameOf(room)}>
        <line x1={0} y1={-off} x2={room.w} y2={-off} />
        <text
          x={p4(room.w / 2)}
          y={p4(-off - 0.12)}
          textAnchor="middle"
          className={typable ? 'typable' : ''}
          style={{ fontSize: `${size}px` }}
          onPointerDown={typable ? (event) => event.stopPropagation() : undefined}
          onClick={typable ? (event) => on.onTypeSize(room, 'w', event) : undefined}
        >
          {fmt(room.w)}
        </text>
        <line x1={-off} y1={0} x2={-off} y2={room.h} />
        <text
          x={p4(-off - 0.15)}
          y={p4(room.h / 2)}
          textAnchor="middle"
          className={typable ? 'typable' : ''}
          style={{ fontSize: `${size}px` }}
          transform={`rotate(-90 ${p4(-off - 0.15)} ${p4(room.h / 2)})`}
          onPointerDown={typable ? (event) => event.stopPropagation() : undefined}
          onClick={typable ? (event) => on.onTypeSize(room, 'h', event) : undefined}
        >
          {fmt(room.h)}
        </text>
      </g>
      {gaps.map((gap, i) => (
        <g key={`gap-${i}`} className="dim gap">
          {gap.horizontal ? (
            <Fragment>
              <line x1={gap.from} y1={gap.at} x2={gap.to} y2={gap.at} />
              <text
                x={p4((gap.from + gap.to) / 2)}
                y={p4(gap.at - 0.1)}
                textAnchor="middle"
                style={{ fontSize: `${size}px` }}
              >
                {fmt(Math.abs(gap.to - gap.from))}
              </text>
            </Fragment>
          ) : (
            <Fragment>
              <line x1={gap.at} y1={gap.from} x2={gap.at} y2={gap.to} />
              <text
                x={p4(gap.at + 0.35)}
                y={p4((gap.from + gap.to) / 2 + 0.15)}
                textAnchor="middle"
                style={{ fontSize: `${size}px` }}
              >
                {fmt(Math.abs(gap.to - gap.from))}
              </text>
            </Fragment>
          )}
        </g>
      ))}
    </Fragment>
  )
}

function gapsRound(r: Room, rooms: Room[]) {
  const right = (o: Room) => o.x + o.w
  const bottom = (o: Room) => o.y + o.h
  const others = rooms.filter((o) => o !== r && square(o))
  const spanY = (o: Room) => o.y < bottom(r) && bottom(o) > r.y
  const spanX = (o: Room) => o.x < right(r) && right(o) > r.x
  const A = PLOT_BOX
  const list = [
    {
      to: Math.max(A.x, ...others.filter((o) => spanY(o) && right(o) <= r.x + 1e-6).map(right)),
      from: r.x,
      horizontal: true,
      at: r.y + r.h / 2,
    },
    {
      to: Math.min(
        A.x + A.w,
        ...others.filter((o) => spanY(o) && o.x >= right(r) - 1e-6).map((o) => o.x),
      ),
      from: right(r),
      horizontal: true,
      at: r.y + r.h / 2,
    },
    {
      to: Math.max(A.y, ...others.filter((o) => spanX(o) && bottom(o) <= r.y + 1e-6).map(bottom)),
      from: r.y,
      horizontal: false,
      at: r.x + r.w / 2,
    },
    {
      to: Math.min(
        A.y + A.h,
        ...others.filter((o) => spanX(o) && o.y >= bottom(r) - 1e-6).map((o) => o.y),
      ),
      from: bottom(r),
      horizontal: false,
      at: r.x + r.w / 2,
    },
  ]
  return list.filter((gap) => Math.abs(gap.to - gap.from) >= 0.05)
}

/** One handle per wall on the wall, a handle on every corner of a carved room, and the turning knob. */
function Handles({
  room,
  rooms,
  settings,
  turning,
  degrees,
  on,
}: {
  room: Room
  rooms: Room[]
  settings: Settings
  turning: boolean
  degrees: number
  on: SheetHandlers
}) {
  const s = 0.36
  const loops = room.pieces && room.pieces.length ? loopsOf(room) : null
  const corners = loops && loops.length === 1 ? loops[0]!.map((e) => e.a) : null
  return (
    <g transform={frameOf(room)}>
      {!turning &&
        outlineOf(room).map((seg, i) => {
          const length = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1])
          if (length < 0.5) return null
          const mx = (seg.a[0] + seg.b[0]) / 2
          const my = (seg.a[1] + seg.b[1]) / 2
          const angle = r2((Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]) * 180) / Math.PI)
          const cls = Math.abs(seg.n[0]) > 0.999 ? 'h' : Math.abs(seg.n[1]) > 0.999 ? 'v' : 'd'
          const side = sideOf(room, seg)
          const shared = side ? sharedWallOf(room, side, rooms, settings) : null
          return (
            <rect
              key={`wall-${i}`}
              className={`handle ${cls}${shared ? ' shared' : ''}`}
              x={r2(mx - s / 2)}
              y={r2(my - s / 2)}
              width={s}
              height={s}
              rx={0.04}
              transform={`rotate(${angle} ${r2(mx)} ${r2(my)})`}
              onPointerDown={(event) =>
                on.onWallDown(room, i, side, shared ? shared.id : null, event)
              }
            />
          )
        })}
      {!turning &&
        corners?.map((c, i) => (
          <circle
            key={`corner-${i}`}
            className="handle c"
            cx={p4(c[0])}
            cy={p4(c[1])}
            r={0.16}
            onPointerDown={(event) => on.onCornerDown(room, i, corners, event)}
          />
        ))}
      <g className="turn">
        <line x1={room.w / 2} y1={-0.7} x2={room.w / 2} y2={-1.3} />
        <circle
          cx={room.w / 2}
          cy={-1.5}
          r={0.22}
          onPointerDown={(event) => on.onTurnDown(room, event)}
        />
        <text
          x={room.w / 2 + 0.45}
          y={-1.35}
          style={{ fontSize: `${settings.dimSize}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => on.onTypeSize(room, 'angle', event)}
        >
          {degrees}°
        </text>
      </g>
    </g>
  )
}
