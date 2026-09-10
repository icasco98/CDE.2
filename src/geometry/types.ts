export type Point = readonly [number, number]
export type Polygon = readonly Point[]
/** A rigid shape on the sheet: `polygon` in sheet metres before rotation, turned by `rotation` degrees clockwise about the centre of its bounding box. */
export type Footprint = { readonly polygon: Polygon; readonly rotation: number }
