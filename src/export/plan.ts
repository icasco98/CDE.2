import { boundingBox, outlineOf, type Footprint, type Point, type Rect } from '../geometry'
import { occupiedStoreys, type EdgeKind, type Project, type Room } from '../model'
import { edgeMarks, type DoorMark, type Standing } from '../views/zoning/doors'

/** The opening a door is drawn as, in metres; a room flows into the next through twice that. */
const DOOR_M = 0.9
const OPEN_M = 1.8

/** Both drawings cut the same opening, so a plan and a DXF of it read alike. */
export function openingMetres(kind: EdgeKind): number {
  return kind === 'open' ? OPEN_M : DOOR_M
}

/** A room standing on the storey being drawn, with the room for its name and the shape it stands as. */
export type Placed = Standing & { readonly room: Room; readonly footprint: Footprint }

export function standingOn(rooms: readonly Room[], storey: number): readonly Placed[] {
  const placed: Placed[] = []
  for (const room of rooms) {
    const footprint = room.footprint
    if (!footprint || !occupiedStoreys(room).includes(storey)) continue
    placed.push({ id: room.id, outline: outlineOf(footprint), room, footprint })
  }
  return placed
}

/** A door is the drawing of an edge, so only the edges of this storey put one on the paper. */
export function doorsOn(
  project: Project,
  storey: number,
  standing: readonly Standing[],
): readonly DoorMark[] {
  return edgeMarks(
    standing,
    project.edges.filter((edge) => edge.storey === storey),
    project.plot,
  ).doors
}

/** Everything a drawing of the project has to hold: the plot and every footprint on any storey. */
export function contentBounds(project: Project): Rect {
  const corners: Point[] = [...project.plot.polygon]
  for (const room of project.rooms) if (room.footprint) corners.push(...outlineOf(room.footprint))
  const fallback: readonly Point[] = [
    [0, 0],
    [20, 25],
  ]
  return boundingBox(corners.length > 0 ? corners : fallback)
}

/** An area or a length as both drawings letter it: one decimal, a trailing zero dropped. */
export function round1(value: number): string {
  return String(Math.round(value * 10) / 10)
}
