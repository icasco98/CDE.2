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
  DEFAULTS,
  DOOR,
  RULE_HINT,
  acrossStoreys,
  addDoor,
  addStorey,
  dropTopStorey,
  areaOf,
  bestNeighbour,
  carveBelow,
  cloneRoom,
  clearColor,
  clearLabel,
  combine,
  copyTo,
  cutToSetback,
  doorAcross,
  doorAt,
  doorNear,
  doorRead,
  doorsOf,
  flipDoor,
  fmt,
  hingeDoor,
  givePocket,
  group,
  insideConvex,
  isOpen,
  labelPlan,
  lock,
  lostDoors,
  makeCorridor,
  makeCourt,
  mirror,
  move,
  newDoors,
  newHistory,
  openWall,
  outsideBuildable,
  overlapsOf,
  place,
  placedRooms,
  pocketsOf,
  pushOthers,
  polyArea,
  r2,
  reattachDoor,
  redo,
  remember,
  removeDoor,
  removeRoom,
  report,
  restore,
  sampleSheet,
  sendBack,
  setArea,
  setColor,
  setDoorWidth,
  setSetting,
  setSize,
  setStorey,
  slideDoor,
  sheetOf,
  storeyCountOf,
  storeyOf,
  turn,
  undo,
  ungroup,
  unlock,
  walkTest,
  worldCorners,
  worldPieces,
  type Change,
  type DoorRef,
  type DoorType,
  type Hit,
  type Memory,
  type Pocket,
  type Point,
  type Result,
  type Room,
  type Settings,
  type Sheet,
  type Side4,
} from '../../sheet'
import { EXTERIOR, type EdgeKind, type Result as ModelResult } from '../../model'
import { onlyThrough } from '../../graph/apart'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import {
  addToProgram,
  followProject,
  moveInProgram,
  plotOf,
  programOf,
  removeFromProgram,
} from './project'
import { fitCamera, pointerAt, wheelFactor, zoomAbout, type Camera } from '../camera'
import { MassView } from './MassView'
import { Program } from './Program'
import { Storeys } from './Storeys'
import { SheetView, sheetExtent, type SheetRead } from './SheetView'
import {
  DoorMenu,
  EmptyNote,
  PocketBar,
  PocketMenu,
  RoomMenu,
  type DoorChoice,
  type PocketChoice,
  type RoomChoice,
} from './menus'
import { OpeningsTools } from './OpeningsTools'
import { checkRead, linesFrom, pairKey } from './check'
import type { SheetCheck } from './CheckMarks'
import { DoorOffer } from './DoorOffer'
import { createLinks } from './linkedUndo'
import { TrayLines } from './TrayLines'
import { beginDoorDrag, doorDragTo, doorDrop, type DoorDrag } from './doorDrag'
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
import {
  keepMemory,
  keepSheet,
  keepSpec,
  localMemory,
  localSample,
  localSheet,
  localSpec,
  storedMemory,
  storedSample,
  storedSettings,
  storedSheet,
  storedSpec,
} from './store'
import { SettingsWindow, useSettingsWindow } from './Settings'
import { colourVars, tabFor } from './settings'
import { keyCommand, keyRelease } from './keys'
import {
  drawingSentence,
  measuringSentence,
  openingsSentence,
  sentenceOf,
  type Part,
} from './sentence'
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
  | { kind: 'door'; door: DoorRef; at: { x: number; y: number } }
  | { kind: 'pocket'; pocket: Pocket; at: { x: number; y: number } }
  | { kind: 'note'; note: string; at: { x: number; y: number } }

