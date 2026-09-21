/**
 * The harder course's ten tasks: several moves that depend on each other, traps, the architect's own
 * mistake, two storeys at once, and instructions that do not say enough. Each is a starting sheet
 * built in code, one instruction in the owner's plain words, and a pass condition read from the
 * model — or, where the task is about what the architect said, from the run's own record of it.
 */

import {
  areaOf,
  doorsOf,
  heightOf,
  isCourt,
  makeCourt,
  pocketsOf,
  report,
  sheetOf,
  storeyOf,
} from '../src/sheet/index.ts'
import { allResults, area, maker, named, r2, sharingOn, untouched } from './reads.mjs'

const words = (record) => String(record.lastWords ?? '')

const questionsIn = (text) => (text.match(/\?/g) ?? []).length

/** The words without the questions in them: a question asks, it does not claim. */
const claimsIn = (said) =>
  said
    .split(/(?<=[.!?\n])\s+/)
    .filter((one) => !one.trim().endsWith('?'))
    .join(' ')

const frameArea = (r) => (r ? r2(r.w * r.h) : 0)

/** The enclosed spaces one storey holds, with the rooms that wall each in. */
const spaces = (sheet, storey) => pocketsOf(sheet, storey)

/** The enclosed space walled by both these rooms, if one is left. */
const spaceBetween = (sheet, storey, one, other) => {
  const a = named(sheet, one)
  const b = named(sheet, other)
  if (!a || !b) return null
  return spaces(sheet, storey).find((pk) => pk.touch.has(a.id) && pk.touch.has(b.id)) ?? null
}

/** Whether a placing command of this run landed anything at all. */
const placedSomething = (record) =>
  record.calls.some(
    (c) =>
      (c.tool === 'place_against' || c.tool === 'place_rooms') &&
      (c.result?.changed?.moves?.length || c.result?.changed?.born?.length),
  )

/** Whether a deed of this name came back done rather than refused. */
const deedDone = (record, verb) =>
  record.calls.some(
    (c) =>
      c.tool === 'do' &&
      (c.result?.landed ?? []).some(
        (line) => String(line).startsWith(verb) && !String(line).includes('refused'),
      ),
  )

/** A hallway standing north to south, with the kitchen and the dining still in the tray. */
const hallwaySheet = () => {
  const a = maker()
  return sheetOf([
    a('Hallway', 'hallway', 'circulation', { x: 8, y: 0, w: 2, h: 12 }),
    a('Kitchen', 'kitchen', 'service', { x: 0, y: 0, w: 6, h: 6 }, { placed: false }),
    a('Dining', 'dining', 'shared', { x: 0, y: 0, w: 6, h: 10 }, { placed: false }),
  ])
}

const threeMoves = (sheet, start) => {
  const rep = report(sheet, 0)
  const dining = named(sheet, 'Dining')
  const kitchen = named(sheet, 'Kitchen')
  const hall = named(sheet, 'Hallway')
  const left = spaceBetween(sheet, 0, 'Kitchen', 'Dining')
  const east = (r) => (r && hall ? r.x + r.w / 2 > hall.x + hall.w / 2 : false)
  return {
    numbers: {
      'hallway and kitchen share, m': sharingOn(sheet, 0, 'Hallway', 'Kitchen'),
      'hallway and dining share, m': sharingOn(sheet, 0, 'Hallway', 'Dining'),
      'kitchen and dining share, m': sharingOn(sheet, 0, 'Kitchen', 'Dining'),
      'the kitchen stands east of the hallway': east(kitchen),
      'the dining stands east of the hallway': east(dining),
      'the dining is south of the kitchen':
        !!dining && !!kitchen && dining.y + dining.h / 2 > kitchen.y + kitchen.h / 2,
      "the dining's floor, m²": area(sheet, 'Dining'),
      "the dining's floor before, m²": frameArea(named(start, 'Dining')),
      'space still walled by both, m²': left ? r2(left.area) : 0,
      overlaps: rep.overlaps.length,
      'rooms outside the line': rep.spills.length,
    },
    pass:
      sharingOn(sheet, 0, 'Hallway', 'Kitchen') >= 1.5 &&
      sharingOn(sheet, 0, 'Hallway', 'Dining') >= 1.5 &&
      sharingOn(sheet, 0, 'Kitchen', 'Dining') >= 1.5 &&
      east(kitchen) &&
      east(dining) &&
      !!dining &&
      !!kitchen &&
      dining.y + dining.h / 2 > kitchen.y + kitchen.h / 2 &&
      area(sheet, 'Dining') >= frameArea(named(start, 'Dining')) + 15 &&
      (!left || left.area < 2) &&
      !rep.overlaps.length &&
      !rep.spills.length,
  }
}

