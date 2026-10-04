import { describe, expect, it } from 'vitest'
import {
  areaOf,
  bboxOf,
  canonicalise,
  chainEdges,
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
  pullEdge,
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
  worldEdges,
} from './geometry'
import { RECT, type Poly, type Zone } from './model'

const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 'a',
  name: 'A',
  kind: 'zone',
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

describe('the edges a zone shows', () => {
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

  it('chains the edges into a closed loop', () => {
    const loops = chainEdges(outlineFrom([RECT(3, 2)]).segs)
    expect(loops!.length).toBe(1)
    expect(loops![0]!.length).toBe(4)
  })

  it('names a whole side of a plain zone, and nothing on a carved one', () => {
    const r = zone()
    const sides = outlineOf(r).map((s) => sideOf(r, s))
    expect(new Set(sides)).toEqual(new Set(['left', 'right', 'top', 'bottom']))
    expect(
      sideOf(zone({ pieces: [RECT(2, 2)] }), outlineOf(zone({ pieces: [RECT(2, 2)] }))[0]!),
    ).toBeNull()
  })

  it('drops a corner that is not a corner and an edge too short to be one', () => {
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

describe('a zone on the plot', () => {
  it('turns a point into the world and back', () => {
    const r = zone({ angle: 25 })
    const w = toWorld(r, 1, 2)
    const l = toLocal(r, w[0], w[1])
    expect([r2(l[0]), r2(l[1])]).toEqual([1, 2])
  })

  it('boxes a turned zone by the corners it really has', () => {
    const b = bboxOf(zone({ angle: 90 }))
    expect([r2(b.w), r2(b.h)]).toEqual([3, 4])
  })

  it('gives every edge its way out of the zone', () => {
    const edges = worldEdges(zone())
    expect(edges.length).toBe(4)
    expect(worldCorners(zone()).length).toBe(4)
    for (const w of edges) expect(r2(Math.hypot(w.n[0], w.n[1]))).toBe(1)
  })

  it('folds a quarter turn into the rectangle so the zone is square again', () => {
    const r = zone({ w: 4, h: 2 })
    setAngle(r, 90)
    expect([r.w, r.h, r.angle]).toEqual([2, 4, 0])
    setAngle(r, 25)
    expect(r.angle).toBe(25)
  })
})

describe('cutting', () => {
  it('cuts one zone out of another and keeps the slanted edge', () => {
    const target = zone({ x: 0, y: 0, w: 4, h: 4 })
    const cutter = zone({ id: 'b', x: 3, y: 3, w: 2, h: 2, angle: 45 })
    const before = areaOf(target)
    const kept = cutBy(target, cutter)!
    expect(areaOf(kept)).toBeLessThan(before)
    expect(kept.pieces).not.toBeNull()
    const shared = overlapCells(kept, cutter)
    expect(shared).toEqual([])
  })

  it('sends a zone back when a cut leaves under a square metre', () => {
    const target = zone({ x: 0, y: 0, w: 2, h: 1 })
    expect(cutBy(target, zone({ id: 'b', x: -1, y: -1, w: 4, h: 3 }))).toBeNull()
  })

  it('cuts by the setback line and says whether anything went', () => {
    const outside = zone({ x: 0, y: 5, w: 4, h: 3 })
    const out = cutToSetback(outside)
    expect(out.cut).toBe(true)
    expect(r2(areaOf(out.zone!))).toBe(r2(2.5 * 3))
    expect(cutToSetback(zone({ x: 5, y: 5 })).cut).toBe(false)
  })

  it('pulls an edge along its normal, the edges it meets following', () => {
    const r = zone({ x: 0, y: 0, w: 4, h: 4, pieces: triangulate(RECT(4, 4)) })
    const seg = outlineOf(r).find((s) => s.n[0] === 1)!
    const pulled = pullEdge(r, seg, 1)!
    expect(r2(areaOf(pulled))).toBe(20)
  })

  it('stops an edge that would turn the zone inside out', () => {
    const r = zone({ x: 0, y: 0, w: 4, h: 4, pieces: triangulate(RECT(4, 4)) })
    const seg = outlineOf(r).find((s) => s.n[0] === 1)!
    expect(pullEdge(r, seg, -4)).toBeNull()
  })

  it('rebuilds a zone from its own outline and drops the slivers', () => {
    const r = zone({
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

  it('keeps only the largest part when a cut leaves a zone in two places', () => {
    const r = zone({
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
    const r = zone({
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
