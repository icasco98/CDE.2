import {
  GRID_M,
  anchorPointOf,
  area,
  boundingBox,
  carveFootprint,
  centroid,
  differencePolygons,
  footprintsOverlap,
  frameOf,
  limitResize,
  nearestNeighbourPoint,
  outlineOf,
  outwardWalls,
  placeInFrame,
  rectangleToPolygon,
  sharedArea,
  sharedWalls,
  resizeFromAnchor,
  sheetToLocalPoint,
  sheetToLocalPolygon,
  shiftFootprintInside,
  snapToGrid,
  translateFootprint,
  unionPolygons,
  wallDirection,
  wallLength,
  wallSnapOffset,
  WALL_TOLERANCE,
  type Footprint,
  type Handle,
  type Piece,
  type Point,
  type Polygon,
  type SharedWall,
} from '../../geometry'
import { underMinimum, type RoomSizes } from './defaults'
import type { Placement } from './types'

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
  /** What its kind admits, so a gesture can refuse to leave it under the smallest room allowed. */
  readonly sizes: RoomSizes
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

/** Where a room comes to rest when it is let go, and every room it came to lie over. */
export type Landing = {
  readonly footprint: Footprint
  readonly over: readonly Neighbour[]
}

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

/** Held inside the plot, then refused where it would lie over another room. */
function land(footprint: Footprint, sheet: Sheet): Attempt<Footprint> {
  const held = insideBoundary(footprint, sheet.boundary)
  const hit = clash(held, sheet)
  return hit ? refuse(`that would overlap ${hit.name}`) : settled(held)
}

/**
 * Where a room stays when the hand lets it go: held inside the plot, with every room it has come
 * to lie over. An empty list is a clean landing; anything else is a drop the person is asked
 * about, and the footprint is left where the hand put it, over the walls it would cut.
 */
export function landOver(footprint: Footprint, sheet: Sheet): Landing {
  const held = insideBoundary(footprint, sheet.boundary)
  return { footprint: held, over: sheet.others.filter((other) => overlaps(held, other.footprint)) }
}

/** Rooms are solid: a move slides along its neighbours and stops rather than lie over one. */
export function moveFootprint(from: Footprint, delta: Point, sheet: Sheet): Attempt<Footprint> {
  return land(toNeighbours(toGrid(translateFootprint(from, delta)), sheet), sheet)
}

/** The same move with nothing to slide against: where the hand really let the room go. */
export function movedTo(from: Footprint, delta: Point): Footprint {
  return toGrid(translateFootprint(from, delta))
}

export function rotateFootprint(
  from: Footprint,
  degrees: number,
  sheet: Sheet,
): Attempt<Footprint> {
  return land({ polygon: from.polygon, rotation: normaliseAngle(degrees) }, sheet)
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

/** The sides of a rectangle in metres, as a room type opens at. */
export type Size = { readonly width: number; readonly depth: number }

/** A rectangle of the given size, centred on the drop point and snapped to the grid. */
export function droppedAt(at: Point, size: Size): Footprint {
  return {
    polygon: rectangleToPolygon({
      left: snapToGrid(at[0] - size.width / 2),
      top: snapToGrid(at[1] - size.depth / 2),
      width: size.width,
      depth: size.depth,
    }),
    rotation: 0,
  }
}

/**
 * The rectangle a room of this kind opens at, put back around the room's own centre and turned as
 * the room is turned. It is not taken to the grid: the centre is what the person is looking at,
 * and shifting the room to square it off would be a second gesture nobody asked for.
 */
export function restoredTo(from: Footprint, size: Size): Footprint {
  const frame = frameOf(from)
  return {
    polygon: rectangleToPolygon({
      left: frame.cx - size.width / 2,
      top: frame.cy - size.depth / 2,
      width: size.width,
      depth: size.depth,
    }),
    rotation: from.rotation,
  }
}

/** Every room the cutter lies over, with the cutter taken out of it. */
export function carveWith(cutter: Footprint, sheet: Sheet): Attempt<readonly Placement[]> {
  const carved: Placement[] = []
  for (const other of sheet.others) {
    if (!overlaps(cutter, other.footprint)) continue
    if (other.pinned) return refuse(`${other.name} is pinned`)
    const result = carveFootprint(other.footprint, [cutter])
    if (result.split) return refuse(`${other.name} would be cut in two`)
    if (result.footprint.polygon.length < 3) return refuse(`${other.name} would be cut away`)
    // Nothing came off the outline although the two really do overlap: the cutter stands wholly
    // inside the room, and a room is a ring of wall, not a room with a hole in the middle of it.
    if (!result.carved) return refuse(`${other.name} would be left with a hole in it`)
    const small = underMinimum(result.footprint, other.sizes)
    if (small) return refuse(`${other.name} would be left ${small}`)
    carved.push({ id: other.id, footprint: result.footprint })
  }
  return settled(carved)
}

/**
 * Why the carve this landing would need is refused, or nothing where the room lands clear or the
 * carve is allowed. A gesture offered on a button asks this first, so it never opens a prompt
 * whose only answer is Put back.
 */
export function carveRefusal(landing: Landing, sheet: Sheet): string | null {
  if (landing.over.length === 0) return null
  const carve = carveWith(landing.footprint, sheet)
  return carve.ok ? null : carve.reason
}

/** A room redrawn to an outline on the sheet, written in its own frame, so its rotation is kept. */
function reshape(footprint: Footprint, outline: Polygon): Footprint {
  const frame = frameOf(footprint)
  return placeInFrame(sheetToLocalPolygon(outline, frame), frame, footprint.rotation)
}

/** A ring smaller than this is the rounding of the booleans, not a piece of a room, in m². */
const SLIVER_M2 = 1e-6

function realPieces(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((piece) => area(piece[0] ?? []) > SLIVER_M2)
}

/** The unit normal of a shared wall, pointing from `a` across the wall into `b`. */
export function wallNormal(wall: SharedWall, a: Footprint, b: Footprint): Point {
  const along = wallDirection(wall)
  const across: Point = [-along[1], along[0]]
  const from = centroid(outlineOf(a))
  const to = centroid(outlineOf(b))
  const towards = (to[0] - from[0]) * across[0] + (to[1] - from[1]) * across[1]
  return towards >= 0 ? across : [-across[0], -across[1]]
}

/** The rectangle the shared wall sweeps out as it travels `distance` along its normal. */
function stripOf(wall: SharedWall, normal: Point, distance: number): Polygon {
  const dx = normal[0] * distance
  const dy = normal[1] * distance
  return [
    wall.from,
    wall.to,
    [wall.to[0] + dx, wall.to[1] + dy],
    [wall.from[0] + dx, wall.from[1] + dy],
  ]
}

/** A room either side of a moved wall, with the area to read while the hand is still moving. */
type WallSide = {
  readonly id: string
  readonly footprint: Footprint
  readonly area: number
}

export type WallShift = {
  readonly a: WallSide
  readonly b: WallSide
  /** How far the wall really travelled, in metres: less than it was asked for where it stopped. */
  readonly distance: number
}

function sideOf(room: Neighbour, footprint: Footprint = room.footprint): WallSide {
  return { id: room.id, footprint, area: area(outlineOf(footprint)) }
}

/** A wall that will not travel this far is not refused; it stops where it can stand. */
type Try =
  | { readonly kind: 'settled'; readonly shift: WallShift }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'refused'; readonly reason: string }

