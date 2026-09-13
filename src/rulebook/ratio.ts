/*
 * Kuwait Municipality, private and model housing, البند الأول: the building ratio, and nothing
 * else. The known house is the reference case — 400 m² of plot is allowed 960 m², which is the
 * 350 to 400 row — and confirms that the basement and the roof stair house are left out. The tool
 * has neither of those yet, so every storey it draws counts.
 */

/** The share of the plot the table allows on a plot the concessions do not reach. */
const RATIO = 2.1

/** A row of the table: the largest plot it covers, and what a plot of that size may hold. */
const rows: readonly {
  readonly upTo: number
  readonly allows: (plotAreaM2: number) => number
}[] = [
  { upTo: 349, allows: () => 800 },
  { upTo: 400, allows: (plot) => plot * RATIO + 120 },
  { upTo: Infinity, allows: (plot) => plot * RATIO },
]

/**
 * The smallest plot the table has a row for. Under it the page grants no concession at all, so
 * the general 210% stands rather than the 800 m² a 250 m² plot is given: the two small-plot rows
 * are allowances the page makes from 250 m² up, and reading them lower would hand a plot more
 * floor than the Municipality has offered it.
 */
const SMALLEST_ROW_M2 = 250

/** The gross floor area the Municipality allows on a plot of this size, in m². */
export function allowedFloorArea(plotAreaM2: number): number {
  const plot = Math.max(0, plotAreaM2)
  if (plot < SMALLEST_ROW_M2) return plot * RATIO
  const row = rows.find((each) => plot <= each.upTo)
  return row ? row.allows(plot) : plot * RATIO
}
