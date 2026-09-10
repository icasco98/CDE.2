export type { Footprint, Point, Polygon } from './types'
export type { Piece, Rect } from './polygon'
export {
  area,
  boundingBox,
  centroid,
  differencePolygons,
  nearestPointOnBoundary,
  pointInPolygon,
  pointOnBoundary,
  rectangleToPolygon,
  signedArea,
  unionPolygons,
} from './polygon'
export type { Frame, Handle } from './footprint'
export {
  anchorPointOf,
  frameOf,
  outlineOf,
  resizeFromAnchor,
  sheetToLocalPoint,
  sheetToLocalPolygon,
  sheetToLocalVector,
  localToSheetPoint,
  localToSheetPolygon,
  translateFootprint,
} from './footprint'
export { footprintsOverlap, OVERLAP_TOLERANCE } from './overlap'
export { carveFootprint, holdsRectangle, subtractPolygons } from './carve'
export {
  clampDrawnRectangle,
  clampGroupInside,
  isOutsideBoundary,
  limitResize,
  shiftFootprintInside,
} from './boundary'
export {
  GRID_M,
  nearestNeighbourPoint,
  snapPointToGrid,
  snapRectangleToNeighbours,
  snapToGrid,
  wallSnapOffset,
} from './snap'
export { buildingOutline, ringsToPath } from './outline'
export type { SharedWall } from './walls'
export { sharedWalls } from './walls'
