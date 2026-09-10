import { expect, it } from 'vitest'
import { createIdGenerator } from './ids'

it('gives the same ids under a seed and different ones without', () => {
  const first = createIdGenerator(42)
  const second = createIdGenerator(42)
  const ids = Array.from({ length: 4 }, () => first('room'))
  expect(ids).toEqual(Array.from({ length: 4 }, () => second('room')))
  expect(new Set(ids).size).toBe(4)
  expect(ids[0]).toMatch(/^room_/)
  expect(createIdGenerator()('room')).not.toBe(createIdGenerator()('room'))
})
