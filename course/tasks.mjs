/**
 * The first course's ten tasks. Each is a starting sheet built in code, one instruction in the
 * owner's plain words, and a pass condition read from the sheet the tool left behind — never from
 * what the architect said. The harder course's ten stand beside them in `harder.mjs`.
 */

import {
  areaOf,
  doorAcross,
  doorPlace,
  doorsOf,
  heightOf,
  isCourt,
  overlapsOf,
  pocketsOf,
  polyArea,
  report,
  sheetOf,
  storeyOf,
  walkTest,
} from '../src/sheet/index.ts'
import { HARDER } from './harder.mjs'
import { area, lastResult, maker, named, r2, sharedWall, untouched } from './reads.mjs'

/**
 * Four rooms round an empty middle: a pinwheel that seals the ring, so the middle is an enclosed
 * space of the size the task asks for and each of the four walls it in.
 */
function ringSheet(side) {
  const a = maker()
  const lo = 10 - side / 2
  const hi = 10 + side / 2
  return sheetOf([
    a('Family Living', 'family-living', 'shared', { x: 4, y: 4, w: hi - 4, h: lo - 4 }),
    a('Kitchen', 'kitchen', 'service', { x: hi, y: 4, w: 16 - hi, h: hi - 4 }),
    a('Dining', 'dining', 'shared', { x: lo, y: hi, w: 16 - lo, h: 16 - hi }),
    a('Store', 'store', 'service', { x: 4, y: lo, w: lo - 4, h: 16 - lo }),
  ])
}

const middle = (side) => ({ lo: 10 - side / 2, hi: 10 + side / 2, area: r2(side * side) })

const inMiddle = (point, side) => {
  const { lo, hi } = middle(side)
  return point[0] > lo && point[0] < hi && point[1] > lo && point[1] < hi
}

/** The enclosed space at the middle of the ring, as the tool counts pockets. */
const middlePocket = (sheet, side) =>
  pocketsOf(sheet, 0).find((pk) => inMiddle(pk.centre, side)) ?? null

/** Every door on the sheet, with the room it stands on and the room across it, if any. */
function doorsAcross(sheet, storey) {
  const out = []
  for (const r of sheet.rooms.filter((o) => o.placed && storeyOf(o) === storey))
    for (const d of doorsOf(r)) {
      const pl = doorPlace(r, d)
      if (!pl) continue
      out.push({ on: r, across: doorAcross(r, pl, sheet, storey), type: d.type })
    }
  return out
}

