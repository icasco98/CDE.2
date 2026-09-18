import { describe, expect, it } from 'vitest'
import {
  areaOf,
  bboxOf,
  canonicalise,
  chainWalls,
  clipHalf,
  cutBy,
  cutToSetback,
  diffConvex,
  facing,
  fmt,
  intersectConvex,
  normalise,
  outlineFrom,
  outlineOf,
  overlapCells,
  partsOf,
  polyArea,
  pullWall,
  r2,
  setAngle,
  sideOf,
  simplifyLoop,
  thinness,
  tidy,
  toLocal,
  toWorld,
  triangulate,
  weld,
  worldCorners,
  worldWalls,
} from './geometry'
import { RECT, type Poly, type Room } from './model'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
  cat: 'shared',
  target: 10,
  x: 5,
  y: 5,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

describe('pieces', () => {
  it('tidies a ring: repeated corners go, the ring never closes on itself', () => {
    expect(
      tidy([
        [0, 0],
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ])
  })

  it('winds every piece the same way', () => {
    const clockwise: Poly = [
      [0, 0],
      [2, 0],
      [2, 2],
    ]
    expect(facing([...clockwise].reverse())).toEqual(clockwise)
  })

  it('welds corners two centimetres apart into one', () => {
    const [a, b] = weld(
      [
        RECT(2, 2),
        [
          [2.015, 0],
          [4, 0],
          [4, 2],
          [2.015, 2],
        ],
      ],
      0.02,
    )
    expect(b!.some((p) => p[0] === a!.find((q) => q[0] === 2)![0])).toBe(true)
  })

  it('keeps one side of a line and drops the rest', () => {
    expect(polyArea(clipHalf(RECT(2, 2), [1, 0], [1, 2], 1))).toBe(2)
  })

  it('takes one convex piece out of another, exactly', () => {
    const pieces = diffConvex(RECT(4, 4), [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
    ])
    expect(r2(pieces.reduce((s, p) => s + polyArea(p), 0))).toBe(12)
    expect(pieces.every((p) => p.length >= 3)).toBe(true)
  })

  it('gives the piece two shapes share, or nothing', () => {
    expect(polyArea(intersectConvex(RECT(4, 4), RECT(2, 2))!)).toBe(4)
    expect(
      intersectConvex(RECT(1, 1), [
        [5, 5],
        [6, 5],
        [6, 6],
      ]),
    ).toBeNull()
  })

  it('measures a sliver by its width across its longest side', () => {
    expect(
      thinness([
        [0, 0],
        [10, 0],
        [10, 0.005],
        [0, 0.005],
      ]),
    ).toBeCloseTo(0.005, 6)
  })
})

describe('the walls a room shows', () => {
  it('drops the seam between two pieces that sit against each other', () => {
    const { segs } = outlineFrom([
      RECT(2, 2),
      [
        [2, 0],
        [4, 0],
        [4, 2],
        [2, 2],
      ],
    ])
    const along = segs.map((s) => r2(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])))
    expect(segs.length).toBe(4)
    expect(along.filter((l) => l === 4).length).toBe(2)
    expect(segs.some((s) => s.a[0] === 2 && s.b[0] === 2)).toBe(false)
  })

  it('says which pieces lie against which, so the parts are found', () => {
    const joined = [
      RECT(2, 2),
      [
        [2, 0],
        [4, 0],
        [4, 2],
        [2, 2],
      ] as Poly,
    ]
    expect(outlineFrom(joined).against.length).toBe(1)
    expect(partsOf(joined).length).toBe(1)
    expect(
      partsOf([
        RECT(2, 2),
        [
          [9, 9],
          [10, 9],
          [10, 10],
          [9, 10],
        ],
      ]).length,
    ).toBe(2)
  })

  it('chains the walls into a closed loop', () => {
    const loops = chainWalls(outlineFrom([RECT(3, 2)]).segs)
    expect(loops!.length).toBe(1)
    expect(loops![0]!.length).toBe(4)
  })

  it('names a whole side of a plain room, and nothing on a carved one', () => {
    const r = room()
    const sides = outlineOf(r).map((s) => sideOf(r, s))
    expect(new Set(sides)).toEqual(new Set(['left', 'right', 'top', 'bottom']))
    expect(
      sideOf(room({ pieces: [RECT(2, 2)] }), outlineOf(room({ pieces: [RECT(2, 2)] }))[0]!),
    ).toBeNull()
  })

  it('drops a corner that is not a corner and a wall too short to be one', () => {
    const poly: Poly = [
      [0, 0],
      [2, 0],
      [2, 1.999],
      [2, 2],
      [0, 2],
    ]
    expect(simplifyLoop(poly)).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ])
  })

  it('cuts any outline into convex pieces', () => {
    const L: Poly = [
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ]
    const tris = triangulate(L)
    expect(tris.length).toBe(4)
    expect(r2(tris.reduce((s, p) => s + polyArea(p), 0))).toBe(5)
  })
})

