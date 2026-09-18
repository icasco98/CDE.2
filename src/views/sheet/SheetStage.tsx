/**
 * The zoning sheet as a screen: it owns the sheet, the undo history and what the hand is in the
 * middle of, lays out the mock's page round it, and turns every gesture and every menu row into one
 * action. Nothing here computes a number about the plan; the report and the actions do that.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  RULE_HINT,
  acrossStoreys,
  addRoom,
  addStorey,
  dropTopStorey,
  areaOf,
  bestNeighbour,
  carveBelow,
  clearColor,
  clearLabel,
  combine,
  copyTo,
  cutToSetback,
  fmt,
  givePocket,
  group,
  insideConvex,
  isOpen,
  labelPlan,
  lock,
  makeCorridor,
  makeCourt,
  mirror,
  move,
  newHistory,
  outsideBuildable,
  overlapsOf,
  place,
  placedRooms,
  pocketsOf,
  pushOthers,
  polyArea,
  r2,
  redo,
  remember,
  removeRoom,
  reorder,
  report,
  restore,
  sampleSheet,
  sendBack,
  setArea,
  setColor,
  setSetting,
  setSize,
  setStorey,
  storeyCountOf,
  storeyOf,
  turn,
  undo,
  ungroup,
  unlock,
  worldCorners,
  worldPieces,
  BUILD,
  type Change,
  type Memory,
  type Pocket,
  type Point,
  type Result,
  type Room,
  type Sheet,
  type Side4,
} from '../../sheet'
import { fitCamera, pointerAt, wheelFactor, zoomAbout, type Camera } from '../camera'
import { MassView } from './MassView'
import { Program } from './Program'
import { Storeys } from './Storeys'
import { SheetView, sheetExtent, type SheetRead } from './SheetView'
import {
  EmptyNote,
  PocketBar,
  PocketMenu,
  RoomMenu,
  type PocketChoice,
  type RoomChoice,
} from './menus'
import {
  beginCorner,
  beginGroupTurn,
  beginLabel,
  beginMark,
  beginMove,
  beginNew,
  beginResize,
  beginTurn,
  beginWall,
  closesPolygon,
  dragTo,
  drawnAt,
  drawnShape,
  dropOf,
  marked,
  measureClick,
  measurePoint,
  middleOf,
  shapePolygon,
  startDrawing,
  startMeasure,
  type Drag,
  type Drawing,
  type Measure,
  type Shape,
} from './gestures'
import { Chat } from './Chat'
import { useRuntime } from './claude'
import { keepMemory, keepSheet, localMemory, localSheet, storedMemory, storedSheet } from './store'
import { keyCommand, keyRelease } from './keys'
import { drawingSentence, measuringSentence, sentenceOf, type Part } from './sentence'
import './sheet.css'

declare global {
  interface Window {
    /** How long each frame of the sheet took to render and commit, for the render-budget test. */
    sheetFrames?: number[]
  }
}

type Doc = { sheet: Sheet; history: ReturnType<typeof newHistory> }

type Menu =
  | { kind: 'room'; room: Room; corner: Point | null; at: { x: number; y: number } }
  | { kind: 'pocket'; pocket: Pocket; at: { x: number; y: number } }
  | { kind: 'note'; note: string; at: { x: number; y: number } }

type TypeIn = {
  at: { x: number; y: number }
  value: string
  apply: (value: number) => Change | null
}