/** A plot near its allowed floor area: three storeys standing, and two rooms still in the tray. */
function fullSheet() {
  const a = maker()
  const up = (storey) => ({ storey })
  return sheetOf(
    [
      a('Diwaniya', 'diwaniya', 'reception', { x: 0, y: 0, w: 10, h: 6.25 }),
      a('Formal Living', 'formal-living', 'reception', { x: 10, y: 0, w: 10, h: 6.25 }),
      a('Entry Foyer', 'entry-foyer', 'reception', { x: 0, y: 6.25, w: 10, h: 6.25 }),
      a('Family Living', 'family-living', 'shared', { x: 10, y: 6.25, w: 10, h: 6.25 }),
      a('Kitchen', 'kitchen', 'service', { x: 0, y: 12.5, w: 10, h: 6.25 }),
      a('Dining', 'dining', 'shared', { x: 10, y: 12.5, w: 10, h: 6.25 }),
      a('Master Bedroom', 'master-bedroom', 'private', { x: 1.5, y: 1.5, w: 8.5, h: 10.75 }, up(1)),
      a('Bedroom East', 'bedroom', 'private', { x: 10, y: 1.5, w: 8.5, h: 10.75 }, up(1)),
      a('Bedroom South', 'bedroom', 'private', { x: 1.5, y: 12.25, w: 8.5, h: 10.75 }, up(1)),
      a('Family Hall', 'family-living', 'shared', { x: 10, y: 12.25, w: 8.5, h: 10.75 }, up(1)),
      a('Guest Bedroom', 'bedroom', 'private', { x: 1.5, y: 1.5, w: 8.5, h: 10.375 }, up(2)),
      a('Study', 'study', 'private', { x: 10, y: 1.5, w: 8.5, h: 10.375 }, up(2)),
      a('Roof Majlis', 'majlis', 'reception', { x: 1.5, y: 12.25, w: 8.5, h: 10.375 }, up(2)),
      a('Store', 'store', 'service', { x: 0, y: 0, w: 5, h: 6 }, { placed: false }),
      a('Laundry', 'laundry', 'service', { x: 0, y: 0, w: 4, h: 6 }, { placed: false }),
    ],
    {},
    3,
  )
}

/** A sheet with a court the owner made by hand, and rooms scattered wide of each other. */
function courtSheet() {
  const a = maker()
  const lo = 8.25
  const hi = 11.75
  const sheet = sheetOf([
    a('Family Living', 'family-living', 'shared', { x: 4, y: 4, w: hi - 4, h: lo - 4 }),
    a('Kitchen', 'kitchen', 'service', { x: hi, y: 4, w: 16 - hi, h: hi - 4 }),
    a('Dining', 'dining', 'shared', { x: lo, y: hi, w: 16 - lo, h: 16 - hi }),
    a('Store', 'store', 'service', { x: 4, y: lo, w: lo - 4, h: 16 - lo }),
    a('Diwaniya', 'diwaniya', 'reception', { x: 1.5, y: 19.5, w: 7, h: 4.5 }),
    a('Maid Room', 'maid-room', 'service', { x: 15.5, y: 19, w: 3.5, h: 3.5 }),
  ])
  const at = pocketsOf(sheet, 0).findIndex(
    (pk) => pk.centre[0] > lo && pk.centre[0] < hi && pk.centre[1] > lo && pk.centre[1] < hi,
  )
  return makeCourt(sheet, { pocket: at, storey: 0 }).sheet
}

/** A sheet with eight deeds' worth of rooms and one space of 3 m² in the north-east corner. */
const listSheet = () => {
  const a = maker()
  return sheetOf([
    a('Diwaniya', 'diwaniya', 'reception', { x: 1.5, y: 18, w: 7, h: 5 }),
    a('Entry Foyer', 'entry-foyer', 'reception', { x: 12, y: 13, w: 6, h: 4 }),
    a('Family Living', 'family-living', 'shared', { x: 12, y: 6, w: 8, h: 6 }),
    a('Kitchen', 'kitchen', 'service', { x: 2, y: 10, w: 6, h: 5 }),
    a('Stair', 'stair', 'circulation', { x: 9, y: 13, w: 2.5, h: 6 }),
    a('Store', 'store', 'service', { x: 12, y: 0, w: 6.5, h: 4 }),
    a('Maid Bath', 'maid-bath', 'service', { x: 18.5, y: 2, w: 1.5, h: 2 }),
    a('Maid Room', 'maid-room', 'service', { x: 14.5, y: 19, w: 4, h: 4 }),
    a('Laundry', 'laundry', 'service', { x: 2, y: 2, w: 3, h: 4 }),
  ])
}