describe('a room on the plot', () => {
  it('turns a point into the world and back', () => {
    const r = room({ angle: 25 })
    const w = toWorld(r, 1, 2)
    const l = toLocal(r, w[0], w[1])
    expect([r2(l[0]), r2(l[1])]).toEqual([1, 2])
  })

  it('boxes a turned room by the corners it really has', () => {
    const b = bboxOf(room({ angle: 90 }))
    expect([r2(b.w), r2(b.h)]).toEqual([3, 4])
  })

  it('gives every wall its way out of the room', () => {
    const walls = worldWalls(room())
    expect(walls.length).toBe(4)
    expect(worldCorners(room()).length).toBe(4)
    for (const w of walls) expect(r2(Math.hypot(w.n[0], w.n[1]))).toBe(1)
  })

  it('folds a quarter turn into the rectangle so the room is square again', () => {
    const r = room({ w: 4, h: 2 })
    setAngle(r, 90)
    expect([r.w, r.h, r.angle]).toEqual([2, 4, 0])
    setAngle(r, 25)
    expect(r.angle).toBe(25)
  })
})

describe('cutting', () => {
  it('cuts one room out of another and keeps the slanted edge', () => {
    const target = room({ x: 0, y: 0, w: 4, h: 4 })
    const cutter = room({ id: 'b', x: 3, y: 3, w: 2, h: 2, angle: 45 })
    const before = areaOf(target)
    const kept = cutBy(target, cutter)!
    expect(areaOf(kept)).toBeLessThan(before)
    expect(kept.pieces).not.toBeNull()
    const shared = overlapCells(kept, cutter)
    expect(shared).toEqual([])
  })

  it('sends a room back when a cut leaves under a square metre', () => {
    const target = room({ x: 0, y: 0, w: 2, h: 1 })
    expect(cutBy(target, room({ id: 'b', x: -1, y: -1, w: 4, h: 3 }))).toBeNull()
  })

  it('cuts by the setback line and says whether anything went', () => {
    const outside = room({ x: 0, y: 5, w: 4, h: 3 })
    const out = cutToSetback(outside)
    expect(out.cut).toBe(true)
    expect(r2(areaOf(out.room!))).toBe(r2(2.5 * 3))
    expect(cutToSetback(room({ x: 5, y: 5 })).cut).toBe(false)
  })

  it('pulls a wall along its normal, the walls it meets following', () => {
    const r = room({ x: 0, y: 0, w: 4, h: 4, pieces: triangulate(RECT(4, 4)) })
    const seg = outlineOf(r).find((s) => s.n[0] === 1)!
    const pulled = pullWall(r, seg, 1)!
    expect(r2(areaOf(pulled))).toBe(20)
  })

  it('stops a wall that would turn the room inside out', () => {
    const r = room({ x: 0, y: 0, w: 4, h: 4, pieces: triangulate(RECT(4, 4)) })
    const seg = outlineOf(r).find((s) => s.n[0] === 1)!
    expect(pullWall(r, seg, -4)).toBeNull()
  })

  it('rebuilds a room from its own outline and drops the slivers', () => {
    const r = room({
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      pieces: [
        RECT(4, 4),
        [
          [4, 0],
          [4.001, 0],
          [4.001, 4],
        ],
      ],
    })
    const kept = canonicalise(r)!
    expect(r2(areaOf(kept))).toBe(16)
    expect(kept.pieces).toBeNull()
  })

  it('keeps only the largest part when a cut leaves a room in two places', () => {
    const r = room({
      x: 0,
      y: 0,
      w: 6,
      h: 2,
      pieces: [
        RECT(2, 2),
        [
          [4, 0],
          [6, 0],
          [6, 2],
          [4, 2],
        ],
      ],
    })
    const kept = canonicalise(r)!
    expect(r2(areaOf(kept))).toBe(4)
  })

  it('pulls the frame in to what is left and goes back to a rectangle when whole', () => {
    const r = room({
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      pieces: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
        ],
      ],
    })
    const out = normalise(r)!
    expect([out.x, out.y, out.w, out.h]).toEqual([1, 1, 2, 2])
    expect(out.pieces).toBeNull()
    expect(fmt(areaOf(out))).toBe('4')
  })
})
