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
export { companionName, defaultProgram, standingOf } from './program'
export type { ProgramRoom, Standing } from './program'
export { connectionSource } from './defaultConnections'
export { impliedConnections } from './impliedConnections'
export type { ImpliedConnection } from './impliedConnections'
export { fitSentence, storeyFits, storeyLabel } from './fit'
export type { StoreyFit } from './fit'
export { buildableArea, buildableAreaOf } from './setbacks'
