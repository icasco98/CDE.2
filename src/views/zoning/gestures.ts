import {
  GRID_M,
  anchorPointOf,
  boundingBox,
  carveFootprint,
  footprintsOverlap,
  frameOf,
  limitResize,
  nearestNeighbourPoint,
  outlineOf,
  outwardWalls,
  rectangleToPolygon,
  sharedArea,
  resizeFromAnchor,
  sheetToLocalPoint,
  shiftFootprintInside,
  snapToGrid,
  translateFootprint,
  wallSnapOffset,
  type Footprint,
  type Handle,
  type Point,
  type Polygon,
} from '../../geometry'

/** How far a corner or a wall reaches for a neighbour to lie against, in metres. */
const SNAP_M = 0.5

/** Less common ground than this counts as two rooms brought together, not one lying over the other, in m². */
const OVERLAP_AREA_M2 = 1e-6

/** Rotation lands on whole steps of this many degrees unless the hand asks for any angle. */
const ANGLE_STEP = 15

/** A room already standing on the storey, as a gesture reads it. */
export type Neighbour = {
  readonly id: string
  readonly name: string
  readonly footprint: Footprint
  readonly pinned: boolean
}

/**
 * The storey a gesture happens on: every other room, their outlines held once because they do not
 * move while one room is dragged, and the boundary rooms are kept inside, empty where the plot
 * does not bind.
 */
export type Sheet = {
  readonly others: readonly Neighbour[]
  readonly outlines: readonly Polygon[]
  readonly boundary: Polygon
}

export type Attempt<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string }

/** A room and the footprint a carve leaves it with. */
type Carved = { readonly id: string; readonly footprint: Footprint }

export function sheetOf(others: readonly Neighbour[], boundary: Polygon): Sheet {
  return { others, outlines: others.map((other) => outlineOf(other.footprint)), boundary }
}

function settled<T>(value: T): Attempt<T> {
  return { ok: true, value }
}

function refuse(reason: string): Attempt<never> {
  return { ok: false, reason }
}

function opposite(handle: Handle): Handle {
  return handle === 1 ? -1 : handle === -1 ? 1 : 0
}

export function normaliseAngle(degrees: number): number {
  const turned = degrees % 360
  return turned < 0 ? turned + 360 : turned
}

/** The angle from `centre` up to `at`, clockwise on the sheet, read as a footprint's own rotation. */
export function angleTo(centre: Point, at: Point): number {
  return normaliseAngle((Math.atan2(at[0] - centre[0], centre[1] - at[1]) * 180) / Math.PI)
}

export function snapAngle(degrees: number, free: boolean): number {
  return normaliseAngle(free ? degrees : Math.round(degrees / ANGLE_STEP) * ANGLE_STEP)
}

/** The whole outline pushed until its north-west corner lands on a grid line. */
function toGrid(footprint: Footprint): Footprint {
  const bounds = boundingBox(outlineOf(footprint))
  return translateFootprint(footprint, [
    snapToGrid(bounds.left) - bounds.left,
    snapToGrid(bounds.top) - bounds.top,
  ])
}

/** A corner on a neighbour's corner or wall if one is within reach, else a wall brought flush with a parallel one. */
function toNeighbours(footprint: Footprint, sheet: Sheet): Footprint {
  const outline = outlineOf(footprint)
  let corner: Point | null = null
  let cornerReach = SNAP_M
  for (const at of outline) {
    const landing = nearestNeighbourPoint(at, sheet.outlines, SNAP_M)
    if (!landing) continue
    const distance = Math.hypot(landing[0] - at[0], landing[1] - at[1])
    if (distance < cornerReach) {
      cornerReach = distance
      corner = [landing[0] - at[0], landing[1] - at[1]]
    }
  }
  if (corner) return translateFootprint(footprint, corner)
  let push: Point | null = null
  let pushReach = SNAP_M
  for (const wall of outwardWalls(outline)) {
    const gap = wallSnapOffset(wall.from, wall.to, wall.normal, sheet.outlines, SNAP_M)
    if (gap !== 0 && Math.abs(gap) < pushReach) {
      pushReach = Math.abs(gap)
      push = [gap * wall.normal[0], gap * wall.normal[1]]
    }
  }
  return push ? translateFootprint(footprint, push) : footprint
}

function insideBoundary(footprint: Footprint, boundary: Polygon): Footprint {
  if (boundary.length < 3) return footprint
  return translateFootprint(footprint, shiftFootprintInside(footprint, boundary))
}