const COURSE = [
  {
    key: 't1-give',
    title: 'Give a space away',
    instruction: 'Add the space in the middle to the kitchen.',
    onScreen: 0,
    sheet: () => ringSheet(3.2),
    check(sheet) {
      const start = this.sheet()
      const space = middlePocket(start, 3.2).area
      const grew = r2(area(sheet, 'Kitchen') - area(start, 'Kitchen'))
      const left = middlePocket(sheet, 3.2)
      return {
        numbers: {
          'the space, m²': r2(space),
          'the kitchen before, m²': area(start, 'Kitchen'),
          'the kitchen now, m²': area(sheet, 'Kitchen'),
          'grew by, m²': grew,
          'enclosed space left in the middle, m²': left ? r2(left.area) : 0,
        },
        pass: Math.abs(grew - space) <= 0.2 && !left,
      }
    },
  },
  {
    key: 't2-court',
    title: 'Make a court',
    instruction: 'Make the middle a court.',
    onScreen: 0,
    sheet: () => ringSheet(3.5),
    check(sheet) {
      const space = middlePocket(this.sheet(), 3.5).area
      const courts = sheet.rooms.filter(
        (r) => isCourt(r) && inMiddle([r.x + r.w / 2, r.y + r.h / 2], 3.5),
      )
      const court = courts[0] ?? null
      return {
        numbers: {
          'the space, m²': r2(space),
          'courts at the middle': courts.length,
          'the court, m²': court ? r2(areaOf(court)) : 0,
        },
        pass: !!court && Math.abs(areaOf(court) - space) <= 0.3,
      }
    },
  },
  {
    key: 't3-court-refused',
    title: 'A court refused',
    instruction: 'Make the middle a court.',
    onScreen: 0,
    sheet: () => ringSheet(2),
    check(sheet, record) {
      const space = middlePocket(this.sheet(), 2).area
      const courts = sheet.rooms.filter((r) => isCourt(r))
      const said = lastResult(record)
      const reason = /under the 9 m² a court needs/.test(said)
      return {
        numbers: {
          'the space, m²': r2(space),
          'courts made': courts.length,
          'the sheet is as it was': untouched(this, sheet),
          "the tool's reason in the last result": reason,
        },
        pass: !courts.length && untouched(this, sheet) && reason,
      }
    },
  },
  {
    key: 't4-against',
    title: 'Against a wall',
    instruction: "Put the dining room against the kitchen's east wall.",
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([
        a('Kitchen', 'kitchen', 'service', { x: 4, y: 4, w: 4, h: 5 }),
        a('Dining', 'dining', 'shared', { x: 13, y: 14, w: 4.5, h: 4.5 }),
      ])
    },
    check(sheet) {
      const shared = sharedWall(sheet, 'Kitchen', 'Dining')
      const rep = report(sheet, 0)
      return {
        numbers: {
          'shared wall, m': shared,
          overlaps: rep.overlaps.length,
          'rooms outside the line': rep.spills.length,
        },
        pass: shared >= 2 && !rep.overlaps.length && !rep.spills.length,
      }
    },
  },
  {
    key: 't5-carve',
    title: 'Settle by carving',
    instruction: 'Settle the overlap by carving.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([
        a('Family Living', 'family-living', 'shared', { x: 4, y: 4, w: 6, h: 6 }),
        a('Store', 'store', 'service', { x: 9, y: 4, w: 4, h: 6 }),
      ])
    },
    check(sheet) {
      const start = this.sheet()
      const over = r2(
        overlapsOf(start, 0).reduce((s, o) => s + o.polys.reduce((t, p) => t + polyArea(p), 0), 0),
      )
      const lost = r2(area(start, 'Store') - area(sheet, 'Store'))
      const kept = r2(area(sheet, 'Family Living'))
      const rep = report(sheet, 0)
      return {
        numbers: {
          'the overlap, m²': over,
          'the store lost, m²': lost,
          'the family living, m²': kept,
          'overlaps left': rep.overlaps.length,
        },
        pass:
          !rep.overlaps.length &&
          Math.abs(lost - over) <= 0.3 &&
          Math.abs(kept - area(start, 'Family Living')) <= 0.05,
      }
    },
  },
  {
    key: 't6-north',
    title: 'Face north',
    instruction: 'Turn the diwaniya to face north.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([a('Diwaniya', 'diwaniya', 'reception', { x: 7, y: 8, w: 6, h: 5 })])
    },
    check(sheet) {
      const start = this.sheet()
      const r = named(sheet, 'Diwaniya')
      const angle = r ? Math.round(r.angle || 0) : 0
      return {
        numbers: {
          "the plot's north, °": sheet.plot.north,
          'the diwaniya, °': angle,
          'its area, m²': area(sheet, 'Diwaniya'),
          'its area before, m²': area(start, 'Diwaniya'),
        },
        pass:
          !!r &&
          Math.abs(angle - sheet.plot.north) <= 1 &&
          Math.abs(area(sheet, 'Diwaniya') - area(start, 'Diwaniya')) <= 0.05,
      }
    },
  },
  {
    key: 't7-open-below',
    title: 'Open to below',
    instruction: 'Make the stair hall 5 m tall.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([a('Stair Hall', 'hallway', 'circulation', { x: 6, y: 6, w: 3, h: 6 })])
    },
    check(sheet) {
      const r = named(sheet, 'Stair Hall')
      const tall = r ? r2(heightOf(r, sheet)) : 0
      const open = report(sheet, 1).openToBelow
      return {
        numbers: {
          'the storey, m': sheet.settings.storeyH,
          'the stair hall, m': tall,
          'the first storey reads open to below': open.join(', ') || 'nothing',
        },
        pass: Math.abs(tall - 5) <= 0.01 && open.includes('Stair Hall'),
      }
    },
  },
  {
    key: 't8-storey',
    title: 'Another storey, not your view',
    instruction: 'Move the bedroom to the first storey.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([a('Bedroom', 'bedroom', 'private', { x: 6, y: 6, w: 4, h: 4 })])
    },
    check(sheet, record) {
      const r = named(sheet, 'Bedroom')
      const on = r ? storeyOf(r) : -1
      return {
        numbers: {
          'the bedroom stands on storey': on,
          'the storey the desk shows': record.onScreen,
          'the bedroom is on the sheet': !!r?.placed,
        },
        pass: on === 1 && !!r?.placed && record.onScreen === 0,
      }
    },
  },
  {
    key: 't9-door',
    title: 'A door between two rooms',
    instruction: 'Put a door between them.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      const entry = a('Entry Foyer', 'entry-foyer', 'reception', { x: 6, y: 16, w: 4, h: 5 })
      entry.doors = [{ id: 'd1', type: 'street', w: 1.2, at: [2, 5], flip: false, hinge: false }]
      return sheetOf([
        entry,
        a('Family Living', 'family-living', 'shared', { x: 10, y: 16, w: 6, h: 5 }),
      ])
    },
    check(sheet) {
      const between = doorsAcross(sheet, 0).filter(
        (d) =>
          d.across &&
          [d.on.name, d.across.name].includes('Entry Foyer') &&
          [d.on.name, d.across.name].includes('Family Living'),
      )
      const walk = walkTest(sheet, 0)
      const far = named(sheet, 'Family Living')
      const entry = named(sheet, 'Entry Foyer')
      const counts =
        walk && far && entry ? [walk.count.get(entry.id) ?? 0, walk.count.get(far.id) ?? 0] : [0, 0]
      return {
        numbers: {
          'doors on the shared wall': between.length,
          'doors the entry counts': counts[0],
          'doors the family living counts': counts[1],
          'the walk reaches the family living': !!walk && walk.reached.some((r) => r === far),
        },
        pass:
          between.length === 1 &&
          counts[0] >= 1 &&
          counts[1] >= 1 &&
          !!walk &&
          walk.reached.some((r) => r === far),
      }
    },
  },
  {
    key: 't10-door-refused',
    title: 'A door refused',
    instruction: 'Put a door on its boundary wall.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([a('Store', 'store', 'service', { x: 0, y: 10, w: 5, h: 5 })])
    },
    check(sheet, record) {
      const doors = sheet.rooms.reduce((s, r) => s + doorsOf(r).length, 0)
      const said = lastResult(record)
      const reason = /boundary takes no door/.test(said)
      return {
        numbers: {
          'doors on the sheet': doors,
          "the tool's reason in the last result": reason,
        },
        pass: !doors && reason,
      }
    },
  },
]

export { COURSE, HARDER }

/** Both courses, the first ten and the harder ten, in the order they were set. */
export const TASKS = [...COURSE, ...HARDER]

export const taskNamed = (key) =>
  TASKS.find((t) => t.key === key || t.key.startsWith(`${key}-`)) ?? null
