import type { Point } from '../geometry'

/* Both sheets are drawn in metres over an extent, so one camera serves the zoning plan and the
   bubble diagram alike: nothing here knows what is drawn, only how much of it is in view. */

/** A box on the sheet in metres: what a sheet draws, or the part of it a camera shows. */
export type Extent = {
  readonly minX: number
  readonly minY: number
  readonly width: number
  readonly height: number
}

/** The whole sheet at one, and eight times that at the closest, which reads a 6 m² room comfortably. */
export const MAX_ZOOM = 8

/** One wheel notch, multiplicative so a notch in and a notch out land back where they started. */
export const ZOOM_STEP = 1.1

/** Until the sheet has been measured, a mark is sized as if the sheet were this wide in pixels. */
const ASSUMED_WIDTH_PX = 900

/** How much closer than the whole sheet, and the north-west corner of what is drawn, in metres. */
export type Camera = { readonly scale: number; readonly x: number; readonly y: number }

/** The whole sheet: held to the extent on every read, so this is the fit whatever the extent is. */
export const fitCamera: Camera = { scale: 1, x: 0, y: 0 }

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * The camera held over the extent: never wider than the whole sheet and never past its edges, so
 * zooming out lands exactly on the fit extent however far it was panned first.
 */
function held(extent: Extent, camera: Camera): Camera {
  const scale = clamp(camera.scale, 1, MAX_ZOOM)
  return {
    scale,
    x: clamp(camera.x, extent.minX, extent.minX + extent.width - extent.width / scale),
    y: clamp(camera.y, extent.minY, extent.minY + extent.height - extent.height / scale),
  }
}

/** The part of the sheet the camera draws, in metres. */
export function visibleExtent(extent: Extent, camera: Camera): Extent {
  const shown = held(extent, camera)
  return {
    minX: shown.x,
    minY: shown.y,
    width: extent.width / shown.scale,
    height: extent.height / shown.scale,
  }
}

/** To a tenth of a millimetre, which is below anything the sheet draws and keeps the attribute short. */
function metres(value: number): number {
  return Number(value.toFixed(4))
}

export function viewBoxOf(extent: Extent, camera: Camera): string {
  const shown = visibleExtent(extent, camera)
  return `${metres(shown.minX)} ${metres(shown.minY)} ${metres(shown.width)} ${metres(shown.height)}`
}

/**
 * Zoom about a point on the sheet. The width shrinks by the factor and the corner moves with it, so
 * the metre under the pointer keeps its place across the drawing and stays under the pointer.
 */
export function zoomAbout(extent: Extent, camera: Camera, at: Point, factor: number): Camera {
  const from = held(extent, camera)
  const scale = clamp(from.scale * factor, 1, MAX_ZOOM)
  const ratio = from.scale / scale
  return held(extent, {
    scale,
    x: at[0] - ratio * (at[0] - from.x),
    y: at[1] - ratio * (at[1] - from.y),
  })
}

/**
 * The view shifted so the metre at `target` is drawn where the metre at `at` is drawn now. A drag
 * and a pinch both read the point under the hand afresh, so a late render corrects itself.
 */
export function panTo(extent: Extent, camera: Camera, target: Point, at: Point): Camera {
  const from = held(extent, camera)
  return held(extent, {
    scale: from.scale,
    x: from.x + target[0] - at[0],
    y: from.y + target[1] - at[1],
  })
}

/**
 * The metres one CSS pixel covers. The sheet meets its box, so the drawing is scaled by whichever
 * side has less room; a mark divided by this keeps its size on screen at any zoom.
 */
export function metresPerPixel(
  extent: Extent,
  camera: Camera,
  box: { readonly width: number; readonly height: number },
): number {
  const shown = visibleExtent(extent, camera)
  if (box.width <= 0 || box.height <= 0) return shown.width / ASSUMED_WIDTH_PX
  return Math.max(shown.width / box.width, shown.height / box.height)
}
