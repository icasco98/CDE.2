export { roomTypes } from './roomTypes'
export type {
  Band,
  LegalFloor,
  RoomCategory,
  RoomTier,
  RoomType,
  RoomTypeFlags,
  SizeRange,
  Typical,
} from './types'
export { byPlotBand, freeProportion, lengthAsNeeded } from './types'
export {
  categoryLabels,
  plotBandFor,
  roomTypeById,
  spansAllStoreys,
  typesByCategory,
  typicalArea,
} from './sizes'
export { circulationPerStorey, hallwayArea, hallwayFollows, hallwayName } from './circulation'
export type { StoreyCirculation } from './circulation'
export { companionName, companionOwners, companionsOf, defaultProgram, standingOf } from './program'
export type { CompanionEdge, CompanionRoom, ProgramRoom, Standing } from './program'
export { connectionSource } from './defaultConnections'
export { impliedConnections } from './impliedConnections'
export type { ImpliedConnection } from './impliedConnections'
export { fitSentence, storeyFits, storeyLabel } from './fit'
export type { StoreyFit } from './fit'
export { buildableArea, buildableAreaOf } from './setbacks'
export type { PlotShape } from './setbacks'
export { nearestOn, sidesOf } from './sides'
export type { PlotSide, PlotSides } from './sides'
export { forces, forcesOn, medium, strong, weak } from './forces'
export type { Force, ForceField, ForceRoom } from './forces'
export { kerbFor, kerbKinds } from './kerb'