function shiftAt(
  a: Neighbour,
  b: Neighbour,
  wall: SharedWall,
  normal: Point,
  distance: number,
): Try {
  const strip = stripOf(wall, normal, distance)
  const growing = distance > 0 ? a : b
  const shrinking = distance > 0 ? b : a
  const stood = outlineOf(shrinking.footprint)
  const left = realPieces(differencePolygons(stood, [strip]))
  if (left.length === 0) return { kind: 'stopped' }
  if (left.length > 1) return { kind: 'refused', reason: `${shrinking.name} would be cut in two` }
  const remains = left[0]
  if (!remains || remains.length > 1) {
    return { kind: 'refused', reason: `${shrinking.name} would be left with a hole in it` }
  }
  // One room may only take what the other gives up. Where the strip runs out past the room it is
  // moving into, the wall has come away from it and stops rather than growing into open sheet.
  const given = area(stood) - area(remains[0] ?? [])
  if (Math.abs(given - Math.abs(distance) * wallLength(wall)) > 1e-6) return { kind: 'stopped' }
  const joined = realPieces(unionPolygons([outlineOf(growing.footprint), strip]))
  const whole = joined[0]
  if (joined.length !== 1 || !whole || whole.length > 1) {
    return { kind: 'refused', reason: `${growing.name} would not be left one room` }
  }
  const shrunk = reshape(shrinking.footprint, remains[0] ?? [])
  const grown = reshape(growing.footprint, whole[0] ?? [])
  if (underMinimum(shrunk, shrinking.sizes)) return { kind: 'stopped' }
  if (sharedWalls(outlineOf(shrunk), outlineOf(grown), WALL_TOLERANCE).length === 0) {
    return { kind: 'stopped' }
  }
  const sides = distance > 0 ? { a: grown, b: shrunk } : { a: shrunk, b: grown }
  return { kind: 'settled', shift: { a: sideOf(a, sides.a), b: sideOf(b, sides.b), distance } }
}

/**
 * The wall `a` and `b` share, pushed `distance` along its normal: the room it moves away from
 * grows by the strip it sweeps, the room it moves into loses that same strip, and both keep
 * their rotation. It travels in whole grid steps, so a wall on the grid stays on it. Where the
 * room that shrinks would go under the smallest its kind admits, or come away from the wall
 * altogether, the furthest step that does neither is taken instead of refusing the gesture.
 */
export function moveSharedWall(
  a: Neighbour,
  b: Neighbour,
  wall: SharedWall,
  distance: number,
): Attempt<WallShift> {
  if (a.pinned) return refuse(`${a.name} is pinned`)
  if (b.pinned) return refuse(`${b.name} is pinned`)
  if (wallLength(wall) < 1e-9) return refuse(`${a.name} and ${b.name} share no wall`)
  const normal = wallNormal(wall, a.footprint, b.footprint)
  const held: WallShift = { a: sideOf(a), b: sideOf(b), distance: 0 }
  const steps = Math.round(distance / GRID_M)
  if (steps === 0) return settled(held)
  const asked = shiftAt(a, b, wall, normal, steps * GRID_M)
  if (asked.kind === 'refused') return refuse(asked.reason)
  if (asked.kind === 'settled') return settled(asked.shift)
  // It will not go the whole way. Every step further takes more off the room that is shrinking,
  // so the furthest it will go is found by halving rather than by walking every step back.
  const way = Math.sign(steps)
  let low = 0
  let high = Math.abs(steps)
  let best = held
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    const tried = shiftAt(a, b, wall, normal, way * middle * GRID_M)
    if (tried.kind === 'settled') {
      low = middle
      best = tried.shift
    } else {
      high = middle
    }
  }
  return settled(best)
}
