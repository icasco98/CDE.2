import { expect, it } from 'vitest'
import { sheetOf, type Door, type Zone, type Sheet } from '../sheet'
import { dxfOf } from './dxf'
import { pdfOf } from './sheet'

const on = new Date('2026-09-11T09:00:00Z')

/** Thirty zones, ten to a storey on a five-by-two grid, each with a door on its east edge. */
function house(): Sheet {
  const zones: Zone[] = []
  for (let storey = 0; storey < 3; storey += 1) {
    for (let index = 0; index < 10; index += 1) {
      // A door into the zone to the east, or out of the house from the last zone of a row.
      const last = index % 5 === 4
      const door: Door = {
        id: `d-${storey}-${index}`,
        connection: `e-${storey}-${index}`,
        to: last ? 'EXTERIOR' : `zone-${storey}-${index + 1}`,
        type: 'door',
        w: 0.9,
        ...(last ? { at: [3.5, 2.5] as [number, number] } : { along: 0.5 }),
        flip: false,
        hinge: false,
      }
      zones.push({
        id: `zone-${storey}-${index}`,
        name: `Zone ${storey}.${index}`,
        kind: 'zone',
        cat: 'private',
        target: 17.5,
        x: (index % 5) * 3.5 + 1.5,
        y: Math.floor(index / 5) * 5 + 1.5,
        w: 3.5,
        h: 5,
        angle: 0,
        pieces: null,
        storey,
        placed: true,
        doors: [door],
      })
    }
  }
  return sheetOf(zones, {}, 3)
}

/** The best of five runs after a warm-up, so neither compilation nor a stray collection is charged. */
function milliseconds(work: () => void): number {
  for (let run = 0; run < 5; run += 1) work()
  let best = Infinity
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

const sheet = house()

it('writes the PDF for thirty zones on three storeys in under 50 ms', () => {
  let bytes = 0
  const took = milliseconds(() => {
    bytes = pdfOf(sheet, 'Thirty zones', on).length
  })
  expect(bytes).toBeGreaterThan(1000)
  expect(took).toBeLessThan(50)
})

it('writes the DXF for thirty zones on three storeys in under 50 ms', () => {
  let letters = 0
  const took = milliseconds(() => {
    letters = dxfOf(sheet).length
  })
  expect(letters).toBeGreaterThan(1000)
  expect(took).toBeLessThan(50)
})