export function SheetStage() {
  const started = performance.now()
  // The storey in hand: every gesture and every action on this screen works on it.
  const [storey, showStorey] = useState(0)
  const STOREY = storey
  const [doc, setDoc] = useState<Doc>(() => ({
    sheet: localSheet() ?? sampleSheet(),
    history: newHistory(),
  }))
  const [memory, setMemory] = useState<Memory>(() => localMemory())
  const [selection, setSelection] = useState<string[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [reshaping, setReshaping] = useState<{ id: string; before: Sheet; shape: Shape } | null>(
    null,
  )
  const [measure, setMeasure] = useState<Measure | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [pocketPicked, setPocketPicked] = useState<number | null>(null)
  const [pivot, setPivot] = useState<{ key: string; at: Point } | null>(null)
  const [camera, setCamera] = useState<Camera>(fitCamera)
  const [pan, setPan] = useState<{ from: [number, number]; camera: Camera } | null>(null)
  const [typeIn, setTypeIn] = useState<TypeIn | null>(null)
  const [colouring, setColouring] = useState<{ ids: string[]; value: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [tag, setTag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [drawMenuFor, setDrawMenuFor] = useState<string | null>(null)
  const clipboard = useRef<{ ids: string[]; storey: number; pastes: number } | null>(null)
  const spaceHeld = useRef(false)
  const touched = useRef(false)
  const svg = useRef<SVGSVGElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const drawRef = useRef<Drawing | null>(null)
  const docRef = useRef(doc)
  const tagTimer = useRef<number | null>(null)
  docRef.current = doc
  drawRef.current = drawing

  const { sheet } = doc
  const { settings } = sheet
  const runtime = useRuntime()
  // Saving waits until the link's store has been read, so an opening sheet cannot overwrite it.
  const [keeping, setKeeping] = useState(false)

  useEffect(() => {
    if (!runtime.ready) return
    const store = runtime.store
    if (!store) {
      setKeeping(true)
      return
    }
    let live = true
    void Promise.all([storedSheet(store), storedMemory(store)]).then(([stored, kept]) => {
      if (!live) return
      if (stored && !touched.current) {
        docRef.current = { sheet: stored, history: newHistory() }
        setDoc(docRef.current)
      }
      if (kept) setMemory(kept)
      setKeeping(true)
    })
    return () => {
      live = false
    }
  }, [runtime.ready, runtime.store])

  useEffect(() => {
    if (!keeping) return
    const timer = window.setTimeout(() => keepSheet(sheet, runtime.store), 400)
    return () => window.clearTimeout(timer)
  }, [sheet, keeping, runtime.store])

  useEffect(() => {
    if (!keeping) return
    const timer = window.setTimeout(() => keepMemory(memory, runtime.store), 400)
    return () => window.clearTimeout(timer)
  }, [memory, keeping, runtime.store])

  useLayoutEffect(() => {
    const frames = (window.sheetFrames ??= [])
    frames.push(performance.now() - started)
    if (frames.length > 400) frames.splice(0, frames.length - 400)
  })

  // Everything read from the sheet is read once per change, so a drag pays for none of it.
  const view: SheetRead = useMemo(() => {
    const rooms = placedRooms(sheet, STOREY)
    const read = report(sheet, STOREY)
    const labels = new Map(
      rooms.map((r) => {
        const area = r2(areaOf(r))
        const short = area < r.target - 0.05
        const text =
          settings.showArea || short
            ? short
              ? `${fmt(area)} of ${fmt(r.target)} m²`
              : `${fmt(area)} m²`
            : ''
        return [r.id, labelPlan(r, { area: text || undefined }, sheet, STOREY)] as const
      }),
    )
    return {
      rooms,
      labels,
      overlaps: overlapsOf(sheet, STOREY).map((o) => ({
        ids: [o.a.id, o.b.id] as [string, string],
        polys: o.polys,
      })),
      pockets: settings.showPockets ? pocketsOf(sheet, STOREY) : [],
      read,
      over: new Set(read.boundary.filter((side) => side.over).map((side) => side.side)),
    }
  }, [sheet, settings, STOREY])

  const selected = view.rooms.filter((r) => selection.includes(r.id))

  const apply = (change: Change | null): boolean => {
    if (!change) return false
    if (!change.result.ok) {
      setFlash(change.result.said)
      return false
    }
    const now = docRef.current
    const next = { sheet: change.sheet, history: remember(now.history, now.sheet) }
    touched.current = true
    docRef.current = next
    setDoc(next)
    setFlash(null)
    return true
  }

  /** The storey switch: what was selected on the storey left behind is let go, as the mock does. */
  const goStorey = (k: number) => {
    const to = Math.max(0, Math.min(storeyCountOf(docRef.current.sheet) - 1, Math.floor(k)))
    showStorey(to)
    setSelection((was) =>
      was.filter((id) => placedRooms(docRef.current.sheet, to).some((r) => r.id === id)),
    )
    setMenu(null)
    setPocketPicked(null)
    setMeasure(null)
    setDrawing(null)
  }

  const pointAt = (clientX: number, clientY: number): Point => {
    if (!svg.current) return [0, 0]
    const at = pointerAt(svg.current, clientX, clientY)
    return [at[0], at[1]]
  }

  const inBox = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect()
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 }
  }

  const stepBack = () => {
    const back = undo(docRef.current.sheet, { history: docRef.current.history })
    if (!back.result.ok) return
    docRef.current = { sheet: back.sheet, history: back.history }
    setDoc(docRef.current)
  }

  const stepForward = () => {
    const forward = redo(docRef.current.sheet, { history: docRef.current.history })
    if (!forward.result.ok) return
    docRef.current = { sheet: forward.sheet, history: forward.history }
    setDoc(docRef.current)
  }

  // The assistant's changes are not undo steps of their own: one message is one step.
  const agentWrite = (change: Change): Result => {
    if (change.result.ok) {
      touched.current = true
      docRef.current = { ...docRef.current, sheet: change.sheet }
      setDoc(docRef.current)
    }
    return change.result
  }

  const agentBegin = () => {
    const now = docRef.current
    docRef.current = { ...now, history: remember(now.history, now.sheet) }
    setDoc(docRef.current)
  }

  const agentEnd = (changed: boolean) => {
    if (changed) return
    const { past, future } = docRef.current.history
    docRef.current = { ...docRef.current, history: { past: past.slice(0, -1), future } }
    setDoc(docRef.current)
  }

  const backToSample = () => {
    const now = docRef.current
    touched.current = true
    docRef.current = {
      sheet: sampleSheet(now.sheet.settings),
      history: remember(now.history, now.sheet),
    }
    setDoc(docRef.current)
    setSelection([])
    setMenu(null)
  }

  const clearPlan = () => {
    if (apply(sendBack(docRef.current.sheet, { ids: docRef.current.sheet.rooms.map((r) => r.id) })))
      setSelection([])
  }

  const hold = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }

  // ---------- the hand, while it holds something ----------

  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => {
      const held = dragRef.current
      if (!held) return
      const next = dragTo(
        held,
        pointAt(event.clientX, event.clientY),
        { shift: event.shiftKey },
        docRef.current.sheet,
        STOREY,
      )
      dragRef.current = next
      setDrag(next)
    }
    const onUp = (event: PointerEvent) => {
      const held = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!held) return
      if (held.kind === 'mark') {
        setSelection(marked(held, docRef.current.sheet, STOREY))
        return
      }
      if (held.kind === 'new') {
        const rect = box.current?.getBoundingClientRect()
        const onSheet =
          held.started &&
          rect &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        if (
          onSheet &&
          apply(
            place(docRef.current.sheet, {
              id: held.id,
              x: held.room.x,
              y: held.room.y,
              storey: STOREY,
            }),
          )
        )
          setSelection([held.id])
        return
      }
      apply(dropOf(held, docRef.current.sheet, STOREY))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // The listeners read the drag through its ref, so they are set up once per drag, not per frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  useEffect(() => {
    if (!pan) return
    const onMove = (event: PointerEvent) => {
      const rect = svg.current?.getBoundingClientRect()
      if (!rect) return
      const metres = sheetExtent.width / pan.camera.scale / Math.max(1, rect.width)
      setCamera({
        ...pan.camera,
        x: pan.camera.x - (event.clientX - pan.from[0]) * metres,
        y: pan.camera.y - (event.clientY - pan.from[1]) * metres,
      })
    }
    const onUp = () => setPan(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [pan])

  // A rectangle or a circle is drawn by one drag, so the release finishes it wherever it happens.
  useEffect(() => {
    if (!drawing || drawing.shape === 'poly' || !drawing.from) return
    const onUp = () => finishDrawing()
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing?.shape, drawing?.from !== null])

  // ---------- drawing and reshaping ----------

  const startDraw = (id: string, shape: Shape, keepSelection = false) => {
    setDrawMenuFor(null)
    setMenu(null)
    setPocketPicked(null)
    hold(null)
    if (!keepSelection) setSelection([])
    setDrawing(startDrawing(id, shape, keepSelection))
  }

  const finishDrawing = (polygon?: Point[]) => {
    const held = drawRef.current
    if (!held) return
    const shape = polygon ?? shapePolygon(held)
    setDrawing(null)
    if (!shape || shape.length < 3) return
    const change = drawnShape(held, shape, docRef.current.sheet, STOREY)
    const ok = apply(change)
    if (ok && !held.reshaping) setSelection([held.id])
    if (held.reshaping) setDrawing(startDrawing(held.id, held.shape, true))
  }

  const startReshape = (room: Room) => {
    if (!room.placed || room.fixed || room.locked || isOpen(room)) return
    setMeasure(null)
    setMenu(null)
    setPocketPicked(null)
    setSelection([room.id])
    setReshaping({ id: room.id, before: docRef.current.sheet, shape: 'rect' })
    setDrawing(startDrawing(room.id, 'rect', true))
  }

  const doneReshape = () => {
    setReshaping(null)
    setDrawing(null)
  }

  const cancelReshape = () => {
    const was = reshaping
    setReshaping(null)
    setDrawing(null)
    if (was) {
      docRef.current = { ...docRef.current, sheet: was.before }
      setDoc((d) => ({ ...d, sheet: was.before }))
    }
  }

  // ---------- what the sheet reports ----------

  const on = {
    onRoomDown: (room: Room, event: ReactPointerEvent) => {
      if (event.button !== 0) return
      if (drawing) {
        event.stopPropagation()
        drawDown(event)
        return
      }
      if (measure) {
        event.stopPropagation()
        measureDown(event)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (pocketPicked !== null && view.pockets[pocketPicked]) {
        givePocketTo(view.pockets[pocketPicked]!, room.id)
        return
      }
      setPocketPicked(null)
      if (event.shiftKey) {
        setSelection((was) =>
          was.includes(room.id) ? was.filter((id) => id !== room.id) : [...was, room.id],
        )
        return
      }
      const kin = room.group ? view.rooms.filter((o) => o.group === room.group) : [room]
      const ids = selection.includes(room.id) ? selection : kin.map((o) => o.id)
      setSelection(ids)
      if (room.locked || room.fixed) return
      hold(beginMove(ids, room.id, pointAt(event.clientX, event.clientY)))
    },
    onRoomMenu: (room: Room, event: ReactMouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (drawing || room.fixed) return
      if (!selection.includes(room.id)) setSelection([room.id])
      const [x, y] = pointAt(event.clientX, event.clientY)
      let corner: { at: Point; d: number } | null = null
      for (const c of worldCorners(room)) {
        const d = Math.hypot(c[0] - x, c[1] - y)
        if (d < 0.8 && (!corner || d < corner.d)) corner = { at: c, d }
      }
      setPocketPicked(null)
      setMenu({
        kind: 'room',
        room,
        corner: corner ? corner.at : null,
        at: inBox(event.clientX, event.clientY),
      })
    },
    onWallDown: (
      room: Room,
      wall: number,
      side: Side4 | null,
      shared: string | null,
      event: ReactPointerEvent,
    ) => {
      if (event.button !== 0 || shiftPick(event)) return
      event.preventDefault()
      event.stopPropagation()
      const at = pointAt(event.clientX, event.clientY)
      hold(
        side ? beginResize(sheet, room.id, side, shared, at) : beginWall(sheet, room.id, wall, at),
      )
    },
    onCornerDown: (room: Room, index: number, loop: Point[], event: ReactPointerEvent) => {
      if (event.button !== 0 || shiftPick(event)) return
      event.preventDefault()
      event.stopPropagation()
      hold(beginCorner(room.id, index, loop, pointAt(event.clientX, event.clientY)))
    },
    onTurnDown: (room: Room, event: ReactPointerEvent) => {
      if (event.button !== 0 || shiftPick(event)) return
      event.preventDefault()
      event.stopPropagation()
      const at = pointAt(event.clientX, event.clientY)
      if (pivot && pivot.key === keyOf([room.id])) hold(beginGroupTurn([room.id], pivot.at, at))
      else hold(beginTurn(sheet, room.id))
    },
    onGroupTurnDown: (event: ReactPointerEvent) => {
      if (event.button !== 0 || shiftPick(event)) return
      event.preventDefault()
      event.stopPropagation()
      const ids = selected.filter((r) => !r.fixed).map((r) => r.id)
      const at = pointAt(event.clientX, event.clientY)
      const about = pivot && pivot.key === keyOf(ids) ? pivot.at : middleOf(sheet, STOREY, ids)
      hold(beginGroupTurn(ids, about, at))
    },
    onLabelDown: (room: Room, event: ReactPointerEvent) => {
      if (event.button !== 0 || shiftPick(event)) return
      event.preventDefault()
      event.stopPropagation()
      hold(beginLabel(room.id, pointAt(event.clientX, event.clientY)))
    },
    onBackgroundDown: (event: ReactPointerEvent) => {
      if (event.button === 1 || (event.button === 0 && spaceHeld.current)) {
        event.preventDefault()
        setPan({ from: [event.clientX, event.clientY], camera })
        return
      }
      if (event.button !== 0) return
      if (measure) {
        measureDown(event)
        return
      }
      if (drawing) {
        drawDown(event)
        return
      }
      const target = event.target
      const background =
        target === event.currentTarget ||
        (target instanceof Element && !!target.closest('.grid')) ||
        (target instanceof Element &&
          target.tagName === 'rect' &&
          target.classList.contains('plot'))
      if (!background) return
      setMenu(null)
      if (pocketPicked !== null) {
        setPocketPicked(null)
        return
      }
      const keep = event.shiftKey ? selection : []
      if (!event.shiftKey) setSelection([])
      hold(beginMark(pointAt(event.clientX, event.clientY), keep))
    },
    onBackgroundMenu: (event: ReactMouseEvent) => {
      event.preventDefault()
      if (drawing) {
        if (drawing.shape === 'poly' && drawing.pts.length >= 3) finishDrawing(drawing.pts)
        else setDrawing(null)
        return
      }
      const target = event.target
      if (
        target instanceof Element &&
        (target.closest('.room') ||
          target.closest('.handle') ||
          target.closest('.turn') ||
          target.closest('[data-pocket]'))
      )
        return
      const at = pointAt(event.clientX, event.clientY)
      const pocket = pocketsOf(sheet, STOREY).find((k) =>
        k.pieces.some((p) => insideConvex(p, at[0], at[1])),
      )
      setSelection([])
      setPocketPicked(null)
      const where = inBox(event.clientX, event.clientY)
      if (pocket) setMenu({ kind: 'pocket', pocket, at: where })
      else
        setMenu({
          kind: 'note',
          note: outsideBuildable({ x: at[0], y: at[1], w: 0, h: 0 } as unknown as Room, BUILD)
            ? 'Outside the line the ground floor may reach.'
            : 'No room walls this space yet, so there is nothing to give it to.',
          at: where,
        })
    },
    onPocketDown: (index: number, event: ReactPointerEvent) => {
      event.stopPropagation()
      if (drawing) {
        drawDown(event)
        return
      }
      if (measure) {
        measureDown(event)
        return
      }
      if (event.button !== 0) return
      setPocketPicked(index)
      setMenu(null)
      setSelection([])
    },
    onPocketMenu: (index: number, event: ReactMouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (drawing) return
      const pocket = view.pockets[index]
      if (!pocket) return
      setPocketPicked(index)
      setSelection([])
      setMenu({ kind: 'pocket', pocket, at: inBox(event.clientX, event.clientY) })
    },
    onTypeSize: (room: Room, what: 'w' | 'h' | 'angle' | 'area', event: ReactMouseEvent) => {
      event.stopPropagation()
      if (event.shiftKey) return
      const value =
        what === 'angle'
          ? String(Math.round(room.angle || 0))
          : what === 'area'
            ? fmt(r2(areaOf(room)))
            : fmt(room[what])
      const where = inBox(event.clientX, event.clientY)
      setTypeIn({
        at: { x: where.x - 32, y: where.y - 12 },
        value,
        apply: (typed) =>
          what === 'angle'
            ? turn(docRef.current.sheet, { ids: [room.id], storey: STOREY, angle: typed })
            : what === 'area'
              ? setArea(docRef.current.sheet, { id: room.id, area: typed, storey: STOREY })
              : setSize(docRef.current.sheet, {
                  id: room.id,
                  [what]: typed,
                  storey: STOREY,
                }),
      })
    },
    onWheel: (event: ReactWheelEvent) => {
      event.preventDefault()
      setCamera((was) =>
        zoomAbout(
          sheetExtent,
          was,
          pointAt(event.clientX, event.clientY),
          wheelFactor(event.nativeEvent),
        ),
      )
    },
    onPointerMove: (event: ReactPointerEvent) => {
      if (drawing && (drawing.shape === 'poly' ? drawing.pts.length : drawing.from)) {
        drawMove(event)
        return
      }
      if (measure && measure.a && !measure.b) {
        const snap = measurePoint(
          pointAt(event.clientX, event.clientY),
          { shift: event.shiftKey },
          sheet,
          STOREY,
        )
        setMeasure({ ...measure, at: snap.at })
        return
      }
      if (drag) return
      const target = event.target
      const over = target instanceof Element ? target.closest('[data-room]') : null
      const id = over instanceof Element ? over.getAttribute('data-room') : null
      const where = inBox(event.clientX, event.clientY)
      if (hover !== id) setHover(id)
      if (!id) {
        if (tagTimer.current) window.clearTimeout(tagTimer.current)
        if (tag) setTag(null)
        return
      }
      if (tag?.id === id) {
        setTag({ id, x: where.x + 14, y: where.y + 16 })
        return
      }
      if (tagTimer.current) window.clearTimeout(tagTimer.current)
      tagTimer.current = window.setTimeout(
        () => setTag({ id, x: where.x + 14, y: where.y + 16 }),
        settings.tagDelay * 1000,
      )
    },
    onDoubleClick: () => {
      const held = drawRef.current
      if (held && held.shape === 'poly' && held.pts.length >= 3) finishDrawing(held.pts)
    },
  }

  /** Shift over a handle, a knob or a label picks the room under the pointer instead of grabbing. */
  const shiftPick = (event: ReactPointerEvent) => {
    if (!event.shiftKey || event.button !== 0) return false
    event.preventDefault()
    event.stopPropagation()
    const [x, y] = pointAt(event.clientX, event.clientY)
    const under = [...view.rooms]
      .reverse()
      .find((o) => !o.fixed && worldPieces(o).some((wp) => insideConvex(wp, x, y)))
    if (under)
      setSelection((was) =>
        was.includes(under.id) ? was.filter((id) => id !== under.id) : [...was, under.id],
      )
    return true
  }

  const drawDown = (event: ReactPointerEvent) => {
    const held = drawRef.current
    if (!held || event.button !== 0) return
    const snap = drawnAt(
      held,
      pointAt(event.clientX, event.clientY),
      { shift: event.shiftKey },
      sheet,
      STOREY,
    )
    if (held.shape === 'poly') {
      if (closesPolygon(held, snap.at)) {
        finishDrawing(held.pts)
        return
      }
      setDrawing({ ...held, pts: [...held.pts, snap.at], at: null, snap })
      return
    }
    setDrawing({ ...held, from: snap.at, at: snap.at, snap })
  }

  const drawMove = (event: ReactPointerEvent) => {
    const held = drawRef.current
    if (!held) return
    const snap = drawnAt(
      held,
      pointAt(event.clientX, event.clientY),
      { shift: event.shiftKey },
      sheet,
      STOREY,
    )
    setDrawing({ ...held, at: snap.at, snap })
  }

  const measureDown = (event: ReactPointerEvent) => {
    if (!measure || event.button !== 0) return
    event.preventDefault()
    const snap = measurePoint(
      pointAt(event.clientX, event.clientY),
      { shift: event.shiftKey },
      sheet,
      STOREY,
    )
    setMeasure(measureClick(measure, snap))
  }

  const givePocketTo = (pocket: Pocket, room?: string) => {
    const index = pocketsOf(sheet, STOREY).findIndex(
      (k) =>
        Math.abs(k.area - pocket.area) < 1e-6 && Math.abs(k.centre[0] - pocket.centre[0]) < 1e-6,
    )
    if (index < 0) return
    apply(givePocket(sheet, { pocket: index, room, storey: STOREY }))
    setPocketPicked(null)
    setMenu(null)
  }

  const pocketChoice = (pocket: Pocket, choice: PocketChoice) => {
    const index = pocketsOf(sheet, STOREY).findIndex(
      (k) =>
        Math.abs(k.area - pocket.area) < 1e-6 && Math.abs(k.centre[0] - pocket.centre[0]) < 1e-6,
    )
    if (index < 0) return
    if (choice.kind === 'give')
      apply(givePocket(sheet, { pocket: index, room: choice.room, storey: STOREY }))
    if (choice.kind === 'court') apply(makeCourt(sheet, { pocket: index, storey: STOREY }))
    if (choice.kind === 'corridor') apply(makeCorridor(sheet, { pocket: index, storey: STOREY }))
    setMenu(null)
    setPocketPicked(null)
  }

  // ---------- the menu rows ----------

  const keyOf = (ids: string[]) => [...ids].sort().join(',')

  const roomChoice = (choice: RoomChoice) => {
    const ids = selected.filter((r) => !r.fixed).map((r) => r.id)
    setMenu(null)
    if (!ids.length) return
    const pivotAt = pivot && pivot.key === keyOf(ids) ? pivot.at : undefined
    switch (choice.kind) {
      case 'pivot':
        setPivot(choice.at ? { key: keyOf(ids), at: choice.at } : null)
        return
      case 'quarter':
        apply(turn(sheet, { ids, storey: STOREY, quarter: true, pivot: pivotAt }))
        return
      case 'north':
        apply(turn(sheet, { ids, storey: STOREY, faceNorth: true, pivot: pivotAt }))
        return
      case 'mirror':
        apply(mirror(sheet, { ids, axis: choice.axis, storey: STOREY }))
        return
      case 'lock':
        apply(
          choice.on ? lock(sheet, { ids, storey: STOREY }) : unlock(sheet, { ids, storey: STOREY }),
        )
        return
      case 'group':
        apply(group(sheet, { ids, storey: STOREY }))
        return
      case 'ungroup':
        apply(ungroup(sheet, { ids, storey: STOREY }))
        return
      case 'combine':
        apply(combine(sheet, { ids, survivor: choice.survivor, storey: STOREY }))
        setSelection([choice.survivor])
        return
      case 'reshape': {
        const room = selected[0]
        if (room) startReshape(room)
        return
      }
      case 'give':
        apply(
          choice.how === 'carve'
            ? carveBelow(sheet, { ids, storey: STOREY })
            : pushOthers(sheet, { ids, storey: STOREY }),
        )
        return
      case 'cut':
        apply(cutToSetback(sheet, { ids, storey: STOREY }))
        return
      case 'colour':
        setColouring({
          ids,
          value: selected[0]?.color ?? settings.colors[selected[0]?.cat ?? 'shared'] ?? '#EBDBB9',
        })
        return
      case 'colourReset':
        apply(clearColor(sheet, { ids }))
        return
      case 'labelReset':
        apply(clearLabel(sheet, { ids }))
        return
      case 'restore': {
        const one = selected[0]
        if (one) apply(restore(sheet, { id: one.id, storey: STOREY }))
        return
      }
      case 'copy':
        clipboard.current = { ids, storey: STOREY, pastes: 0 }
        setFlash('Copied · Ctrl+V pastes')
        return
      case 'setStorey':
        if (apply(setStorey(sheet, { ids, storey: STOREY, to: choice.to }))) goStorey(choice.to)
        return
      case 'copyStorey':
        if (apply(copyTo(sheet, { ids, storey: STOREY, to: choice.to, shift: 0 })))
          goStorey(choice.to)
        return
      case 'back':
        apply(sendBack(sheet, { ids }))
        setSelection([])
        return
    }
  }

  // ---------- the keys ----------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const typing =
        target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
      const held = drawRef.current
      const command = keyCommand(event, {
        typing,
        selected: selection.length,
        drawing: !!held,
        polygon: held?.pts.length ?? 0,
        reshaping: !!reshaping,
        measuring: !!measure,
        dragging: !!dragRef.current,
        grid: settings.grid,
      })
      if (!command) return
      const ids = selected.filter((r) => !r.fixed && !r.locked).map((r) => r.id)
      switch (command.kind) {
        case 'copy':
          if (ids.length) {
            clipboard.current = { ids, storey: STOREY, pastes: 0 }
            setFlash(`${ids.length} zone${ids.length > 1 ? 's' : ''} copied · Ctrl+V pastes`)
            event.preventDefault()
          }
          return
        case 'paste': {
          const held2 = clipboard.current
          if (!held2) return
          held2.pastes += 1
          event.preventDefault()
          apply(
            copyTo(docRef.current.sheet, {
              ids: held2.ids,
              storey: held2.storey,
              to: STOREY,
              shift: held2.storey === STOREY ? held2.pastes : 0,
            }),
          )
          return
        }
        case 'undo':
          event.preventDefault()
          stepBack()
          return
        case 'redo':
          event.preventDefault()
          stepForward()
          return
        case 'apply-reshape':
          doneReshape()
          return
        case 'clear-polygon':
          if (held) setDrawing({ ...held, pts: [], at: null })
          return
        case 'cancel-reshape':
          cancelReshape()
          return
        case 'close-polygon':
          if (held) finishDrawing(held.pts)
          return
        case 'escape':
          if (measure) setMeasure(null)
          else if (menu) setMenu(null)
          else if (held) setDrawing(null)
          else if (pocketPicked !== null) setPocketPicked(null)
          else {
            hold(null)
            setSelection([])
            setPivot(null)
          }
          return
        case 'pan-held':
          spaceHeld.current = command.held
          event.preventDefault()
          return
        case 'measure':
          setDrawing(null)
          setMenu(null)
          setPocketPicked(null)
          setMeasure((was) => (was ? null : startMeasure()))
          return
        case 'fit':
          setCamera(fitCamera)
          return
        case 'nudge':
          if (ids.length) {
            event.preventDefault()
            apply(
              move(docRef.current.sheet, { ids, dx: command.dx, dy: command.dy, storey: STOREY }),
            )
          }
          return
        case 'send-back':
          if (ids.length) {
            apply(sendBack(docRef.current.sheet, { ids }))
            setSelection([])
          }
          return
        case 'quarter-turn':
          if (ids.length) {
            const about = pivot && pivot.key === keyOf(ids) ? pivot.at : undefined
            apply(turn(docRef.current.sheet, { ids, storey: STOREY, quarter: true, pivot: about }))
          }
          return
      }
    }
    const onUp = (event: KeyboardEvent) => {
      const command = keyRelease(event)
      if (command?.kind === 'pan-held') spaceHeld.current = command.held
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  })

  // ---------- the sentence ----------

  const parts: Part[] = measure
    ? measuringSentence(measure)
    : drawing
      ? drawingSentence({
          name: sheet.rooms.find((r) => r.id === drawing.id)?.name ?? '',
          target: sheet.rooms.find((r) => r.id === drawing.id)?.target ?? 0,
          shape: drawing.shape,
          area: (() => {
            const poly = shapePolygon(drawing)
            return poly ? polyArea(poly) : null
          })(),
          snapKind: drawing.snap?.kind ?? null,
          reshaping: drawing.reshaping,
          roomArea: (() => {
            const room = view.rooms.find((r) => r.id === drawing.id)
            return room ? r2(areaOf(room)) : 0
          })(),
        })
      : sentenceOf(view.read, settings)

  const tagRoom = tag ? view.rooms.find((r) => r.id === tag.id) : null

  const under = (() => {
    const ids = selected.map((r) => r.id)
    const rooms = overlapsOf(sheet, STOREY)
      .filter((o) => ids.includes(o.a.id) !== ids.includes(o.b.id))
      .map((o) => (ids.includes(o.a.id) ? o.b : o.a))
    return {
      names: [...new Set(rooms.map((r) => r.name))],
      can: rooms.some((r) => !r.locked && !r.fixed),
    }
  })()

  const pickedPocket = pocketPicked !== null ? (view.pockets[pocketPicked] ?? null) : null

  return (
    <div className="sheet-stage">
      <p className="head-line">
        Zoning by hand on the fresh brief&rsquo;s corner plot, 20 × 25 m, service street south, side
        street east, north turned 25°. Ground floor. Drag a room from the program and drop it where
        you want it, or draw it; R turns it; a room dropped on another waits, tinted, or pushes the
        lower one; right-click it to settle the overlap, or right-click an empty space walled in by
        rooms to give it away, make it a court, or make it a corridor.
      </p>
      <div className="tools">
        <span className="grp">
          <button type="button" onClick={stepBack} title="Ctrl+Z">
            Undo
          </button>
          <button type="button" onClick={stepForward} title="Ctrl+Shift+Z">
            Redo
          </button>
          <button type="button" onClick={() => setCamera(fitCamera)} title="F">
            Fit
          </button>
          <button
            type="button"
            className={measure ? 'on' : ''}
            onClick={() => setMeasure((was) => (was ? null : startMeasure()))}
            title="M"
          >
            Measure
          </button>
        </span>
        <span className="grp">
          <Storeys
            sheet={sheet}
            storey={storey}
            onStorey={goStorey}
            onAdd={() => {
              const n = storeyCountOf(sheet)
              if (apply(addStorey(sheet))) goStorey(n)
            }}
            onDrop={() => {
              const n = storeyCountOf(sheet)
              if (apply(dropTopStorey(sheet)) && storey >= n - 1) goStorey(n - 2)
            }}
          />
        </span>
        <span className="grp far">
          <button type="button" onClick={backToSample} title="Put the sample sheet back">
            Back to the sample
          </button>
          <button type="button" onClick={clearPlan}>
            Clear the plan
          </button>
        </span>
        <span className="grp">
          <button
            type="button"
            title="R"
            disabled={!selected.length}
            onClick={() => roomChoice({ kind: 'quarter' })}
          >
            Rotate 90°
          </button>
          <button
            type="button"
            disabled={selected.length !== 1}
            onClick={() => (reshaping ? doneReshape() : selected[0] && startReshape(selected[0]!))}
          >
            Reshape
          </button>
          <button
            type="button"
            disabled={selected.length !== 1}
            onClick={() => roomChoice({ kind: 'restore' })}
          >
            Restore shape
          </button>
          <button
            type="button"
            disabled={selected.length < 2 && !selected.some((r) => r.group)}
            onClick={() =>
              roomChoice(selected.some((r) => r.group) ? { kind: 'ungroup' } : { kind: 'group' })
            }
          >
            Group
          </button>
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => roomChoice({ kind: 'lock', on: !selected.every((r) => r.locked) })}
          >
            Lock
          </button>
        </span>
      </div>
      <div className="behave">
        <div className="row">
          <label>When a room lands on another</label>
          <div className="seg">
            <button
              type="button"
              className={settings.rule === 'wait' ? 'on' : ''}
              title="The dropped room lands where you put it. Overlaps are tinted and wait; right-click a room to settle each one."
              onClick={() => apply(setSetting(sheet, { name: 'rule', value: 'wait' }))}
            >
              Wait
            </button>
            <button
              type="button"
              className={settings.rule === 'push' ? 'on' : ''}
              title="The dropped room shoves the rooms lower in the program aside. They slide, never shrink."
              onClick={() => apply(setSetting(sheet, { name: 'rule', value: 'push' }))}
            >
              Push others
            </button>
          </div>
          <span className="hint">{RULE_HINT[settings.rule]}</span>
        </div>
        <div className="row">
          <label>Build to the boundary</label>
          <div className="seg">
            {(['off', 'sides', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={settings.boundary === value ? 'on' : ''}
                onClick={() => apply(setSetting(sheet, { name: 'boundary', value }))}
              >
                {value === 'off' ? 'Nowhere' : value === 'sides' ? 'Neighbours' : 'Street too'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="body-row">
        <Program
          sheet={sheet}
          selection={selection}
          drawingId={drawing && !drawing.reshaping ? drawing.id : null}
          drawMenuFor={drawMenuFor}
          onNewDown={(room, event) => {
            event.preventDefault()
            hold(beginNew(sheet, room.id))
          }}
          onPick={(room) => {
            if (storeyOf(room) !== storey && !acrossStoreys(room, settings))
              goStorey(storeyOf(room))
            setSelection([room.id])
            setPocketPicked(null)
            setMenu(null)
          }}
          onRemove={(room) => apply(removeRoom(sheet, { id: room.id }))}
          onReorder={(id, before) => apply(reorder(docRef.current.sheet, { id, before }))}
          onDrawMenu={setDrawMenuFor}
          onDraw={(id, shape) => startDraw(id, shape)}
          onAdd={(kind, name, area) => apply(addRoom(sheet, { kind, name, area }))}
        />
        <div className="middle">
          <div className="sheet-box" ref={box}>
            <SheetView
              sheet={sheet}
              storey={STOREY}
              view={view}
              selection={selection}
              drag={drag}
              drawing={drawing}
              measure={measure}
              reshaping={reshaping ? reshaping.id : null}
              pocketPicked={pocketPicked}
              hover={hover}
              panning={!!pan}
              camera={camera}
              svgRef={(element) => {
                svg.current = element
              }}
              on={on}
            />
            {(drawing || reshaping) && (
              <div className="reshape-bar">
                <span className="who">
                  {reshaping ? 'Reshaping' : 'Drawing'}{' '}
                  {sheet.rooms.find((r) => r.id === (reshaping?.id ?? drawing?.id))?.name}
                </span>
                {(['rect', 'circle', 'poly'] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    className={(reshaping?.shape ?? drawing?.shape) === shape ? 'on' : ''}
                    onClick={() => {
                      const id = reshaping?.id ?? drawing?.id
                      if (!id) return
                      if (reshaping) setReshaping({ ...reshaping, shape })
                      setDrawing(startDrawing(id, shape, !!reshaping))
                    }}
                  >
                    {shape === 'rect' ? 'Rectangle' : shape === 'circle' ? 'Circle' : 'Polygon'}
                  </button>
                ))}
                {reshaping && (
                  <button type="button" onClick={doneReshape}>
                    Done · Enter
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (reshaping ? cancelReshape() : setDrawing(null))}
                >
                  Cancel · Esc
                </button>
              </div>
            )}
            {pickedPocket && !menu && (
              <PocketBar
                at={pocketBarAt(pickedPocket, svg.current, box.current)}
                pocket={pickedPocket}
                settings={settings}
                to={bestNeighbour(pickedPocket, sheet)}
                onChoose={(choice) => pocketChoice(pickedPocket, choice)}
              />
            )}
            {menu?.kind === 'room' && (
              <RoomMenu
                at={menu.at}
                corner={menu.corner}
                pivotSet={!!pivot && pivot.key === keyOf(selected.map((r) => r.id))}
                room={menu.room}
                selection={selected.filter((r) => !r.fixed)}
                under={under}
                canRestore={canRestore(menu.room)}
                pastSetback={selected.some((r) => outsideBuildable(r, BUILD))}
                settings={settings}
                storey={storey}
                storeys={storeyCountOf(sheet)}
                onChoose={roomChoice}
              />
            )}
            {menu?.kind === 'pocket' && (
              <PocketMenu
                at={menu.at}
                pocket={menu.pocket}
                sheet={sheet}
                onChoose={(choice) => pocketChoice(menu.pocket, choice)}
              />
            )}
            {menu?.kind === 'note' && <EmptyNote at={menu.at} note={menu.note} />}
            {tagRoom && tag && (
              <div className="room-tag" style={{ left: `${tag.x}px`, top: `${tag.y}px` }}>
                <b>{tagRoom.name}</b> ·{' '}
                {r2(areaOf(tagRoom)) < tagRoom.target - 0.05 ? (
                  <span className="bad">
                    {fmt(r2(areaOf(tagRoom)))} of {fmt(tagRoom.target)} m²
                  </span>
                ) : (
                  `${fmt(r2(areaOf(tagRoom)))} m²`
                )}
                {tagRoom.locked ? ' · locked' : ''}
              </div>
            )}
            {typeIn && (
              <input
                className="typein"
                autoFocus
                defaultValue={typeIn.value}
                style={{ left: `${typeIn.at.x}px`, top: `${typeIn.at.y}px` }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    const typed = Number.parseFloat(event.currentTarget.value)
                    setTypeIn(null)
                    if (Number.isFinite(typed)) apply(typeIn.apply(typed))
                  }
                  if (event.key === 'Escape') setTypeIn(null)
                }}
                onBlur={() => setTypeIn(null)}
              />
            )}
            {colouring && (
              <input
                type="color"
                className="typein"
                aria-label="Colour"
                autoFocus
                value={colouring.value}
                style={{ left: '8px', bottom: '8px', top: 'auto' }}
                onChange={(event) => {
                  const value = event.target.value
                  setColouring({ ...colouring, value })
                  apply(setColor(docRef.current.sheet, { ids: colouring.ids, color: value }))
                }}
                onBlur={() => setColouring(null)}
              />
            )}
          </div>
          <MassView
            sheet={sheet}
            storey={storey}
            selection={selection}
            hover={hover}
            overlaps={view.overlaps}
            onHover={setHover}
            onSelect={setSelection}
            onStorey={goStorey}
            onBegin={agentBegin}
            onWrite={agentWrite}
            onEnd={agentEnd}
            apply={apply}
            roomMenu={(room, at) => (
              <RoomMenu
                at={at}
                corner={null}
                pivotSet={false}
                room={room}
                selection={selected.filter((r) => !r.fixed)}
                under={under}
                canRestore={canRestore(room)}
                pastSetback={selected.some((r) => outsideBuildable(r, BUILD))}
                settings={settings}
                storey={storey}
                storeys={storeyCountOf(sheet)}
                onChoose={roomChoice}
              />
            )}
          />
          <div className="say">
            {parts.map((part, i) => (
              <span key={i} className={part.bad ? 'bad' : undefined}>
                {i > 0 && ' · '}
                {part.lead && <b>{part.lead}</b>}
                {part.lead && ' '}
                {part.text}
              </span>
            ))}
            {flash && <span className="bad"> · {flash}</span>}
          </div>
          <div className="legend">
            <span>
              <i style={{ background: 'var(--reception)' }} />
              Reception
            </span>
            <span>
              <i style={{ background: 'var(--shared)' }} />
              Shared
            </span>
            <span>
              <i style={{ background: 'var(--private)' }} />
              Private
            </span>
            <span>
              <i style={{ background: 'var(--service)' }} />
              Service
            </span>
            <span>
              <i style={{ background: 'var(--circ)' }} />
              Circulation
            </span>
            <span>
              <i style={{ background: 'var(--sheet)', borderStyle: 'dashed' }} />
              Open ground: cars, garden
            </span>
          </div>
        </div>
        <Chat
          read={() => docRef.current.sheet}
          write={agentWrite}
          storey={STOREY}
          memory={memory}
          onMemory={setMemory}
          sample={runtime.sample}
          ready={runtime.ready}
          onBegin={agentBegin}
          onEnd={agentEnd}
        />
      </div>
    </div>
  )
}

const canRestore = (r: Room) =>
  !!(r.pieces && r.pieces.length) || !!(r.lost && (r.lost.w > 1e-6 || r.lost.h > 1e-6))

/** Where the bar for the space in hand stands: beside the space, inside the sheet's box. */
function pocketBarAt(pocket: Pocket, svg: SVGSVGElement | null, box: HTMLElement | null) {
  const screen = svg?.getScreenCTM()
  const rect = box?.getBoundingClientRect()
  if (!screen || !rect) return { x: 8, y: 8 }
  const at = new DOMPoint(pocket.centre[0], pocket.centre[1]).matrixTransform(screen)
  return {
    x: Math.max(4, Math.min(rect.width - 330, at.x - rect.left + 14)),
    y: Math.max(4, Math.min(rect.height - 44, at.y - rect.top - 18)),
  }
}
