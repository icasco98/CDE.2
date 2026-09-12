import { describe, expect, it } from 'vitest'
import { fitSentence, storeyFits, storeyLabel, type FitRoom } from './fit'

const room = (targetArea: number, storey = 0, storeysSpanned = 1): FitRoom => ({
  targetArea,
  storey,
  storeysSpanned,
})

describe('storey labels', () => {
  it('names the ground storey and the levels above it', () => {
    expect([0, 1, 2, 3].map(storeyLabel)).toEqual(['Ground', 'First', 'Second', 'Storey 3'])
  })
})

describe('the fit of a storey against its buildable area', () => {
  /** The starting plot, 20 by 25 with the street to the south: 17 by 21.5 inside the setbacks. */
  const buildable = 365.5

  it('says what is to spare on a storey that fits', () => {
    const [ground] = storeyFits([room(200), room(92)], buildable, 1)
    expect(ground?.needed).toBe(292)
    expect(ground?.over).toBe(false)
    expect(fitSentence(ground!)).toBe(
      '292 m² of targets on 365.5 m² buildable · fits, 73.5 m² to spare',
    )
  })

  it('says by how much a storey is over', () => {
    const [ground] = storeyFits([room(200), room(198.5)], buildable, 1)
    expect(ground?.over).toBe(true)
    expect(fitSentence(ground!)).toBe('398.5 m² of targets on 365.5 m² buildable · over by 33 m²')
  })

  it('counts a stair on every storey it passes through', () => {
    const fits = storeyFits([room(12, 0, 2), room(30, 1)], buildable, 2)
    expect(fits.map((fit) => fit.needed)).toEqual([12, 42])
  })

  it('is over on a plot the setbacks leave nothing of', () => {
    const [ground] = storeyFits([room(40)], 0, 1)
    expect(ground?.over).toBe(true)
    expect(fitSentence(ground!)).toBe('40 m² of targets on 0 m² buildable · over by 40 m²')
  })

  it('gives a storey with no rooms its whole floor to spare', () => {
    const fits = storeyFits([room(40)], buildable, 2)
    expect(fits[1]).toEqual({
      storey: 1,
      needed: 0,
      buildable,
      over: false,
      difference: buildable,
    })
  })
})
