export type Point = readonly [number, number]
export type Polygon = readonly Point[]

/**
 * The circle a curved wall runs on, in the polygon's own frame, and the way round it: `clockwise`
 * is clockwise as the plan is drawn, where y runs down.
 */
export type Circle = {
  readonly centre: Point
  readonly radius: number
  readonly clockwise: boolean
}

/**
 * A run of the polygon that stands for a true arc: the vertices `from` through `to`, wrapping at
 * the end of the list, all lie on this circle. `from` equal to `to` is the whole ring, which is
 * how a circle is written.
 */
export type Arc = Circle & { readonly from: number; readonly to: number }

/**
 * A rigid shape on the sheet: `polygon` in sheet metres before rotation, turned by `rotation`
 * degrees clockwise about the centre of its bounding box. `arcs` remembers which runs of the
 * polygon stand for curves; every calculation works on the polygon.
 */
export type Footprint = {
  readonly polygon: Polygon
  readonly rotation: number
  readonly arcs?: readonly Arc[]
}
