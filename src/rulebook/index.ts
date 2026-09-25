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
  rangeFor,
  roomTypeById,
  spansAllStoreys,
  typesByCategory,
  typicalArea,
} from './sizes'
export { allowedFloorArea } from './ratio'
export { reductionFor, slackOf } from './slack'
export type { Reduction } from './slack'
export { pastAllowed, pastRange } from './sizeCheck'
export { circulationPerStorey, hallwayArea, hallwayFollows, hallwayName } from './circulation'
export { companionName, companionOwners, companionsOf, defaultProgram, standingOf } from './program'
export type { CompanionEdge, CompanionRoom, ProgramRoom, Standing } from './program'
export { connectionSource } from './defaultConnections'
export { impliedConnections } from './impliedConnections'
export type { ImpliedConnection } from './impliedConnections'
export { fitSentence, storeyFits, storeyLabel } from './fit'
export type { StoreyFit } from './fit'
export { buildableArea, buildableAreaOf, setbackDepth } from './setbacks'
export type { PlotShape } from './setbacks'
export { blockedRun, feasibility, linksHeld } from './feasibility'
export type { BriefEdge, BriefRoom, Finding } from './feasibility'
export { isPlanar } from './planarity'
export { inWords, listedNames, metresIn } from './words'