/** A door waiting on its question: where it was aimed, what it is, and the pair it would draw. */
type Offer = {
  x: number
  y: number
  type: DoorType
  width: number
  pair: [string, string]
  at: { x: number; y: number }
}

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
  const project = useProject()
  // The brief is the project's: its rooms are the program and its plot is the ground, and the sheet
  // is read from the two on the way in rather than carrying a program of its own.
  const program = useMemo(() => programOf(project.rooms), [project.rooms])
  const plot = useMemo(() => plotOf(project.plot), [project.plot])
  const [doc, setDoc] = useState<Doc>(() => ({
    // Nothing saved yet: a project with a brief of its own opens on an empty plot with its program
    // waiting, and one with no brief opens on the owner's sample, which is the sheet to learn on.
    sheet: followProject(
      localSheet() ?? (program.length ? sheetOf([]) : sampleSheet()),
      program,
      plot,
    ),
    history: newHistory(),
  }))
  const [memory, setMemory] = useState<Memory>(() => localMemory())
  // What the brief says right now, for the reads that happen after the link's store answers.
  const programRef = useRef(program)
  const plotRef = useRef(plot)
  programRef.current = program
  plotRef.current = plot
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
  // The step: Zoning edits rooms, Openings edits doors. Esc never changes it.
  const [step, setStep] = useState<'zoning' | 'openings'>('zoning')
  const [armed, setArmed] = useState<DoorType | null>(null)
  const [doorWidth, pickWidth] = useState(DOOR.door.w)
  const [doorSel, setDoorSel] = useState<DoorRef | null>(null)
  const [doorHover, setDoorHover] = useState<Hit | null>(null)
  const [doorDrag, setDoorDrag] = useState<DoorDrag | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const [drawMenuFor, setDrawMenuFor] = useState<string | null>(null)
  const [specState, setSpecState] = useState('')
  // Check: the project's edges drawn on the sheet, off until asked for.
  const [checking, setChecking] = useState(false)
  const [offer, setOffer] = useState<Offer | null>(null)
  const links = useRef(createLinks(session))
  const row = useRef<HTMLDivElement | null>(null)
  const settingsWindow = useSettingsWindow()
  // The owner's spec and sample as last saved by This is it: this browser's, then the link's store's.
  const spec = useRef<Partial<Settings> | null>(localSpec())
  const sample = useRef<Sheet | null>(localSample())
  const clipboard = useRef<{ ids: string[]; storey: number; pastes: number } | null>(null)
  const spaceHeld = useRef(false)
  const touched = useRef(false)
  const svg = useRef<SVGSVGElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const doorDragRef = useRef<DoorDrag | null>(null)
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
    void Promise.all([
      storedSheet(store),
      storedMemory(store),
      storedSettings(store),
      storedSpec(store),
      storedSample(store),
    ]).then(([stored, kept, saved, keptSpec, keptSample]) => {
      if (!live) return
      if (keptSpec) spec.current = keptSpec
      if (keptSample) sample.current = keptSample
      if (!touched.current && (stored || saved)) {
        const held = stored ?? docRef.current.sheet
        const withSettings = saved
          ? sheetOf(held.rooms, { ...held.settings, ...saved }, held.storeyCount, held.plot)
          : held
        docRef.current = {
          // A sheet out of the link's store is reconciled like any other: the project's brief wins.
          sheet: followProject(withSettings, programRef.current, plotRef.current),
          history: newHistory(),
        }
        setDoc(docRef.current)
      }
      if (kept) setMemory(kept)
      setKeeping(true)
    })
    return () => {
      live = false
    }
  }, [runtime.ready, runtime.store])

  // Requirements changed while the sheet was open: the project wins, and what it does not name is
  // kept aside on the sheet rather than thrown away.
  useEffect(() => {
    const held = docRef.current.sheet
    const next = followProject(held, program, plot)
    if (next === held) return
    docRef.current = { ...docRef.current, sheet: next }
    setDoc(docRef.current)
  }, [program, plot])

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

  const openingsOn = step === 'openings'
  const doorInHand = doorSel ? doorRead(sheet, STOREY, doorSel) : null
  const lostCount = openingsOn ? lostDoors(sheet, STOREY).length : 0

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
      // the walk is read on the sheet only in the step that makes the doors, as the mock reads it
      walk: openingsOn
        ? (() => {
            const walk = walkTest(sheet, STOREY)
            return walk
              ? { depth: walk.depth, unreached: new Set(walk.unreached.map((r) => r.id)) }
              : null
          })()
        : null,
    }
  }, [sheet, settings, STOREY, openingsOn])

  const selected = view.rooms.filter((r) => selection.includes(r.id))

  // Check reads the project's graph against the sheet: once per change, and the lines once per hover.
  const roomEdges = useMemo(
    () => project.edges.filter((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR),
    [project.edges],
  )
  const through = useMemo(
    () =>
      new Set(
        project.apart.flatMap((pair) =>
          onlyThrough(pair, project.edges) ? [pairKey(pair.a, pair.b)] : [],
        ),
      ),
    [project.apart, project.edges],
  )
  const checked = useMemo(
    () =>
      checking
        ? checkRead(
            sheet,
            STOREY,
            { edges: roomEdges, apart: project.apart, through },
            openingsOn ? 'openings' : 'zoning',
          )
        : null,
    [checking, sheet, STOREY, roomEdges, project.apart, through, openingsOn],
  )
  const focusLines = useMemo(() => {
    if (!checked) return null
    const lines: { from: string; to: string; bold: boolean }[] = []
    const tray: { from: string; to: string }[] = []
    const from = (id: string, bold: boolean) => {
      const reach = linesFrom(id, checked.waiting, sheet, STOREY)
      for (const to of reach.placed) lines.push({ from: id, to, bold })
      for (const to of reach.tray) tray.push({ from: id, to })
    }
    if (hover && view.rooms.some((r) => r.id === hover)) from(hover, false)
    for (const id of selection) if (view.rooms.some((r) => r.id === id)) from(id, true)
    return { lines, tray }
  }, [checked, hover, selection, sheet, STOREY, view.rooms])
  const trayLinked = useMemo(() => new Set(focusLines?.tray.map((line) => line.to)), [focusLines])
  const sheetCheck: SheetCheck | null =
    checked && focusLines
      ? { lines: focusLines.lines, apartDoors: checked.apartDoors, apartRooms: checked.apartRooms }
      : null
  const nameOf = (id: string): string =>
    id === EXTERIOR
      ? 'Outside'
      : (project.rooms.find((room) => room.id === id)?.name ??
        sheet.rooms.find((room) => room.id === id)?.name ??
        id)

  /** A refusal from the project's own actions is read where the sheet's refusals are read. */
  const refuse = (result: ModelResult): void => {
    if (!result.ok) setFlash(result.problems.map((trouble) => trouble.message).join(' · '))
    else setFlash(null)
  }

  const apply = (change: Change | null): boolean => {
    if (!change) return false
    if (!change.result.ok) {
      setFlash(change.result.said)
      return false
    }
    const now = docRef.current
    const next = { sheet: change.sheet, history: remember(now.history, now.sheet) }
    links.current.prune(next.history.past.length)
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

  /** Whether there was a step of the sheet's own to take back; the brief's are the project's. */
  const stepBack = (): boolean => {
    const depth = docRef.current.history.past.length
    const back = undo(docRef.current.sheet, { history: docRef.current.history })
    if (!back.result.ok) return false
    docRef.current = { sheet: back.sheet, history: back.history }
    setDoc(docRef.current)
    links.current.undone(depth)
    return true
  }

  const stepForward = (): boolean => {
    const forward = redo(docRef.current.sheet, { history: docRef.current.history })
    if (!forward.result.ok) return false
    docRef.current = { sheet: forward.sheet, history: forward.history }
    setDoc(docRef.current)
    links.current.redone(forward.history.past.length)
    return true
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
    links.current.prune(docRef.current.history.past.length)
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
    const saved = sample.current
    touched.current = true
    docRef.current = {
      sheet: saved
        ? sheetOf(saved.rooms.map(cloneRoom), now.sheet.settings, saved.storeyCount)
        : sampleSheet(now.sheet.settings),
      history: remember(now.history, now.sheet),
    }
    links.current.prune(docRef.current.history.past.length)
    setDoc(docRef.current)
    setSelection([])
    setMenu(null)
  }

  /** This is it: the settings now are the spec, and the sheet now is the sample. */
  const thisIsIt = () => {
    const now = docRef.current.sheet
    keepSpec(now, runtime.store)
    spec.current = { ...now.settings }
    sample.current = now
    setSpecState('Saved as the spec.')
  }

  /** Every setting back to the spec, each through its own action, so each is validated and held. */
  const resetSpec = () => {
    const saved = spec.current
    if (!saved) {
      setSpecState('No spec saved yet.')
      return
    }
    let held = docRef.current.sheet
    for (const [name, value] of Object.entries(saved)) {
      if (name === 'colors') {
        for (const [category, colour] of Object.entries(value as Record<string, string>))
          held = setSetting(held, { name: `color.${category}`, value: colour }).sheet
        continue
      }
      held = setSetting(held, { name, value: value as string | number }).sheet
    }
    apply({ sheet: held, result: { ok: true, said: 'Back to the spec.' } })
    setSpecState('Back to the spec.')
  }

  const clearPlan = () => {
    if (apply(sendBack(docRef.current.sheet, { ids: docRef.current.sheet.rooms.map((r) => r.id) })))
      setSelection([])
  }

  const hold = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }

  // ---------- the Openings step ----------

  /** Into Openings: whatever the hand held in Zoning is let go, and every click becomes a wall's. */
  const goStep = (to: 'zoning' | 'openings') => {
    if (to === step) return
    if (reshaping) cancelReshape()
    setMeasure(null)
    setDrawing(null)
    setMenu(null)
    setPocketPicked(null)
    setSelection([])
    setDoorSel(null)
    setDoorHover(null)
    setLit(null)
    setArmed(null)
    pickWidth(DOOR.door.w)
    doorDragRef.current = null
    setDoorDrag(null)
    setStep(to)
  }

  const armType = (type: DoorType | null) => {
    setArmed(type)
    if (type) pickWidth(DOOR[type].w)
    setDoorHover(null)
    setDoorSel(null)
  }

  /** A click on the sheet in Openings: a door nearby is taken, else the armed type lands on a wall. */
  const doorClick = (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    const [x, y] = pointAt(event.clientX, event.clientY)
    const near = doorNear(docRef.current.sheet, STOREY, x, y, 0.45)
    if (near) {
      setDoorSel({ room: near.room, id: near.id })
      setMenu(null)
      return
    }
    if (!armed) {
      setDoorSel(null)
      return
    }
    const before = docRef.current.sheet
    const pair = armed === 'open' ? null : pairAt(before, x, y)
    // A door is the drawing of an edge: between two rooms with none it asks before it is placed.
    if (pair && !joined(pair[0], pair[1])) {
      setOffer({
        x,
        y,
        type: armed,
        width: doorWidth,
        pair,
        at: inBox(event.clientX, event.clientY),
      })
      return
    }
    const change =
      armed === 'open'
        ? openWall(before, { x, y, storey: STOREY, joined })
        : addDoor(before, {
            x,
            y,
            type: armed,
            width: doorWidth,
            storey: STOREY,
            ...(pair ? { pair } : {}),
          })
    if (!apply(change)) {
      if (!change.result.ok && change.result.said === 'No wall there.') setDoorSel(null)
      return
    }
    setDoorSel(newDoors(before, change.sheet).at(-1) ?? null)
  }

  /** Whether the project holds an edge between two rooms, on any storey. */
  const joined = (a: string, b: string): boolean =>
    session
      .getState()
      .edges.some((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a))

  /**
   * The pair a door put here would draw, read once as it is placed and kept on the door: the room
   * whose wall it is on and the room across, or the outside. Nothing for a sheet not drawing the
   * project's program, or a wall no door may take, which addDoor then says why of.
   */
  const pairAt = (sheet: Sheet, x: number, y: number): [string, string] | null => {
    const hit = doorAt(x, y, doorWidth, sheet, STOREY)
    if (!hit || hit.why) return null
    const rooms = session.getState().rooms
    const known = (id: string) => id === EXTERIOR || rooms.some((room) => room.id === id)
    const across = doorAcross(hit.room, hit.pl, sheet, STOREY)?.id ?? EXTERIOR
    return known(hit.room.id) && known(across) ? [hit.room.id, across] : null
  }

  /** Yes to the door's question: the edge through the project's connect, and the door that draws it. */
  const acceptOffer = () => {
    const held = offer
    setOffer(null)
    if (!held) return
    const kind: EdgeKind = held.type === 'opening' ? 'open' : 'door'
    const made = session.actions.connect({ a: held.pair[0], b: held.pair[1], kind })
    if (!made.ok) {
      refuse(made)
      return
    }
    const before = docRef.current.sheet
    const change = addDoor(before, {
      x: held.x,
      y: held.y,
      type: held.type,
      width: held.width,
      storey: STOREY,
      pair: held.pair,
    })
    if (!apply(change)) {
      session.actions.disconnect(made.value)
      return
    }
    links.current.add({
      depth: docRef.current.history.past.length,
      edge: made.value,
      a: held.pair[0],
      b: held.pair[1],
      kind,
    })
    setDoorSel(newDoors(before, change.sheet).at(-1) ?? null)
  }

  /** One door action, the selected door kept in hand wherever it ended up. */
  const onDoor = (make: (ref: DoorRef) => Change): void => {
    if (!doorSel) return
    const held = doorSel
    const change = make(held)
    if (!apply(change)) return
    const owner = change.sheet.rooms.find((r) => doorsOf(r).some((d) => d.id === held.id))
    setDoorSel(owner ? { room: owner.id, id: held.id } : null)
  }

  const doorChoice = (choice: DoorChoice) => {
    const ref = menu?.kind === 'door' ? menu.door : doorSel
    setMenu(null)
    if (!ref) return
    const at = { room: ref.room, door: ref.id }
    if (choice.kind === 'flip') apply(flipDoor(docRef.current.sheet, at))
    if (choice.kind === 'hinge') apply(hingeDoor(docRef.current.sheet, at))
    if (choice.kind === 'remove' && apply(removeDoor(docRef.current.sheet, at))) setDoorSel(null)
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
    if (!doorDrag) return
    const onMove = (event: PointerEvent) => {
      const held = doorDragRef.current
      if (!held) return
      const next = doorDragTo(
        held,
        pointAt(event.clientX, event.clientY),
        docRef.current.sheet,
        STOREY,
      )
      doorDragRef.current = next
      setDoorDrag(next)
    }
    const onUp = () => {
      const held = doorDragRef.current
      doorDragRef.current = null
      setDoorDrag(null)
      if (!held) return
      const change = doorDrop(held, docRef.current.sheet, STOREY)
      if (change && apply(change)) {
        const owner = change.sheet.rooms.find((r) => doorsOf(r).some((d) => d.id === held.id))
        setDoorSel(owner ? { room: owner.id, id: held.id } : null)
      }
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
  }, [doorDrag !== null])

  useEffect(() => {
    if (!pan) return
    const onMove = (event: PointerEvent) => {
      const rect = svg.current?.getBoundingClientRect()
      if (!rect) return
      const metres =
        sheetExtent(docRef.current.sheet.plot).width / pan.camera.scale / Math.max(1, rect.width)
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
      if (openingsOn) {
        event.stopPropagation()
        doorClick(event)
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
      if (drawing || room.fixed || openingsOn) return
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
      if (openingsOn) {
        doorClick(event)
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
      if (openingsOn) return
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
          note: outsideBuildable(
            { x: at[0], y: at[1], w: 0, h: 0 } as unknown as Room,
            sheet.plot.build,
          )
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
      if (openingsOn) {
        doorClick(event)
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
          sheetExtent(sheet.plot),
          was,
          pointAt(event.clientX, event.clientY),
          wheelFactor(event.nativeEvent),
        ),
      )
    },
    onPointerMove: (event: ReactPointerEvent) => {
      if (openingsOn && !doorDrag) {
        const [x, y] = pointAt(event.clientX, event.clientY)
        setDoorHover(armed && armed !== 'open' ? doorAt(x, y, doorWidth, sheet, STOREY) : null)
        // Check's lines follow the hand in this step too.
        const over = event.target instanceof Element ? event.target.closest('[data-room]') : null
        const id = over?.getAttribute('data-room') ?? null
        if (checking && hover !== id) setHover(id)
        return
      }
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
        dragging: !!dragRef.current || !!doorDragRef.current,
        openings: openingsOn,
        doorSelected: !!doorInHand,
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
          // The sheet's own steps come back first; with none left the key is the project's, so a
          // change to the brief made here is taken back by the same key rather than by two undos.
          if (stepBack()) event.stopImmediatePropagation()
          return
        case 'redo':
          event.preventDefault()
          if (stepForward()) event.stopImmediatePropagation()
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
        case 'step':
          goStep(command.to === 'other' ? (openingsOn ? 'zoning' : 'openings') : command.to)
          return
        case 'door-swing':
          onDoor((ref) => flipDoor(docRef.current.sheet, { room: ref.room, door: ref.id }))
          return
        case 'door-hinge':
          onDoor((ref) => hingeDoor(docRef.current.sheet, { room: ref.room, door: ref.id }))
          return
        case 'door-hinge-or-swing':
          event.preventDefault()
          if (doorInHand?.hinges)
            onDoor((ref) => hingeDoor(docRef.current.sheet, { room: ref.room, door: ref.id }))
          else if (doorInHand?.swings)
            onDoor((ref) => flipDoor(docRef.current.sheet, { room: ref.room, door: ref.id }))
          return
        case 'door-slide':
          event.preventDefault()
          onDoor((ref) =>
            slideDoor(docRef.current.sheet, {
              room: ref.room,
              door: ref.id,
              step: command.step,
            }),
          )
          return
        case 'door-remove':
          event.preventDefault()
          onDoor((ref) => removeDoor(docRef.current.sheet, { room: ref.room, door: ref.id }))
          return
        case 'escape':
          // Esc never leaves the step: it drops the door in hand, then the type armed
          if (openingsOn) {
            if (offer) setOffer(null)
            else if (doorSel) setDoorSel(null)
            else if (armed) armType(null)
            else if (menu) setMenu(null)
            return
          }
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
    // Caught on the way down, so the sheet answers Ctrl+Z before the shell's project undo does.
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onUp)
    }
  })

  // ---------- the sentence ----------

  const parts: Part[] = measure
    ? measuringSentence(measure)
    : openingsOn
      ? openingsSentence(view.read, {
          armed,
          width: doorWidth,
          hover: doorHover ? { why: doorHover.why, snapped: doorHover.pl.snapped ?? null } : null,
          door: doorInHand,
          sliding: !!doorDrag?.moved,
          lost: lostCount,
        })
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

  if (checked) {
    const waiting = checked.waiting.length
    const said = `${waiting} connection${waiting === 1 ? '' : 's'} not ${openingsOn ? 'met' : 'ready'}`
    parts.push({
      lead: 'Check',
      text: checked.broken ? `${said}, ${checked.broken} keep-apart broken` : said,
      bad: waiting > 0 || checked.broken > 0,
    })
  }

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
    <div className={`sheet-stage${openingsOn ? ' openings' : ''}`} style={colourVars(settings)}>
      <p className="head-line">
        {openingsOn ? (
          <>
            Openings on the ground floor. Rooms fade to outlines and every click is about a wall or
            a door. Arm a type in the bar and click a wall: the door lands a jamb from the corner or
            at the middle. Click near a door to select it and drag it to slide it along its wall; a
            metre off the wall it comes free for another. A shared wall takes one door for both
            rooms, a wall on the boundary takes none, and Open wall takes out only the stretch two
            rooms share. Click a room in the list to light its walls.
          </>
        ) : (
          <>
            Zoning by hand on the fresh brief&rsquo;s corner plot, 20 × 25 m, service street south,
            side street east, north turned 25°. Ground floor. Drag a room from the program and drop
            it where you want it, or draw it; R turns it; a room dropped on another waits, tinted,
            or pushes the lower one; right-click it to settle the overlap, or right-click an empty
            space walled in by rooms to give it away, make it a court, or make it a corridor.
          </>
        )}
      </p>
      <div className="tools">
        <div className="seg steps">
          {(['zoning', 'openings'] as const).map((to) => (
            <button
              key={to}
              type="button"
              className={step === to ? 'on' : ''}
              title={to === 'zoning' ? 'Z' : 'O'}
              onClick={() => goStep(to)}
            >
              {to === 'zoning' ? 'Zoning' : 'Openings'}
            </button>
          ))}
        </div>
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
          <button
            type="button"
            className={checking ? 'on' : ''}
            aria-pressed={checking}
            title="Show the connections: lines from the room under the hand and the room selected"
            onClick={() => setChecking((was) => !was)}
          >
            Check
          </button>
          <button
            type="button"
            className={settingsWindow.open ? 'on' : ''}
            title="Every setting of the sheet"
            onClick={() => {
              if (!settingsWindow.open)
                settingsWindow.setTab(
                  tabFor(drawing || reshaping ? 'drawing' : 'zoning', settingsWindow.tab),
                )
              settingsWindow.setOpen(!settingsWindow.open)
            }}
          >
            ⚙ Settings
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
          <button
            type="button"
            className="primary"
            onClick={thisIsIt}
            title="The settings now are the spec; the sheet now is the sample"
          >
            This is it
          </button>
          <span className="state">{specState}</span>
        </span>
        {openingsOn && (
          <OpeningsTools
            armed={armed}
            width={doorWidth}
            door={doorInHand}
            onArm={armType}
            onWidth={pickWidth}
            onSwing={() => doorChoice({ kind: 'flip' })}
            onHinge={() => doorChoice({ kind: 'hinge' })}
            onWider={(by) =>
              onDoor((ref) =>
                setDoorWidth(docRef.current.sheet, {
                  room: ref.room,
                  door: ref.id,
                  w: (doorInHand?.width ?? DOOR.door.w) + by,
                }),
              )
            }
            onRemove={() => doorChoice({ kind: 'remove' })}
            onReattach={() =>
              onDoor((ref) =>
                reattachDoor(docRef.current.sheet, {
                  room: ref.room,
                  door: ref.id,
                  storey: STOREY,
                }),
              )
            }
          />
        )}
        <span className="grp room-tools">
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
      {settingsWindow.open && (
        <SettingsWindow
          settings={settings}
          tab={settingsWindow.tab}
          onTab={settingsWindow.setTab}
          onChange={(name, value) => apply(setSetting(docRef.current.sheet, { name, value }))}
          onStandardColours={() => {
            let held = docRef.current.sheet
            for (const [category, colour] of Object.entries(DEFAULTS.colors))
              held = setSetting(held, { name: `color.${category}`, value: colour }).sheet
            apply({ sheet: held, result: { ok: true, said: 'The standard colours are back.' } })
          }}
          onResetSpec={resetSpec}
          onClose={() => settingsWindow.setOpen(false)}
          specState={specState}
        />
      )}
      <div className="body-row" ref={row}>
        <Program
          sheet={sheet}
          selection={selection}
          linked={trayLinked}
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
          openings={openingsOn}
          lit={lit}
          onLight={(room) => setLit((was) => (was === room.id ? null : room.id))}
          onRemove={(room) => {
            // A room the brief names goes out of the brief as well as off the sheet; one the sheet
            // keeps aside is its own, and only the sheet has it to lose.
            if (!room.aside) refuse(removeFromProgram(session, sheet.rooms, room.id))
            apply(removeRoom(docRef.current.sheet, { id: room.id }))
          }}
          onReorder={(id, before) => refuse(moveInProgram(session, sheet.rooms, id, before))}
          onDrawMenu={setDrawMenuFor}
          onDraw={(id, shape) => startDraw(id, shape)}
          onAdd={(kind, name, area) =>
            refuse(addToProgram(session, sheet.rooms, { kind, name, target: area }))
          }
        />
        <div className="middle">
          <div className="sheet-cell">
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
                lit={lit}
                check={sheetCheck}
                openings={
                  openingsOn
                    ? {
                        selected: doorSel,
                        armed: armed && armed !== 'open' ? { type: armed, w: doorWidth } : null,
                        armedAt: doorHover,
                        draggedTo: doorDrag?.hit ?? null,
                        dragged: doorDrag ? { type: doorDrag.type, w: doorDrag.w } : null,
                        onDoorDown: (room, door, event) => {
                          if (event.button !== 0) return
                          event.preventDefault()
                          event.stopPropagation()
                          setDoorSel({ room: room.id, id: door.id })
                          setMenu(null)
                          const began = beginDoorDrag(
                            docRef.current.sheet,
                            STOREY,
                            { room: room.id, id: door.id },
                            pointAt(event.clientX, event.clientY),
                          )
                          doorDragRef.current = began
                          setDoorDrag(began)
                        },
                        onDoorMenu: (room, door, event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setDoorSel({ room: room.id, id: door.id })
                          setSelection([])
                          setMenu({
                            kind: 'door',
                            door: { room: room.id, id: door.id },
                            at: inBox(event.clientX, event.clientY),
                          })
                        },
                      }
                    : null
                }
                panning={!!pan}
                camera={camera}
                svgRef={(element) => {
                  svg.current = element
                }}
                on={on}
              />
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
                  pastSetback={selected.some((r) => outsideBuildable(r, sheet.plot.build))}
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
              {menu?.kind === 'door' && doorInHand && (
                <DoorMenu at={menu.at} door={doorInHand} onChoose={doorChoice} />
              )}
              {menu?.kind === 'note' && <EmptyNote at={menu.at} note={menu.note} />}
              {offer && (
                <DoorOffer
                  at={offer.at}
                  names={[nameOf(offer.pair[0]), nameOf(offer.pair[1])]}
                  onAccept={acceptOffer}
                  onDecline={() => setOffer(null)}
                />
              )}
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
                pastSetback={selected.some((r) => outsideBuildable(r, sheet.plot.build))}
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
        {focusLines && (
          <TrayLines
            lines={focusLines.tray}
            rooms={view.rooms}
            svg={svg.current}
            box={row.current}
            camera={camera}
            nameOf={nameOf}
          />
        )}
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
