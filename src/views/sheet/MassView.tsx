/**
 * The mass beside the sheet: the storeys stacked at their heights, drawn back to front by the wall
 * lines, with the sheet's own gestures when editing in 3D is on. It draws and listens; every number
 * comes from `src/sheet` and every change goes through an action.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  MASS_START,
  MASS_VIEWS,
  acrossStoreys,
  allPlaced,
  allowedBox,
  blindWall,
  boxCorners,
  breaches,
  clearHeight,
  fmt,
  heightCap,
  heightFromDrag,
  heightOf,
  isOpen,
  massPivot,
  massProjection,
  orderPrisms,
  outlineOf,
  prismsOf,
  recentred,
  seenWalls,
  setHeight,
  setSetting,
  stH,
  storeyNameOf,
  storeyOf,
  toWorld,
  turnedBy,
  lookFrom,
  worldLoop,
  zBase,
  zTop,
  zoomedBy,
  type Change,
  type MassCamera,
  type MassProjection,
  type MassViewName,
  type Point,
  type Poly,
  type Result,
  type Room,
  type Seg,
  type Sheet,
} from '../../sheet'
import { beginMove, beginTurn, beginWall, dragTo, dropOf, type Drag } from './gestures'
import './mass.css'

declare global {
  interface Window {
    /** How long each frame of the mass took, for the frame-budget test. */
    massFrames?: number[]
    /** The drawing as plain numbers, so the ray-cast check can compare it with what it hits. */
    massRead?: {
      proj: { ox: number; oy: number; s: number; th: number; ph: number }
      prisms: { room: string; poly: Poly; z0: number; h: number }[]
    }
  }
}

type MassViewProps = {
  sheet: Sheet
  storey: number
  selection: string[]
  hover: string | null
  /** The overlaps the sheet has already found on this storey: the mass tints the same ones. */
  overlaps: { ids: [string, string]; polys: Poly[] }[]
  onHover: (id: string | null) => void
  onSelect: (ids: string[]) => void
  onStorey: (k: number) => void
  /** One undo step round a whole gesture, as the assistant's turns do. */
  onBegin: () => void
  onWrite: (change: Change) => Result
  onEnd: (changed: boolean) => void
  apply: (change: Change | null) => boolean
  roomMenu: (room: Room, at: { x: number; y: number }) => ReactNode
}

/** What the hand holds in the mass, kept only for the shadow, the guide and the height reading. */
type MassDrag =
  | { kind: 'move' | 'wall' | 'turn'; from: Sheet; drag: Drag; moved: boolean }
  | { kind: 'height'; from: Sheet; startY: number; startH: number; moved: boolean }
  | { kind: 'orbit' }

const p2 = (v: number) => Number(v.toFixed(2))

const pointsOf = (P: MassProjection, pts: Poly, z: number) =>
  pts.map(([x, y]) => `${p2(P.to(x, y, z)[0])},${p2(P.to(x, y, z)[1])}`).join(' ')

