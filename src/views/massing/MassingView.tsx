import { useMemo } from 'react'
import { area, boundingBox, outlineOf, type Point } from '../../geometry'
import { envelopeOf, facesOf, roomsInOrder } from '../../massing'
import { occupiedStoreys, type Room } from '../../model'
import { storeyLabel } from '../requirements/format'
import { groundOf, northOf, viewBoxOf } from './frame'
import { Ground, Heights, NorthMark, Numbers, Prism, ScaleReference, Views } from './parts'
import type { MassingViewProps } from './types'
import { useOrbit } from './useOrbit'
import './massing.css'

export function MassingView(props: MassingViewProps) {
  const { rooms, storeys, heights, plot, selected, onSelect, onHeight } = props

  const faces = useMemo(
    () => rooms.flatMap((room) => facesOf(room, storeys, heights)),
    [rooms, storeys, heights],
  )
  const corners = useMemo(
    () => [...groundOf(plot.polygon), ...faces.flatMap((face) => face.corners)],
    [plot.polygon, faces],
  )
  const orbit = useOrbit(corners, () => onSelect(null))
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

  return (
    <div className="massing">
      <div className="massing-bar">
        <Views azimuth={orbit.azimuth} onPreset={orbit.goTo} onFit={orbit.fit} />
      </div>
      <div className="massing-body">
        <svg
          className="massing-sheet"
          viewBox={viewBoxOf(orbit.extent)}
          preserveAspectRatio="xMidYMid meet"
          role="application"
          aria-label="Massing"
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
                view={orbit.view}
                southward={southward}
                onSelect={(event) => {
                  event.stopPropagation()
                  onSelect(group.roomId)
                }}
              />
            )
          })}
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
