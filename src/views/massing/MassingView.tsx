import { useEffect, useMemo, useRef } from 'react'
import { area, boundingBox, outlineOf, type Point } from '../../geometry'
import { envelopeOf, facesOf, roomsInOrder, type Point3 } from '../../massing'
import { occupiedStoreys, type Room } from '../../model'
import { pointerAt, wheelFactor } from '../camera'
import { storeyLabel } from '../requirements/format'
import { Storeys } from '../zoning/parts'
import { centreOf, groundOf, northOf, planAzimuth } from './frame'
import {
  Ground,
  Heights,
  NorthMark,
  Numbers,
  Prism,
  ScaleReference,
  TurnHandle,
  Views,
} from './parts'
import type { MassingViewProps } from './types'
import { useEditing } from './useEditing'
import { useOrbit } from './useOrbit'
import './massing.css'

export function MassingView(props: MassingViewProps) {
  const { rooms, storeys, heights, plot, sizes, storey, selected } = props
  const { onSelect, onStorey, onHeight, onPlace, onRefuse } = props
  const svgRef = useRef<SVGSVGElement>(null)

  const faces = useMemo(
    () => rooms.flatMap((room) => facesOf(room, storeys, heights)),
    [rooms, storeys, heights],
  )
  const corners = useMemo(
    () => [...groundOf(plot.polygon), ...faces.flatMap((face) => face.corners)],
    [plot.polygon, faces],
  )
  /** The roof of the room that is picked: the turn handle stands on it, and a turn is about it. */
  const roof = useMemo(
    () => faces.find((face) => face.roomId === selected && face.kind === 'top'),
    [faces, selected],
  )
  /**
   * What a turn happens about: the room that is picked, or the whole placed mass when none is,
   * so the building revolves about itself rather than swinging round the corner of the sheet.
   */
  const pivot = useMemo((): Point3 => {
    const standing = faces.filter((face) => face.roomId === selected)
    const about = standing.length > 0 ? standing : faces
    return centreOf(about.length > 0 ? about.flatMap((face) => face.corners) : corners)
  }, [faces, selected, corners])

  const orbit = useOrbit({ corners, pivot, sheet: svgRef, onPress: () => onSelect(null) })
  const editing = useEditing({
    rooms,
    sizes,
    plot,
    storeys,
    heights,
    view: orbit.view,
    sheet: svgRef,
    onPlace,
    onSelect,
    onRefuse,
    onHold: orbit.hold,
  })
  const groups = useMemo(() => roomsInOrder(faces, orbit.view), [faces, orbit.view])

  const plotArea = useMemo(() => area(plot.polygon), [plot.polygon])
  const envelope = useMemo(
    () => envelopeOf({ rooms, storeys, heights, plotArea }),
    [rooms, storeys, heights, plotArea],
  )
  const byId = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const unplaced = useMemo(() => rooms.filter((room) => room.footprint === undefined), [rooms])

  /** Both marks lie on the ground clear of the plot: the bar north of it, north itself east of it. */
  const bounds = useMemo(() => boundingBox(plot.polygon), [plot.polygon])
  const scaleAt: Point = [bounds.left, bounds.top - 2.5]
  const northAt: Point = [bounds.left + bounds.width + 2.5, bounds.top + 2.5]
  const southward = useMemo((): Point => {
    const way = northOf(plot.north)
    return [-way[0], -way[1]]
  }, [plot.north])

  const live = useRef({ zoom: orbit.zoom })
  live.current = { zoom: orbit.zoom }

  /** Taken by hand rather than through React, whose own wheel listener cannot refuse the page its scroll. */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      live.current.zoom(pointerAt(svg, event.clientX, event.clientY), wheelFactor(event))
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [])

  return (
    <div className="massing">
      <div className="massing-bar">
        <Storeys storeys={storeys} storey={storey} onStorey={onStorey} />
        <Views
          view={orbit.view}
          planAzimuth={planAzimuth(plot.north)}
          onGoTo={orbit.goTo}
          onFit={orbit.fit}
        />
      </div>
      <div className="massing-body">
        <svg
          ref={svgRef}
          className="massing-sheet"
          viewBox={orbit.viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="application"
          aria-label="Massing"
          onPointerDownCapture={orbit.track}
          onPointerDown={orbit.take}
        >
          <Ground plot={plot} view={orbit.view} />
          <NorthMark at={northAt} north={plot.north} view={orbit.view} />
          <ScaleReference at={scaleAt} view={orbit.view} />
          {groups.map((group) => {
            const room = byId.get(group.roomId)
            if (!room?.footprint) return null
            return (
              <Prism
                key={group.roomId}
                roomId={group.roomId}
                name={room.name}
                floorArea={area(outlineOf(room.footprint))}
                faces={group.faces}
                selected={group.roomId === selected}
                lit={occupiedStoreys(room).includes(storey)}
                view={orbit.view}
                southward={southward}
                onSelect={(event) => {
                  event.stopPropagation()
                  onSelect(group.roomId)
                }}
                onGrabTop={(event) => editing.grabTop(event, group.roomId)}
              />
            )
          })}
          {roof && selected !== null && byId.get(selected)?.pinned === false && (
            <TurnHandle
              at={centreOf(roof.corners)}
              view={orbit.view}
              onGrab={(event) => editing.grabTurn(event, selected)}
            />
          )}
        </svg>
        <aside className="massing-side">
          <Heights heights={heights} total={envelope.buildingHeight} onHeight={onHeight} />
          <Numbers envelope={envelope} plotArea={plotArea} />
          <p className="massing-unplaced">{unplacedNote(unplaced)}</p>
        </aside>
      </div>
    </div>
  )
}

function unplacedNote(unplaced: readonly Room[]): string {
  if (unplaced.length === 0) return 'Every room is placed.'
  const byStorey = new Map<number, number>()
  for (const room of unplaced)
    for (const storey of occupiedStoreys(room))
      byStorey.set(storey, (byStorey.get(storey) ?? 0) + 1)
  const where = [...byStorey.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([storey, count]) => `${count} on ${storeyLabel(storey)}`)
    .join(', ')
  return `${unplaced.length} room${unplaced.length === 1 ? '' : 's'} not placed and not drawn: ${where}.`
}
