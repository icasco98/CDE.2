import { describe, expect, it } from 'vitest'
import { isPlanar, type Pair } from './planarity'

/** Every pair of a set of names: the complete graph on them. */
function complete(names: readonly string[]): Pair[] {
  const pairs: Pair[] = []
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) pairs.push([names[i] as string, names[j] as string])
  return pairs
}

function both(one: readonly string[], other: readonly string[]): Pair[] {
  return one.flatMap((a) => other.map((b) => [a, b] as Pair))
}

describe('whether a storey’s links can be drawn without a crossing', () => {
  it('draws a tree, a cycle and a square with one diagonal', () => {
    expect(
      isPlanar(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['b', 'd'],
        ],
      ),
    ).toBe(true)
    expect(
      isPlanar(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
          ['d', 'a'],
        ],
      ),
    ).toBe(true)
    expect(
      isPlanar(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
          ['d', 'a'],
          ['a', 'c'],
        ],
      ),
    ).toBe(true)
  })

  it('draws the complete graph on four rooms and refuses the one on five', () => {
    expect(isPlanar(['a', 'b', 'c', 'd'], complete(['a', 'b', 'c', 'd']))).toBe(true)
    expect(isPlanar(['a', 'b', 'c', 'd', 'e'], complete(['a', 'b', 'c', 'd', 'e']))).toBe(false)
  })

  it('refuses three rooms each linked to the same three others', () => {
    const nodes = ['a', 'b', 'c', 'x', 'y', 'z']
    expect(isPlanar(nodes, both(['a', 'b', 'c'], ['x', 'y', 'z']))).toBe(false)
  })

  it('refuses a crossing with a corridor hung off it, and draws it once a link goes', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'hall', 'wc']
    const five = complete(['a', 'b', 'c', 'd', 'e'])
    const hung: Pair[] = [
      ['a', 'hall'],
      ['hall', 'wc'],
    ]
    expect(isPlanar(nodes, [...five, ...hung])).toBe(false)
    const without = five.filter(([one, other]) => !(one === 'a' && other === 'e'))
    expect(isPlanar(nodes, [...without, ...hung])).toBe(true)
  })

  it('draws a villa’s ground floor, corridor, court and all', () => {
    const nodes = [
      'entry',
      'hall',
      'stair',
      'diwaniya',
      'wc',
      'formal',
      'family',
      'dining',
      'kitchen',
      'guest-wc',
    ]
    const pairs: Pair[] = [
      ['entry', 'hall'],
      ['entry', 'stair'],
      ['entry', 'formal'],
      ['entry', 'family'],
      ['entry', 'guest-wc'],
      ['hall', 'stair'],
      ['diwaniya', 'wc'],
      ['family', 'dining'],
      ['dining', 'kitchen'],
    ]
    expect(isPlanar(nodes, pairs)).toBe(true)
  })

  it('leaves a room with no links alone, and a pair joined twice', () => {
    expect(
      isPlanar(
        ['a', 'b', 'lonely'],
        [
          ['a', 'b'],
          ['a', 'b'],
        ],
      ),
    ).toBe(true)
    expect(isPlanar([], [])).toBe(true)
  })
})