/** A colour toned down, as the mock shades a wall by how far it turns from the eye. */
function shade(hex: string, k: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  const c = [1, 2, 3].map((i) => Math.round(Math.min(255, parseInt(m[i]!, 16) * k)))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function MassView(props: MassViewProps) {
  const { sheet, storey, selection, hover } = props
  const started = performance.now()
  const [cam, setCam] = useState<MassCamera>(MASS_START)
  const [edit, setEdit] = useState(true)
  const [shown, setShown] = useState(true)
  const [size, setSize] = useState({ W: 600, H: 420 })
  const [held, setHeld] = useState<MassDrag | null>(null)
  const [note, setNote] = useState('')
  const [menu, setMenu] = useState<{ room: Room; at: { x: number; y: number } } | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLDivElement | null>(null)
  const svg = useRef<SVGSVGElement | null>(null)
  const heldRef = useRef<MassDrag | null>(null)
  const spaceHeld = useRef(false)
  const camRef = useRef(cam)
  const sheetRef = useRef(sheet)
  sheetRef.current = sheet
  camRef.current = cam

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const read = () =>
      setSize({
        W: Math.max(120, element.clientWidth),
        H: Math.max(120, element.clientHeight),
      })
    read()
    const watch = new ResizeObserver(read)
    watch.observe(element)
    return () => watch.disconnect()
  }, [shown])

  // A click anywhere closes the menu, the row it lands on having already been read.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  // Space turns the view even over a volume, as the mock's middle button does.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === ' ') spaceHeld.current = true
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === ' ') spaceHeld.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const { plot } = sheet
  const P = useMemo(() => massProjection(cam, size.W, size.H, plot), [cam, size.W, size.H, plot])

  const drawn = useMemo(() => {
    const prisms = prismsOf(sheet, P)
    return orderPrisms(prisms, P)
  }, [sheet, P])

  useLayoutEffect(() => {
    const frames = (window.massFrames ??= [])
    frames.push(performance.now() - started)
    if (frames.length > 400) frames.splice(0, frames.length - 400)
    window.massRead = {
      proj: { ox: P.ox, oy: P.oy, s: P.s, th: P.th, ph: P.ph },
      prisms: drawn.order.map((b) => ({ room: b.room.id, poly: b.poly, z0: b.z0, h: b.h })),
    }
  })

  const one = selection.length === 1 ? allPlaced(sheet).find((r) => r.id === selection[0]) : null
  const over = useMemo(() => new Set(props.overlaps.flatMap((o) => o.ids)), [props.overlaps])

  const at = (event: { clientX: number; clientY: number }): [number, number] => {
    const rect = svg.current?.getBoundingClientRect()
    if (!rect) return [0, 0]
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

  const groundAt = (event: { clientX: number; clientY: number }): Point => {
    const [X, Y] = at(event)
    return P.ground(X, Y)
  }

  const inBox = (event: { clientX: number; clientY: number }) => {
    const rect = box.current?.getBoundingClientRect()
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 }
  }

  const hold = (next: MassDrag | null) => {
    heldRef.current = next
    setHeld(next)
  }

  const roomAt = (event: ReactPointerEvent | ReactMouseEvent): Room | null => {
    const target = event.target
    const face = target instanceof Element ? target.closest('[data-room]') : null
    const id = face?.getAttribute('data-room')
    return id ? (allPlaced(sheet).find((r) => r.id === id) ?? null) : null
  }

  /** Every gesture of the mass writes live, so the room moves on the sheet as the hand drags it. */
  const runDrag = (kind: 'move' | 'wall' | 'turn', drag: Drag, event: ReactPointerEvent) => {
    const from = sheetRef.current
    props.onBegin()
    hold({ kind, from, drag, moved: false })
    const onMove = (moving: PointerEvent) => {
      const state = heldRef.current
      if (!state || state.kind === 'orbit' || state.kind === 'height') return
      const next = dragTo(state.drag, groundAt(moving), { shift: moving.shiftKey }, from, storey)
      const change = dropOf(next, from, storey)
      const moved = state.moved || (!!change && change.result.ok)
      if (change) props.onWrite(change)
      hold({ ...state, drag: next, moved })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const state = heldRef.current
      hold(null)
      props.onEnd(state ? state.kind !== 'orbit' && state.moved : false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    event.preventDefault()
  }

  const runHeight = (room: Room, event: ReactPointerEvent) => {
    const from = sheetRef.current
    const startY = at(event)[1]
    const startH = heightOf(room, from)
    props.onBegin()
    hold({ kind: 'height', from, startY, startH, moved: false })
    const onMove = (moving: PointerEvent) => {
      const state = heldRef.current
      if (!state || state.kind !== 'height') return
      const want = heightFromDrag(room, from, state.startH, at(moving)[1] - state.startY, P.rise)
      setNote(want.why)
      const change = setHeight(from, { id: room.id, metres: want.h })
      props.onWrite(change)
      hold({ ...state, moved: state.moved || change.result.ok })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const state = heldRef.current
      hold(null)
      setNote('')
      props.onEnd(state?.kind === 'height' ? state.moved : false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    event.preventDefault()
    event.stopPropagation()
  }

  const orbit = (event: ReactPointerEvent) => {
    const from = at(event)
    const c0 = camRef.current
    const pivot = massPivot(sheet, selection)
    const before = massProjection(c0, size.W, size.H).to(pivot[0], pivot[1], pivot[2])
    let moved = false
    hold({ kind: 'orbit' })
    const onMove = (moving: PointerEvent) => {
      const [X, Y] = at(moving)
      moved = moved || Math.hypot(X - from[0], Y - from[1]) > 3
      if (!moved) return
      const turned = turnedBy(c0, X - from[0], Y - from[1])
      const now = massProjection(turned, size.W, size.H).to(pivot[0], pivot[1], pivot[2])
      setCam({
        ...turned,
        px: turned.px + before[0] - now[0],
        py: turned.py + before[1] - now[1],
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      hold(null)
      if (!moved && event.button === 0) props.onSelect([])
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    event.preventDefault()
  }

  const bringStorey = (room: Room) => {
    if (room.placed && storeyOf(room) !== storey && !acrossStoreys(room, sheet.settings))
      props.onStorey(storeyOf(room))
  }

  const onDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    setMenu(null)
    const room = event.button === 0 && !spaceHeld.current ? roomAt(event) : null
    if (!room) {
      orbit(event)
      return
    }
    bringStorey(room)
    props.onSelect([room.id])
    if (!edit || room.fixed || room.locked || isOpen(room)) return
    const drag = beginMove([room.id], room.id, groundAt(event))
    runDrag('move', drag, event)
  }

  if (!shown)
    return (
      <div className="mass folded">
        <button type="button" onClick={() => setShown(true)}>
          Show the mass
        </button>
      </div>
    )

  const handles = one && edit && !one.fixed && !one.locked && !isOpen(one) && !held ? one : null
  const top = handles ? zTop(handles, sheet) : 0
  const centre: Point | null = handles ? toWorld(handles, handles.w / 2, handles.h / 2) : null
  const post = handles && centre ? P.to(centre[0], centre[1], top) : null
  const tip = handles && centre ? P.to(centre[0], centre[1], top + 1.2) : null
  const knob =
    handles && centre
      ? P.to(centre[0], centre[1] - Math.max(handles.w, handles.h) / 2 - 1, top)
      : null

  const moving = held && held.kind === 'move' ? held : null
  const movingId = moving && 'id' in moving.drag ? moving.drag.id : null
  const shadow =
    moving && movingId ? (allPlaced(moving.from).find((r) => r.id === movingId) ?? null) : null
  const guide = held && 'drag' in held && 'guides' in held.drag ? held.drag.guides[0] : undefined

  return (
    <div className="mass" ref={box}>
      <div className="mass-head">
        <b>Mass</b>
        <button
          type="button"
          className={edit ? 'on' : ''}
          title="On: drag a volume by any face to move the room, its edge handles to stretch it, the knob to turn it, the post to set its height. Off: volumes only select."
          onClick={() => setEdit(!edit)}
        >
          Edit in 3D: {edit ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className={sheet.settings.streetLabels ? 'on' : ''}
          onClick={() =>
            props.apply(
              setSetting(sheet, {
                name: 'streetLabels',
                value: sheet.settings.streetLabels ? 0 : 1,
              }),
            )
          }
        >
          Names: {sheet.settings.streetLabels ? 'on' : 'off'}
        </button>
        <span className="views">
          {(Object.keys(MASS_VIEWS) as MassViewName[]).map((name) => (
            <button key={name} type="button" onClick={() => setCam(lookFrom(camRef.current, name))}>
              {MASS_VIEWS[name].label}
            </button>
          ))}
        </span>
        <button type="button" onClick={() => setShown(false)}>
          Hide
        </button>
      </div>
      <div className="mass-canvas" ref={canvas}>
        <svg
          className={`mass-svg${edit ? ' editing' : ''}`}
          ref={svg}
          viewBox={`0 0 ${size.W} ${size.H}`}
          onPointerDown={onDown}
          onPointerOver={(event) => {
            if (held) return
            const room = roomAt(event)
            props.onHover(room ? room.id : null)
          }}
          onPointerLeave={() => !held && props.onHover(null)}
          onDoubleClick={(event) => {
            if (roomAt(event)) return
            setCam(recentred(camRef.current))
          }}
          onWheel={(event: ReactWheelEvent) => {
            event.preventDefault()
            setCam(zoomedBy(camRef.current, event.deltaY))
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            const room = roomAt(event)
            if (!room || room.fixed || isOpen(room)) return
            bringStorey(room)
            props.onSelect([room.id])
            setMenu({ room, at: inBox(event) })
          }}
        >
          <polygon className="m-ground" points={pointsOf(P, boxCorners(plot.box), 0)} />
          {sheet.settings.boundary !== 'off' && (
            <path
              className="m-strip"
              d={`M${pointsOf(P, boxCorners(allowedBox(sheet, storey)), 0).replace(/ /g, 'L')}ZM${pointsOf(
                P,
                boxCorners(plot.build),
                0,
              ).replace(/ /g, 'L')}Z`}
            />
          )}
          <polygon className="m-build" points={pointsOf(P, boxCorners(plot.build), 0)} />
          {shadow && (
            <polygon
              className="m-shadow"
              points={pointsOf(P, worldLoop(shadow), zBase(shadow, sheet.settings))}
            />
          )}
          {props.overlaps.flatMap((o, i) =>
            o.polys.map((poly, j) => (
              <polygon key={`over-${i}-${j}`} className="m-over" points={pointsOf(P, poly, 0)} />
            )),
          )}
          {guide && (
            <line
              className="m-guide"
              x1={p2(P.to(guide.x1, guide.y1, 0)[0])}
              y1={p2(P.to(guide.x1, guide.y1, 0)[1])}
              x2={p2(P.to(guide.x2, guide.y2, 0)[0])}
              y2={p2(P.to(guide.x2, guide.y2, 0)[1])}
            />
          )}
          {allPlaced(sheet)
            .filter((r) => isOpen(r) && storeyOf(r) === 0)
            .map((r) => (
              <polygon
                key={`flat-${r.id}`}
                className={`m-flat${selection.includes(r.id) ? ' selected' : ''}`}
                data-room={r.id}
                points={pointsOf(P, worldLoop(r), 0.03)}
                fill={r.color ?? sheet.settings.colors.open}
              />
            ))}
          {drawn.order.map((block, i) => {
            const r = block.room
            const state = `${selection.includes(r.id) ? ' selected' : ''}${
              hover === r.id ? ' hover' : ''
            }${over.has(r.id) ? ' over' : ''}`
            const fill = r.color ?? sheet.settings.colors[r.cat] ?? '#ddd'
            const lines: [string, string, string][] = []
            const walls = seenWalls(block, P).map((e, j) => {
              const blind = blindWall(e.a, e.b, plot)
              const cls = blind ? (breaches(block.h) ? ' blind breach' : ' blind') : ''
              const a0 = P.to(e.a[0], e.a[1], block.z0)
              const b0 = P.to(e.b[0], e.b[1], block.z0)
              const a1 = P.to(e.a[0], e.a[1], block.h)
              const b1 = P.to(e.b[0], e.b[1], block.h)
              const pt = (p: number[]) => `${p2(p[0]!)},${p2(p[1]!)}`
              lines.push([pt(a0), pt(b0), cls], [pt(a0), pt(a1), cls], [pt(b0), pt(b1), cls])
              return (
                <polygon
                  key={`w-${j}`}
                  className={`m-face${cls}${state}`}
                  data-room={r.id}
                  shapeRendering="crispEdges"
                  points={[pt(a0), pt(b0), pt(b1), pt(a1)].join(' ')}
                  fill={
                    blind
                      ? shade(fill, 0.5)
                      : shade(fill, (block.z0 > 0 ? 0.78 : 0.72) + 0.22 * e.facing)
                  }
                />
              )
            })
            for (const e of block.edges)
              if (e.outline) {
                const a = P.to(e.a[0], e.a[1], block.h)
                const b = P.to(e.b[0], e.b[1], block.h)
                lines.push([
                  `${p2(a[0])},${p2(a[1])}`,
                  `${p2(b[0])},${p2(b[1])}`,
                  blindWall(e.a, e.b, plot) && e.facing > 0
                    ? breaches(block.h)
                      ? ' blind breach'
                      : ' blind'
                    : '',
                ])
              }
            return (
              <g key={`b-${i}`}>
                {walls}
                <polygon
                  className={`m-face top${state}`}
                  data-room={r.id}
                  shapeRendering="crispEdges"
                  points={pointsOf(P, block.poly, block.h)}
                  fill={fill}
                />
                {lines.map(([a, b, cls], j) => (
                  <line
                    key={`l-${j}`}
                    className={`m-edge${cls}${state}`}
                    x1={a.split(',')[0]}
                    y1={a.split(',')[1]}
                    x2={b.split(',')[0]}
                    y2={b.split(',')[1]}
                  />
                ))}
              </g>
            )
          })}
          {!!sheet.settings.streetLabels &&
            (
              [
                ...plot.streets.map((side): [string, number, number] => [
                  side === plot.service ? 'service street' : 'side street',
                  side === 'west' ? -1.4 : side === 'east' ? plot.w + 1.4 : plot.w / 2,
                  side === 'north' ? -1.2 : side === 'street' ? plot.h + 1.4 : plot.h / 2,
                ]),
                ...(plot.streets.includes('north')
                  ? []
                  : ([['neighbours · north', plot.w / 2, -1.2]] as [string, number, number][])),
              ] as [string, number, number][]
            ).map(([label, x, y]) => {
              const p = P.to(x, y, 0)
              return (
                <text key={label} className="m-street" x={p2(p[0])} y={p2(p[1])}>
                  {label}
                </text>
              )
            })}
          {handles && post && tip && knob && (
            <g className="m-ui">
              {outlineOf(handles).map((seg: Seg, i) => {
                const a = toWorld(handles, seg.a[0], seg.a[1])
                const b = toWorld(handles, seg.b[0], seg.b[1])
                if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.8) return null
                const m = P.to((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, top)
                return (
                  <rect
                    key={`h-${i}`}
                    className="m-hnd"
                    data-wall={i}
                    x={p2(m[0] - 5)}
                    y={p2(m[1] - 5)}
                    width={10}
                    height={10}
                    rx={2}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return
                      event.stopPropagation()
                      const drag = beginWall(sheet, handles.id, i, groundAt(event))
                      if (drag) runDrag('wall', drag, event)
                    }}
                  />
                )
              })}
              <line
                className="m-post"
                x1={p2(post[0])}
                y1={p2(post[1])}
                x2={p2(tip[0])}
                y2={p2(tip[1])}
              />
              <circle
                className="m-knob"
                data-knob="height"
                cx={p2(tip[0])}
                cy={p2(tip[1])}
                r={6}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  runHeight(handles, event)
                }}
              />
              <line
                className="m-post"
                x1={p2(post[0])}
                y1={p2(post[1])}
                x2={p2(knob[0])}
                y2={p2(knob[1])}
              />
              <circle
                className="m-knob turn"
                data-knob="turn"
                cx={p2(knob[0])}
                cy={p2(knob[1])}
                r={6}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.stopPropagation()
                  const drag = beginTurn(sheet, handles.id)
                  if (drag) runDrag('turn', drag, event)
                }}
              />
            </g>
          )}
        </svg>
      </div>
      <div className="mass-foot">
        {foot(one ?? null, sheet, edit, note, () =>
          props.apply(clearHeight(sheet, { id: one!.id })),
        )}
      </div>
      {menu && props.roomMenu(menu.room, menu.at)}
    </div>
  )
}

