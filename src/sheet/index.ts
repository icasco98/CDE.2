/** The zoning sheet: its model, its geometry, its actions and its report. */

export type { Box, Side } from './plot'
export {
  BUILD,
  BUILDABLE_AREA,
  MAX_STOREYS,
  NORTH,
  PLOT,
  PLOT_BOX,
  RATIO,
  RATIO_ALLOWED,
  SIDES,
  SIDE_BUDGET,
  SIDE_NAME,
  STOREY_MARK,
  STOREY_NAME,
  STREET_BUDGET,
  boxCorners,
} from './plot'

export type {
  Category,
  Door,
  DoorType,
  Frame,
  LandingRule,
  Point,
  Poly,
  Room,
  Settings,
  Sheet,
} from './model'
export {
  DEFAULTS,
  RULE_HINT,
  SETTINGS_V,
  acrossStoreys,
  allPlaced,
  cloneRoom,
  cloneSheet,
  centreOf,
  doorsOf,
  ghostsOf,
  heightCap,
  heightOf,
  isCourt,
  isGhost,
  isOpen,
  isStair,
  kin,
  migrate,
  piecesOf,
  placedRooms,
  rank,
  ruleOf,
  sheetOf,
  snapRooms,
  square,
  stH,
  storeyCountOf,
  storeyNameOf,
  storeyOf,
  tallRoom,
  zBase,
  zTop,
} from './model'

export type { MassCamera, MassEdge, MassProjection, MassViewName, Prism } from './mass'
export {
  BLIND_BREACH,
  MASS_START,
  MASS_VIEWS,
  blindWall,
  breaches,
  heightFromDrag,
  lookFrom,
  massPivot,
  massProjection,
  orderPrisms,
  prismsOf,
  recentred,
  seenWalls,
  turnedBy,
  worldLoop,
  zoomedBy,
} from './mass'

export type { Seg } from './geometry'
export {
  areaOf,
  bboxOf,
  canonicalise,
  centreOfFootprint,
  chainWalls,
  cutBy,
  cutToSetback as cutShapeToSetback,
  diffConvex,
  facing,
  fmt,
  insideConvex,
  intersectConvex,
  loopsOf,
  norm,
  normalise,
  outlineFrom,
  outlineOf,
  overlapCells,
  overlapRect,
  partsOf,
  polyArea,
  pullWall as pullWallShape,
  r2,
  r6,
  rotateGroup,
  setAngle,
  setFrame,
  simplePoly,
  snapTo,
  sideOf,
  simplifyLoop,
  tidy,
  toLocal,
  toWorld,
  triangulate,
  weld,
  unionBox,
  worldCorners,
  worldPieces,
  worldWalls,
} from './geometry'

export type { Guide, PointSnap, SnapKind } from './snap'
export {
  alignWall,
  closeGaps,
  gridRest,
  nearWalls,
  snapAngle,
  snapHeight,
  snapMove,
  snapPoint,
  wallCandidates,
} from './snap'

export type { Give } from './settle'
export {
  allowedBox,
  giveWay,
  hold,
  outsideBuildable,
  overlapsOf,
  partingMove,
  pushFrom,
  resolve,
  settle,
  yieldTo,
} from './settle'

export type { Pocket } from './pockets'
export {
  bestNeighbour,
  courtWhy,
  givePieces,
  holdsSquare,
  pocketsOf,
  roomFromPocket,
} from './pockets'

export type { Hit, Place, Walk } from './doors'
export {
  doorAcross,
  doorAt,
  doorBlocked,
  doorPlace,
  openWall as openWallOn,
  setDoorWidth as doorWidth,
  slideDoor as slideDoorAlong,
  walkTest,
} from './doors'

export type { DoorDrawing, DoorRead, DoorRef, Leaf } from './openings'
export { doorDrawing, doorNear, doorRead, lostDoors, newDoors } from './openings'

export type { LabelPlan } from './labels'
export { initialsOf, labelPlan, obstaclesOf, spanThrough } from './labels'

export type { BoundaryRead, Report } from './report'
export { boundaryWalls, report, sideOver, sideUsed } from './report'

export {
  DOOR,
  KINDS,
  KIND_INFO,
  PROGRAM,
  PROGRAM_TAG,
  freshRooms,
  hasHinge,
  hasSwing,
  isStreetDoor,
  repair,
  sampleSheet,
  sizeFor,
} from './sample'

export type { Change, History, Result, Side4 } from './actions'
export {
  HISTORY_CAP,
  addDoor,
  addRoom,
  addStorey,
  carveBelow,
  clearColor,
  clearHeight,
  clearLabel,
  combine,
  copyTo,
  cutToSetback,
  draw,
  drawnPoint,
  dropTopStorey,
  flipDoor,
  givePocket,
  group,
  hingeDoor,
  lock,
  makeCorridor,
  makeCourt,
  mirror,
  move,
  moveCorner,
  moveDoor,
  newHistory,
  openWall,
  place,
  pullWall,
  pushOthers,
  reattachDoor,
  redo,
  remember,
  removeDoor,
  removeRoom,
  reorder,
  reshape,
  resize,
  restOnGrid,
  restore,
  sendBack,
  sendBackRoom,
  setArea,
  setColor,
  setDoorWidth,
  setHeight,
  setLabel,
  setSetting,
  setSize,
  setStorey,
  slideDoor,
  turn,
  undo,
  ungroup,
  unlock,
} from './actions'

export type { AgentTool, Desk } from './agent'
export { layoutTools, sheetRead } from './agent'

export type { Memory } from './memory'
export { newMemory, readMemory, withFeedback, withNote, withPlan } from './memory'

export { promptFor } from './prompt'
