import { describe, expect, it } from 'vitest'
import type { Storage } from '../../model'
import { DEFAULT_SPLIT, heldSplit, readSplit, splitAt, writeSplit } from './split'

function held(): Storage {
  const kept = new Map<string, string>()
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value)
    },
    removeItem: (key) => {
      kept.delete(key)
    },
  }
}

describe('the width of the two halves', () => {
  it('keeps both halves on the tab whatever the handle is dragged to', () => {
    expect(heldSplit(60)).toBe(60)
    expect(heldSplit(0)).toBe(15)
    expect(heldSplit(100)).toBe(85)
    expect(heldSplit(Number.NaN)).toBe(DEFAULT_SPLIT)
  })

  it('reads the handle as the share of the width it was dragged across', () => {
    const box = { left: 200, width: 800 }
    expect(splitAt(box, 600)).toBe(50)
    expect(splitAt(box, 200)).toBe(15)
    expect(splitAt(box, 1000)).toBe(85)
    expect(splitAt({ left: 0, width: 0 }, 40)).toBe(DEFAULT_SPLIT)
  })
})

describe('the width remembered between sittings', () => {
  it('opens at sixty forty and gives back what was last set by hand', () => {
    const storage = held()
    expect(readSplit(storage)).toBe(DEFAULT_SPLIT)
    writeSplit(storage, 35.5)
    expect(readSplit(storage)).toBe(35.5)
  })

  it('opens at sixty forty when what was stored cannot be read as a width', () => {
    const storage = held()
    storage.setItem('plan-split', 'wide')
    expect(readSplit(storage)).toBe(DEFAULT_SPLIT)
  })
})