/** The reading under the view: what is selected, its storey, its height and what the height snapped to. */
function foot(
  one: Room | null,
  sheet: Sheet,
  edit: boolean,
  note: string,
  onStoreyHeight: () => void,
): ReactNode {
  if (!one || isOpen(one) || one.fixed)
    return (
      <span>
        {edit
          ? 'Drag a volume to move it; selected, its edge handles stretch it, the post sets its height, the far knob turns it. Right-click it for the menu. Drag the ground, the middle button or Space to turn the view; wheel to zoom.'
          : 'Drag the ground to turn the view, wheel to zoom. Edit in 3D on to move rooms here.'}
      </span>
    )
  const h = heightOf(one, sheet)
  const across = acrossStoreys(one, sheet.settings)
  const cap = heightCap(one, sheet.settings)
  const storeyHeight = stH(sheet.settings, storeyOf(one))
  return (
    <>
      <b>{one.name}</b>
      <span>{across ? 'all storeys' : `${storeyNameOf(storeyOf(one)).toLowerCase()} storey`}</span>
      <span>
        height{' '}
        <span className="mono" data-mass-height>
          {fmt(Math.min(cap, h))} m{note ? ` · ${note}` : ''}
        </span>
      </span>
      <span>
        {across ? (
          `pull the knob on the post, up to ${fmt(cap)} m: the rulebook's 15 m and the stair house`
        ) : h > storeyHeight + 0.05 ? (
          <span className="bad">
            taller than its storey of {fmt(storeyHeight)} m: open to below on the floor above
          </span>
        ) : (
          `storey ${fmt(storeyHeight)} m · pull the knob on the post, up to ${fmt(cap)} m`
        )}
      </span>
      {one.height ? (
        <button type="button" onClick={onStoreyHeight}>
          {across ? "Top storey's roof" : 'Storey height'}
        </button>
      ) : null}
    </>
  )
}
