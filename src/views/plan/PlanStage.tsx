import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { browserStorage } from '../../app/storage'
import { useProject } from '../../app/useProject'
import { area } from '../../geometry'
import { roomTypes } from '../../rulebook'
import { MassingStage } from '../massing/MassingStage'
import { sizesOf, type RoomSizes } from '../zoning/defaults'
import { ZoningStage } from '../zoning/ZoningStage'
import { MASSING_ONLY, readSplit, SHEET_ONLY, splitAt, writeSplit } from './split'
import './plan.css'

/**
 * The plan in one tab: the sheet on the left and the same house stood up on the right, both over
 * the one store, both showing the storey this tab holds. The width of the halves and the storey
 * are view state; nothing here is written to the project.
 */
export function PlanStage() {
  const project = useProject()
  const storage = useMemo(() => browserStorage(), [])
  const [remembered, setRemembered] = useState(() => readSplit(storage))
  const [split, setSplit] = useState(remembered)
  const [storey, setStorey] = useState(0)
  const [dragging, setDragging] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const live = useRef(split)
  live.current = split

  const plotArea = area(project.plot.polygon)
  const sizes = useMemo<ReadonlyMap<string, RoomSizes>>(
    () => new Map(roomTypes.map((type) => [type.id, sizesOf(type, plotArea)])),
    [plotArea],
  )

  /** A storey removed under the tab leaves the top one showing rather than an empty sheet. */
  const inView = Math.min(storey, Math.max(0, project.storeys - 1))

  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent): void => {
      const box = splitRef.current?.getBoundingClientRect()
      if (!box) return
      setSplit(splitAt(box, event.clientX))
    }
    const up = (): void => {
      setDragging(false)
      // What the hand set is what Both goes back to, this sitting and the next.
      setRemembered(live.current)
      writeSplit(storage, live.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, storage])

  const sheetShown = split > MASSING_ONLY
  const massingShown = split < SHEET_ONLY

  return (
    <div className="plan">
      <div className="plan-bar" role="group" aria-label="What the tab shows">
        <button type="button" aria-pressed={!massingShown} onClick={() => setSplit(SHEET_ONLY)}>
          Sheet
        </button>
        <button
          type="button"
          aria-pressed={sheetShown && massingShown}
          onClick={() => setSplit(remembered)}
        >
          Both
        </button>
        <button type="button" aria-pressed={!sheetShown} onClick={() => setSplit(MASSING_ONLY)}>
          Massing
        </button>
      </div>
      <div
        className="plan-split"
        ref={splitRef}
        style={{ '--sheet-share': `${split}%` } as CSSProperties}
      >
        {sheetShown && (
          <div className="plan-half plan-sheet">
            <ZoningStage storey={inView} onStorey={setStorey} sizes={sizes} />
          </div>
        )}
        {sheetShown && massingShown && (
          <div
            className={dragging ? 'plan-handle plan-handle-held' : 'plan-handle'}
            role="separator"
            aria-orientation="vertical"
            aria-label="Width of the sheet"
            title="Drag to give one half more of the tab"
            onPointerDown={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
          />
        )}
        {massingShown && (
          <div className="plan-half plan-massing">
            <MassingStage storey={inView} onStorey={setStorey} sizes={sizes} />
          </div>
        )}
      </div>
    </div>
  )
}