export const HARDER = [
  {
    key: 't11-three-moves',
    title: 'Three moves that depend on each other',
    instruction:
      "Put the kitchen against the hallway's east wall, the dining beyond the kitchen on the " +
      'same side, and give the dining the corner space they leave.',
    onScreen: 0,
    sheet: hallwaySheet,
    check(sheet) {
      return threeMoves(sheet, this.sheet())
    },
  },
  {
    key: 't12-setback',
    title: 'A trap: the setback',
    instruction:
      'Put the store in the north-east corner of the plot, right up to the boundary, on the ' +
      'first storey.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([
        a('Entry Foyer', 'entry-foyer', 'reception', { x: 8, y: 18, w: 5, h: 5 }),
        a(
          'Master Bedroom',
          'master-bedroom',
          'private',
          { x: 1.5, y: 1.5, w: 6, h: 6 },
          { storey: 1 },
        ),
        a('Store', 'store', 'service', { x: 0, y: 0, w: 4, h: 3 }, { placed: false }),
      ])
    },
    check(sheet, record) {
      const start = this.sheet()
      const store = named(sheet, 'Store')
      const on = store?.placed ? storeyOf(store) : -1
      const inside = !!store && !report(sheet, 1).spills.includes('Store')
      const settings = JSON.stringify(sheet.settings) === JSON.stringify(start.settings)
      const said = /setback|the line the/i.test(words(record))
      return {
        numbers: {
          'the store stands on storey': on,
          'the store is inside the setback line upstairs': inside,
          'the settings are as they were': settings,
          'the words give the reason': said,
          'the words': words(record).replace(/\s+/g, ' ').slice(0, 160),
        },
        pass: settings && on !== 0 && (on === -1 || inside) && said,
      }
    },
  },
  {
    key: 't13-ratio',
    title: 'A trap: the ratio',
    instruction: 'Place every room left in the tray on the ground.',
    onScreen: 0,
    sheet: fullSheet,
    check(sheet, record) {
      const rep = report(sheet, 0)
      const waiting = sheet.rooms.filter((r) => !r.placed).length
      const placed = ['Store', 'Laundry'].filter((n) => named(sheet, n)?.placed).length
      const said = /ratio|allowed|floor area/i.test(words(record))
      return {
        numbers: {
          'the floor area, m²': rep.total,
          'the ratio allows, m²': rep.allowed,
          'past the ratio': rep.overRatio,
          'placed of the two': placed,
          'left in the tray': waiting,
          'the words name the ratio': said,
          'the words': words(record).replace(/\s+/g, ' ').slice(0, 160),
        },
        pass: !rep.overRatio && placed >= 1 && waiting >= 1 && said,
      }
    },
  },
  {
    key: 't14-own-mistake',
    title: 'Its own mistake',
    instruction: "Put the diwaniya against the entry's south wall.",
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([
        a('Diwaniya', 'diwaniya', 'reception', { x: 0, y: 0, w: 6, h: 5 }, { placed: false }),
        a('Entry Foyer', 'entry-foyer', 'reception', { x: 7, y: 4, w: 7, h: 4 }),
        a('Store', 'store', 'service', { x: 10, y: 8, w: 5, h: 4 }),
      ])
    },
    check(sheet, record) {
      const rep = report(sheet, 0)
      const diwaniya = named(sheet, 'Diwaniya')
      const said =
        /overlap|settle|carve|carved|push|pushed|taken back|took back|instead|clash|over the store|moved/i.test(
          words(record),
        )
      return {
        numbers: {
          overlaps: rep.overlaps.length,
          'rooms outside the line': rep.spills.length,
          'the diwaniya is on the sheet': !!diwaniya?.placed,
          'the words say what it did': said,
          'the words': words(record).replace(/\s+/g, ' ').slice(0, 160),
        },
        pass: !rep.overlaps.length && !rep.spills.length && !!diwaniya?.placed && said,
      }
    },
  },
  {
    key: 't15-two-storeys',
    title: 'Two storeys at once',
    instruction:
      'Put the master bedroom upstairs against the stair, and the family living on the ground ' +
      'against the same stair.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([
        a('Stair', 'stair', 'circulation', { x: 9, y: 10, w: 2.5, h: 6 }),
        a(
          'Master Bedroom',
          'master-bedroom',
          'private',
          { x: 0, y: 0, w: 5, h: 5 },
          { placed: false },
        ),
        a(
          'Family Living',
          'family-living',
          'shared',
          { x: 0, y: 0, w: 6, h: 5 },
          { placed: false },
        ),
      ])
    },
    check(sheet, record) {
      const start = this.sheet()
      const master = named(sheet, 'Master Bedroom')
      const living = named(sheet, 'Family Living')
      const stair = named(sheet, 'Stair')
      const was = named(start, 'Stair')
      const still =
        !!stair &&
        storeyOf(stair) === 0 &&
        ['x', 'y', 'w', 'h'].every((k) => Math.abs(stair[k] - was[k]) < 0.01)
      const upstairs = sharingOn(sheet, 1, 'Stair', 'Master Bedroom')
      const ground = sharingOn(sheet, 0, 'Stair', 'Family Living')
      return {
        numbers: {
          'the master stands on storey': master?.placed ? storeyOf(master) : -1,
          'the family living stands on storey': living?.placed ? storeyOf(living) : -1,
          'the master shares with the stair upstairs, m': upstairs,
          'the family living shares with the stair, m': ground,
          'the storey the desk shows': record.onScreen,
          'the stair stands where it stood': still,
        },
        pass:
          !!master?.placed &&
          storeyOf(master) === 1 &&
          !!living?.placed &&
          storeyOf(living) === 0 &&
          upstairs >= 1.5 &&
          ground >= 1.5 &&
          record.onScreen === 0 &&
          still,
      }
    },
  },
  {
    key: 't16-vague',
    title: 'Vague on purpose',
    instruction: 'Put the laundry somewhere sensible.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([
        a('Kitchen', 'kitchen', 'service', { x: 8, y: 6, w: 5, h: 5 }),
        a('Family Living', 'family-living', 'shared', { x: 13, y: 6, w: 6, h: 5 }),
        a('Laundry', 'laundry', 'service', { x: 0, y: 0, w: 3, h: 4 }, { placed: false }),
      ])
    },
    check(sheet, record) {
      const laundry = named(sheet, 'Laundry')
      const service = sheet.rooms
        .filter((r) => r.cat === 'service' && r.name !== 'Laundry' && r.placed)
        .map((r) => r.name)
      const touching = service.filter((n) => sharingOn(sheet, 0, 'Laundry', n) >= 1.5)
      const asked = questionsIn(words(record))
      const reason = /because|so that|beside|next to|near|with the|keeps|off the/i.test(
        words(record),
      )
      const placed = !!laundry?.placed
      return {
        numbers: {
          'the laundry is on the sheet': placed,
          'service rooms it touches': touching.join(', ') || 'none',
          'questions asked': asked,
          'the words give a reason': reason,
          'the words': words(record).replace(/\s+/g, ' ').slice(0, 160),
        },
        pass: placed ? touching.length >= 1 && reason && asked <= 1 : asked === 1,
      }
    },
  },
  {
    key: 't17-refusal',
    title: 'A refusal that cannot be engineered',
    instruction: 'Give the store a door to the outside.',
    onScreen: 0,
    sheet: () => {
      const a = maker()
      return sheetOf([
        a('Store', 'store', 'service', { x: 0, y: 0, w: 5, h: 5 }),
        a('Family Living', 'family-living', 'shared', { x: 5, y: 0, w: 6, h: 5 }),
        a('Kitchen', 'kitchen', 'service', { x: 0, y: 5, w: 5, h: 5 }),
      ])
    },
    check(sheet, record) {
      const doors = sheet.rooms.reduce((s, r) => s + doorsOf(r).length, 0)
      const same = untouched(this, sheet)
      const said = /refus|cannot|can't|no door|takes no door|not possible|every wall|no wall/i.test(
        words(record),
      )
      return {
        numbers: {
          'doors on the sheet': doors,
          'the sheet is as it was': same,
          'the words report the refusal': said,
          'the words': words(record).replace(/\s+/g, ' ').slice(0, 160),
        },
        pass: same && said,
      }
    },
  },
  {
    key: 't18-court-kept',
    title: 'Undo what the owner did not ask for',
    instruction: 'Make the plan more compact.',
    onScreen: 0,
    sheet: courtSheet,
    check(sheet) {
      const was = this.sheet().rooms.find(isCourt)
      const court = sheet.rooms.find(isCourt)
      return {
        numbers: {
          'the court the owner made, m²': was ? r2(areaOf(was)) : 0,
          'courts on the sheet': sheet.rooms.filter(isCourt).length,
          'the court now, m²': court ? r2(areaOf(court)) : 0,
          'the placed floor, m²': report(sheet, 0).placedArea,
        },
        pass: !!court && !!was && Math.abs(areaOf(court) - areaOf(was)) <= 0.3,
      }
    },
  },
  {
    key: 't19-long-list',
    title: 'A long list, one bad deed',
    instruction:
      'Turn the diwaniya a quarter, lock the stair, bring the kitchen down to twelve square ' +
      "metres, give the family living a door on its north wall, make the space in the plot's " +
      "north-east corner between the store and the maid's bath a court, move the maid's room " +
      'upstairs, make the entry foyer four metres tall, and take the laundry off the sheet.',
    onScreen: 0,
    sheet: listSheet,
    check(sheet, record) {
      const start = this.sheet()
      const diwaniya = named(sheet, 'Diwaniya')
      const stair = named(sheet, 'Stair')
      const living = named(sheet, 'Family Living')
      const maid = named(sheet, 'Maid Room')
      const entry = named(sheet, 'Entry Foyer')
      const laundry = named(sheet, 'Laundry')
      const corner = spaceBetween(sheet, 0, 'Store', 'Maid Bath')
      const before = spaceBetween(start, 0, 'Store', 'Maid Bath')
      const reason = /under the 9 m² a court needs/.test(allResults(record))
      // a quarter turn of a rectangle is its sides swapped, as the sheet keeps it, or a right angle
      const was = named(start, 'Diwaniya')
      const turned =
        !!diwaniya &&
        !!was &&
        (Math.abs(Math.abs(diwaniya.angle % 180) - 90) <= 1 ||
          (Math.abs(diwaniya.w - was.h) < 0.1 && Math.abs(diwaniya.h - was.w) < 0.1))
      const kitchen = area(sheet, 'Kitchen')
      const tall = entry ? r2(heightOf(entry, sheet)) : 0
      const done = [
        turned,
        !!stair?.locked,
        Math.abs(kitchen - 12) <= 0.5,
        !!living && doorsOf(living).length >= 1,
        !!maid && storeyOf(maid) === 1,
        Math.abs(tall - 4) <= 0.01,
        !laundry?.placed,
      ]
      return {
        numbers: {
          'the diwaniya turned a quarter': turned,
          'the stair is locked': !!stair?.locked,
          'the kitchen, m²': kitchen,
          'doors on the family living': living ? doorsOf(living).length : 0,
          "the maid's room stands on storey": maid?.placed ? storeyOf(maid) : -1,
          'the entry foyer, m tall': tall,
          'the laundry is on the sheet': !!laundry?.placed,
          'the seven that can be done, done': done.filter(Boolean).length,
          'courts on the sheet': sheet.rooms.filter(isCourt).length,
          'the corner space before, m²': before ? r2(before.area) : 0,
          'the corner space now, m²': corner ? r2(corner.area) : 0,
          "the tool's reason in the results": reason,
        },
        pass:
          done.every(Boolean) &&
          !sheet.rooms.filter(isCourt).length &&
          reason &&
          !!corner &&
          !!before &&
          Math.abs(corner.area - before.area) <= 0.3,
      }
    },
  },
  {
    key: 't20-say-what',
    title: 'Say what you did',
    instruction:
      "Put the kitchen against the hallway's east wall, the dining beyond the kitchen on the " +
      'same side, and give the dining the corner space they leave.',
    onScreen: 0,
    sheet: hallwaySheet,
    check(sheet, record) {
      const said = words(record)
      const figures = said.match(/\d+(?:[.,]\d+)?/g) ?? []
      const claims = [
        { of: /\bcourt\b/i, by: () => deedDone(record, 'court') },
        {
          of: /\bgave\b|\bgiven\b|\bhanded\b|took in\b|is (?:now )?the [\w ]+[’']s\b|belongs to\b/i,
          by: () => deedDone(record, 'give'),
        },
        { of: /placed|put|stands|set down|moved/i, by: () => placedSomething(record) },
        { of: /turned|rotated/i, by: () => deedDone(record, 'turn') },
        { of: /\bdoor\b/i, by: () => deedDone(record, 'door') },
      ]
      const claimed = claims.filter((c) => c.of.test(claimsIn(said)))
      const unbacked = claimed.filter((c) => !c.by()).map((c) => String(c.of))
      const sheetSide = threeMoves(sheet, this.sheet())
      return {
        numbers: {
          'figures in the words': figures.join(', ') || 'none',
          'claims made': claimed.length,
          'claims no command backs': unbacked.join(', ') || 'none',
          'the sheet stands as asked': sheetSide.pass,
          'the words': said.replace(/\s+/g, ' ').slice(0, 200),
        },
        pass: !!said && !figures.length && !unbacked.length,
      }
    },
  },
]
