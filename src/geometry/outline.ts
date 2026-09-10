import { unionPolygons } from './polygon'
import type { Polygon } from './types'

/** The building outline: the union of the polygons, as rings, each piece's outer ring before its holes. */
export function buildingOutline(polygons: readonly Polygon[]): Polygon[] {
  const rings: Polygon[] = []
  for (const piece of unionPolygons(polygons)) {
    for (const ring of piece) if (ring.length >= 3) rings.push(ring)
  }
  return rings
}

export function ringsToPath(rings: readonly Polygon[]): string {
  return rings
    .map(
      (ring) => 'M ' + ring.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' L ') + ' Z',
    )
    .join(' ')
}
