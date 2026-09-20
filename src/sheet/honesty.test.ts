import { describe, expect, it } from 'vitest'
import { NOTHING_PLACED, claimsChange } from './honesty'

describe('the line the log adds when nothing ran', () => {
  it('reads an answer that says the plan changed', () => {
    expect(claimsChange('Diwaniya on the corner, its WC behind it.')).toBe(false)
    expect(claimsChange('I placed the diwaniya on the corner with its WC behind it.')).toBe(true)
    expect(claimsChange('The maid room moved to the back and the store went beside it.')).toBe(true)
    expect(claimsChange('Kitchen turned a quarter so it lies along the store.')).toBe(true)
    expect(claimsChange('The space between the stair and the maid room is now a court.')).toBe(
      false,
    )
  })

  it('leaves an offer, a question and a reading alone', () => {
    expect(claimsChange('Shall I put the diwaniya on the corner?')).toBe(false)
    expect(claimsChange('I would move the kitchen behind the dining room — say the word.')).toBe(
      false,
    )
    expect(claimsChange('Where should the driver room go?')).toBe(false)
    expect(claimsChange('Two rooms overlap and one stands past the line.')).toBe(false)
    expect(claimsChange('   ')).toBe(false)
  })

  it('says only what is certain', () => {
    expect(NOTHING_PLACED).toBe('Nothing was placed: no command ran this message.')
  })
})