/** The cheap test rejects the many, and only a maybe is settled against the real common area. */
function overlaps(a: Footprint, b: Footprint): boolean {
  if (!footprintsOverlap(a, b)) return false
  try {
    return sharedArea(a, b) > OVERLAP_AREA_M2
  } catch {
    // The booleans cannot always close a ring on the shapes repeated carving leaves; a pair they
    // cannot resolve is read as overlapping, so the gesture is refused rather than let through.
    return true
  }
}

function clash(footprint: Footprint, sheet: Sheet): Neighbour | undefined {
  return sheet.others.find((other) => overlaps(footprint, other.footprint))
}

/** Held inside the plot, then refused where it would lie over another room; a cutter is let through. */
function land(footprint: Footprint, sheet: Sheet, carving: boolean): Attempt<Footprint> {
  const held = insideBoundary(footprint, sheet.boundary)
  if (carving) return settled(held)
  const hit = clash(held, sheet)
  return hit ? refuse(`that would overlap ${hit.name}`) : settled(held)
}

/** A cutter is put where the hand puts it: it lines up on the grid but never against a neighbour, which is the wall it is there to cut. */
export function moveFootprint(
  from: Footprint,
  delta: Point,
  sheet: Sheet,
  carving = false,
): Attempt<Footprint> {
  const moved = toGrid(translateFootprint(from, delta))
  return land(carving ? moved : toNeighbours(moved, sheet), sheet, carving)
}

export function rotateFootprint(
  from: Footprint,
  degrees: number,
  sheet: Sheet,
  carving = false,
): Attempt<Footprint> {
  return land({ polygon: from.polygon, rotation: normaliseAngle(degrees) }, sheet, carving)
}

/**
 * The footprint pulled by the handle at `(sx, sy)` to the pointer, with the opposite side held
 * where it is. The pointer is read in the footprint's own frame, so a turned room resizes along
 * its own axes.
 */
export function resizeFootprint(
  from: Footprint,
  sx: Handle,
  sy: Handle,
  at: Point,
  sheet: Sheet,
): Attempt<Footprint> {
  const bounds = boundingBox(from.polygon)
  const frame = frameOf(from)
  const local = sheetToLocalPoint(at, frame)
  const width =
    sx === 0
      ? bounds.width
      : Math.max(GRID_M, snapToGrid(Math.abs(local[0] - (frame.cx - (sx * bounds.width) / 2))))
  const depth =
    sy === 0
      ? bounds.depth
      : Math.max(GRID_M, snapToGrid(Math.abs(local[1] - (frame.cy - (sy * bounds.depth) / 2))))
  const held = [opposite(sx), opposite(sy)] as const
  const anchor = anchorPointOf(from, held[0], held[1])
  const to = resizeFromAnchor(from, anchor, held[0], held[1], width, depth)
  const limited = sheet.boundary.length >= 3 ? limitResize(from, to, sheet.boundary) : to
  const hit = clash(limited, sheet)
  return hit ? refuse(`that would overlap ${hit.name}`) : settled(limited)
}

/** A rectangle of the given size, centred on the drop point and snapped to the grid. */
export function dropFootprint(
  at: Point,
  size: { readonly width: number; readonly depth: number },
  sheet: Sheet,
  carving = false,
): Attempt<Footprint> {
  const polygon = rectangleToPolygon({
    left: snapToGrid(at[0] - size.width / 2),
    top: snapToGrid(at[1] - size.depth / 2),
    width: size.width,
    depth: size.depth,
  })
  return land({ polygon, rotation: 0 }, sheet, carving)
}

/** Every room the cutter lies over, with the cutter taken out of it. */
export function carveWith(cutter: Footprint, sheet: Sheet): Attempt<readonly Carved[]> {
  const carved: Carved[] = []
  for (const other of sheet.others) {
    if (!overlaps(cutter, other.footprint)) continue
    if (other.pinned) return refuse(`${other.name} is pinned`)
    const result = carveFootprint(other.footprint, [cutter])
    if (result.split) return refuse(`${other.name} would be cut in two`)
    if (result.footprint.polygon.length < 3) return refuse(`${other.name} would be cut away`)
    // Nothing came off the outline although the two really do overlap: the cutter stands wholly
    // inside the room, and a room is a ring of wall, not a room with a hole in the middle of it.
    if (!result.carved) return refuse(`${other.name} would be left with a hole in it`)
    carved.push({ id: other.id, footprint: result.footprint })
  }
  return settled(carved)
}
