import { describe, expect, it } from 'vitest'
import { rectangleToPolygon, type Point } from '../../geometry'
import {
  fitCamera,
  MAX_ZOOM,
  metresPerPixel,
  panTo,
  viewBoxOf,
  visibleExtent,
  zoomAbout,
  ZOOM_STEP,
  type Camera,
} from './camera'
import { extentOf } from './frame'

const plot = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })
const extent = extentOf(plot, [])

/** Where a metre sits across the drawing, which is where it sits on the screen: the sheet meets its box whole. */
function across(camera: Camera, at: Point): Point {
  const shown = visibleExtent(extent, camera)
  return [(at[0] - shown.minX) / shown.width, (at[1] - shown.minY) / shown.height]
}

function zoomedTo(scale: number, at: Point): Camera {
  return zoomAbout(extent, fitCamera, at, scale)
}

describe('zoom about a point', () => {
  it('leaves that point where it was on the screen', () => {
    const at: Point = [6.25, 18.5]
    const before = across(fitCamera, at)
    const after = across(zoomAbout(extent, fitCamera, at, ZOOM_STEP), at)
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('leaves it where it was from a camera that is already zoomed and panned', () => {
    const camera = panTo(extent, zoomedTo(3, [10, 12.5]), [9, 11], [10, 12.5])
    const at: Point = [9.75, 13.125]
    const before = across(camera, at)
    const after = across(zoomAbout(extent, camera, at, ZOOM_STEP), at)
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('draws the sheet by the factor it was given', () => {
    expect(zoomedTo(3, [10, 12.5]).scale).toBeCloseTo(3, 12)
    expect(visibleExtent(extent, zoomedTo(3, [10, 12.5])).width).toBeCloseTo(25 / 3, 12)
  })
})

describe('how far the zoom goes', () => {
  it('stops at eight times the fit however many notches it is given', () => {
    let camera = fitCamera
    for (let notch = 0; notch < 60; notch++) {
      camera = zoomAbout(extent, camera, [10, 12.5], ZOOM_STEP)
    }
    expect(camera.scale).toBe(MAX_ZOOM)
  })

  it('stops at the whole sheet on the way out', () => {
    let camera = zoomedTo(MAX_ZOOM, [4, 4])
    for (let notch = 0; notch < 60; notch++) {
      camera = zoomAbout(extent, camera, [4, 4], 1 / ZOOM_STEP)
    }
    expect(camera.scale).toBe(1)
    expect(visibleExtent(extent, camera)).toEqual(extent)
  })
})

describe('back to the whole sheet', () => {
  it('fits after a zoom', () => {
    const zoomed = zoomedTo(5, [3, 21])
    expect(visibleExtent(extent, zoomed)).not.toEqual(extent)
    expect(visibleExtent(extent, fitCamera)).toEqual(extent)
  })

  it('fits after a pan', () => {
    const panned = panTo(extent, zoomedTo(4, [10, 12.5]), [2, 3], [11, 14])
    expect(visibleExtent(extent, panned)).not.toEqual(extent)
    expect(visibleExtent(extent, fitCamera)).toEqual(extent)
  })
})

describe('panning', () => {
  it('draws the metre it was given where the hand now is', () => {
    const camera = zoomedTo(4, [10, 12.5])
    const panned = panTo(extent, camera, [9, 11], [10, 12.5])
    const before = across(camera, [10, 12.5])
    const after = across(panned, [9, 11])
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('never leaves the sheet', () => {
    const shown = visibleExtent(extent, panTo(extent, zoomedTo(2, [10, 12.5]), [0, 0], [60, 60]))
    expect(shown.minX).toBe(extent.minX)
    expect(shown.minY).toBe(extent.minY)
  })
})

describe('the viewBox', () => {
  it('reads out the whole sheet in metres', () => {
    expect(viewBoxOf(extent, fitCamera)).toBe('-2.5 -2.5 25 30')
  })

  it('reads out a quarter of the sheet zoomed four times', () => {
    expect(viewBoxOf(extent, zoomedTo(4, [-2.5, -2.5]))).toBe('-2.5 -2.5 6.25 7.5')
  })
})

describe('metres to a pixel', () => {
  it('takes the side with less room, so the whole sheet is inside its box', () => {
    expect(metresPerPixel(extent, fitCamera, { width: 1000, height: 300 })).toBeCloseTo(
      30 / 300,
      12,
    )
  })

  it('halves when the sheet is drawn twice as close', () => {
    const box = { width: 1000, height: 300 }
    const fit = metresPerPixel(extent, fitCamera, box)
    expect(metresPerPixel(extent, zoomedTo(2, [10, 12.5]), box)).toBeCloseTo(fit / 2, 12)
  })
})
