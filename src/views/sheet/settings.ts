/**
 * The settings window's rows, as the frozen mock has them: nine tabs, every setting of the sheet
 * with the one line that says what it does. Nothing settable stays only in code, so this list is
 * the window's whole content and a test fails if a setting of `DEFAULTS` has no row here.
 */

import type { Settings } from '../../sheet'

type SettingName = keyof Settings

/** A switch or a short list of choices, each choice a button. */
type SegRow = {
  kind: 'seg'
  name: SettingName
  label: string
  hint?: string
  choices: { value: string | number; label: string }[]
}

/** A number pulled on a slider, read in its own unit. */
type RangeRow = {
  kind: 'range'
  name: SettingName
  label: string
  hint?: string
  min: number
  max: number
  step: number
  unit: string
}

/** A choice too wordy for buttons. */
type SelectRow = {
  kind: 'select'
  name: SettingName
  label: string
  hint?: string
  choices: { value: string; label: string }[]
}

/** A swatch per category, each with a colour picker. */
type ColourRow = { kind: 'colour'; name: 'colors'; label: string; hint: string }

/** A rule of the tool that is not a setting, said where the owner looks for it. */
type NoteRow = { kind: 'note'; label: string; hint: string }

export type Row = SegRow | RangeRow | SelectRow | ColourRow | NoteRow

type Tab = { title: string; rows: Row[] }

const onOff = (on: string, off: string) => [
  { value: 1, label: on },
  { value: 0, label: off },
]

export const CATEGORY_LABEL: Record<string, string> = {
  reception: 'Reception',
  shared: 'Shared',
  private: 'Private',
  service: 'Service',
  circulation: 'Circulation',
  open: 'Open ground',
}

export const TABS: Tab[] = [
  {
    title: 'Landing and overlaps',
    rows: [
      {
        kind: 'seg',
        name: 'rule',
        label: 'When a room lands on another',
        choices: [
          { value: 'wait', label: 'Wait' },
          { value: 'push', label: 'Push others' },
        ],
        hint: 'Wait: the room lands where you put it, the overlap is tinted and nothing moves until you settle it. Push others: the rooms lower in the program slide aside at once, never shrinking. The same switch sits above the sheet.',
      },
      {
        kind: 'seg',
        name: 'yieldKeeps',
        label: 'A room that gives way keeps',
        choices: [
          { value: 'rect', label: 'A squared-off room' },
          { value: 'rest', label: 'Everything but the overlap' },
        ],
        hint: 'Settling by giving way cuts the newer room back: squared off on the side that loses least, or left standing as an L with only the overlap taken out.',
      },
      {
        kind: 'seg',
        name: 'allowSpill',
        label: 'Rooms may leave the buildable line',
        choices: onOff('Yes, shown', 'No, held in'),
        hint: 'Yes: a room can stand past the setback line and is flagged in the sentence. No: every move is held inside the line the ground floor may reach.',
      },
      {
        kind: 'range',
        name: 'hallW',
        label: 'Hallway width',
        min: 1.2,
        max: 2.4,
        step: 0.1,
        unit: ' m',
        hint: "The width of every hallway block, in the program and on the sheet. The Municipality's least is 1.2 m clear.",
      },
      {
        kind: 'note',
        label: 'Settling an overlap',
        hint: "Select the zone, or several, and right-click. Carve below cuts their shape out of the zones under them; Push others slides the zones under them aside. The program's order is the order of importance: drag the grip at the left of a block to move it up or down.",
      },
    ],
  },
  {
    title: 'Snapping',
    rows: [
      {
        kind: 'range',
        name: 'snapDist',
        label: "Snap to neighbours' walls and corners",
        min: 0,
        max: 1,
        step: 0.05,
        unit: ' m',
        hint: 'How close, in metres, a moved room or a drawn point must come to a wall or corner before it is pulled onto it. Nought turns snapping off.',
      },
      {
        kind: 'seg',
        name: 'grid',
        label: 'Grid',
        choices: [
          { value: 0, label: 'Off' },
          { value: 0.25, label: '0.25 m' },
          { value: 0.5, label: '0.5 m' },
          { value: 1, label: '1 m' },
        ],
        hint: 'Positions and drawn points land on this grid when nothing nearer catches them. Arrows nudge by one grid step.',
      },
      {
        kind: 'range',
        name: 'closeGap',
        label: 'Close gaps narrower than',
        min: 0,
        max: 0.5,
        step: 0.05,
        unit: ' m',
        hint: "After every move, a wall facing a neighbour's wall closer than this is pulled onto it, so rooms share a wall instead of leaving a sliver. Nought turns it off.",
      },
      {
        kind: 'seg',
        name: 'snapBuild',
        label: 'Snap to the setback and plot lines',
        choices: onOff('On', 'Off'),
        hint: 'The setback line and the plot boundary count as walls to snap to, when moving, dragging a wall, or drawing.',
      },
      {
        kind: 'seg',
        name: 'guides',
        label: 'Alignment guides while moving',
        choices: onOff('On', 'Off'),
        hint: 'The thin blue lines that show which wall or corner a move has lined up with.',
      },
      {
        kind: 'seg',
        name: 'sharedWalls',
        label: 'A shared wall drags both rooms',
        choices: onOff('On', 'Off'),
        hint: 'Dragging a wall that two rooms share moves it for both. Off, only the room you took it from changes.',
      },
      {
        kind: 'seg',
        name: 'rotSnap',
        label: 'Turning snaps to',
        choices: [
          { value: 0, label: 'Free' },
          { value: 5, label: '5°' },
          { value: 15, label: '15°' },
          { value: 45, label: '45°' },
        ],
        hint: "The knob above a selected room turns it; the turn lands on these steps. A neighbour's angle catches it whatever the step. R gives a quarter turn.",
      },
      {
        kind: 'seg',
        name: 'turnFrom',
        label: 'Turning counts from',
        choices: [
          { value: 'sheet', label: 'The sheet' },
          { value: 'north', label: 'North' },
        ],
        hint: 'With North, the turn steps land on north and its quarters, so a room turned by hand faces north without hunting. Right-click a room for Face north.',
      },
    ],
  },
  {
    title: 'Drawing and Reshape',
    rows: [
      {
        kind: 'seg',
        name: 'snapSquare',
        label: 'Square to a wall while drawing',
        choices: onOff('On', 'Off'),
        hint: 'From a corner that sits on a wall, a guide rises at a right angle for the next side to follow; near a wall, the point lands where the side meets it square.',
      },
      {
        kind: 'seg',
        name: 'pocketKeeps',
        label: 'A room that takes a space keeps',
        choices: [
          { value: 'shape', label: "The space's shape" },
          { value: 'square', label: 'A squared-off room' },
        ],
        hint: 'When an enclosed empty space is given to a room, the room can take the space’s exact shape, or square itself off round it where that overlaps nothing.',
      },
      {
        kind: 'note',
        label: 'Reshape',
        hint: 'Reshape has no settings of its own: it draws with the snaps above, takes away what overlaps the room, adds a touching shape outside, and splits off the smaller part into the program when a stroke cuts the room in two.',
      },
    ],
  },
  {
    title: 'Doors and openings',
    rows: [
      {
        kind: 'range',
        name: 'jamb',
        label: 'Jamb from the corner',
        min: 0.05,
        max: 0.5,
        step: 0.05,
        unit: ' m',
        hint: 'A placed door snaps this far from the nearest corner of its wall, or to the middle of the wall. A selected door’s width is changed with − and +.',
      },
      {
        kind: 'note',
        label: 'Rules that are not settings',
        hint: 'A wall on the plot boundary takes no door. A shared wall takes one door for both rooms. Open wall takes out only the stretch two rooms share, never past a corner.',
      },
    ],
  },
  {
    title: 'Labels',
    rows: [
      {
        kind: 'seg',
        name: 'showArea',
        label: 'Area written on the room',
        choices: onOff('Shown', 'Only in the program'),
        hint: "The program list always shows each room's area against its target. A room short of its target shows its shortfall on the sheet either way.",
      },
      {
        kind: 'seg',
        name: 'dims',
        label: 'Temporary dimensions',
        choices: [
          { value: 'all', label: 'Size and gaps' },
          { value: 'size', label: 'Size only' },
          { value: 'none', label: 'None' },
        ],
        hint: 'The blue numbers round a selected room: its width and depth, and the gaps to the neighbours and the lines. Click a number to type it.',
      },
      {
        kind: 'range',
        name: 'dimSize',
        label: 'Dimension text',
        min: 0.25,
        max: 0.7,
        step: 0.05,
        unit: ' m',
        hint: 'The size of those numbers on the sheet, in metres of plan.',
      },
      {
        kind: 'range',
        name: 'tagDelay',
        label: 'Hover tag after',
        min: 0.5,
        max: 6,
        step: 0.5,
        unit: ' s',
        hint: 'How long the pointer rests on a room before a tag beside it gives the full name and the area against target.',
      },
      {
        kind: 'note',
        label: 'Names',
        hint: 'A name is laid where its box fits clear of every other room, upright or along the room, shrinking and then falling to initials only when it must. Select a room and drag its name to place it by hand; right-click to put it back.',
      },
    ],
  },
  {
    title: 'Spaces and boundary',
    rows: [
      {
        kind: 'seg',
        name: 'boundary',
        label: 'Build to the boundary on the ground',
        choices: [
          { value: 'off', label: 'Off' },
          { value: 'sides', label: 'Neighbour sides' },
          { value: 'all', label: 'Sides and street' },
        ],
        hint: 'The Municipality lets the ground floor stand on the boundary toward neighbours, and toward the service street for half the frontage, at most 15 m: 10 m on this plot. Such walls are blind and one storey; the reading under the sheet turns red past the budget. The same switch sits above the sheet.',
      },
      {
        kind: 'seg',
        name: 'showPockets',
        label: 'Enclosed empty spaces',
        choices: onOff('Shown', 'Hidden'),
        hint: 'Right-click any empty space closed by rooms and the setback line to give it to one of them, make it a court, or make it a corridor. Shown tints such spaces grey as well.',
      },
      {
        kind: 'range',
        name: 'courtArea',
        label: 'A court needs at least',
        min: 4,
        max: 20,
        step: 1,
        unit: ' m²',
        hint: "and room for a square of the side below. The Municipality's light well is 9 m² with a 1.5 m side.",
      },
      {
        kind: 'range',
        name: 'courtSide',
        label: "That square's side",
        min: 1,
        max: 3,
        step: 0.25,
        unit: ' m',
      },
    ],
  },
  {
    title: 'Motion',
    rows: [
      {
        kind: 'range',
        name: 'dur',
        label: 'Push animation',
        min: 0,
        max: 1500,
        step: 20,
        unit: ' ms',
        hint: 'How long a pushed room takes to slide to its new place. Nought is instant.',
      },
      {
        kind: 'select',
        name: 'ease',
        label: 'How a pushed room comes to rest',
        choices: [
          { value: 'cubic-bezier(.2,.7,.2,1)', label: 'Slows into place' },
          { value: 'cubic-bezier(.34,1.4,.64,1)', label: 'Overshoots a little, then settles' },
          { value: 'linear', label: 'Moves at one speed and stops' },
        ],
        hint: 'The shape of the motion, not its length; the length is the slider above.',
      },
      {
        kind: 'range',
        name: 'punch',
        label: 'Exaggerate the motion',
        min: 1,
        max: 5,
        step: 0.5,
        unit: '×',
        hint: 'How far a pushed room overshoots before it settles back, and how much it squashes on the way. 1 is quiet.',
      },
    ],
  },
  {
    title: 'Colours',
    rows: [
      {
        kind: 'colour',
        name: 'colors',
        label: 'Room colours by category',
        hint: "Every room of a category takes its colour, on the sheet and in the program. Right-click a room for a colour of its own; the same menu puts it back to its category's colour. Colours save with the sheet and go into the spec.",
      },
      {
        kind: 'range',
        name: 'tint',
        label: 'Overlap tint',
        min: 0.1,
        max: 0.6,
        step: 0.05,
        unit: '',
        hint: 'How strongly the part where two rooms overlap is tinted while it lasts.',
      },
    ],
  },
  {
    title: 'Storeys',
    rows: [
      {
        kind: 'range',
        name: 'storeyH',
        label: 'Ground storey height',
        min: 3,
        max: 4.5,
        step: 0.1,
        unit: ' m',
      },
      {
        kind: 'range',
        name: 'storeyH1',
        label: 'First storey height',
        min: 3,
        max: 4.5,
        step: 0.1,
        unit: ' m',
      },
      {
        kind: 'range',
        name: 'storeyH2',
        label: 'Second storey height',
        min: 3,
        max: 4.5,
        step: 0.1,
        unit: ' m',
        hint: "Floor to floor, each storey its own. The storey above stands on it; a zone's height snaps to it as the floor above, and a zone taller than it is open to below on the floor above.",
      },
      {
        kind: 'range',
        name: 'maxHeight',
        label: 'Building height',
        min: 9,
        max: 20,
        step: 0.5,
        unit: ' m',
        hint: "How high the knob on a zone's post can pull it: the rulebook's 15 m.",
      },
      {
        kind: 'range',
        name: 'stairTop',
        label: "The stair's top, at most",
        min: 9,
        max: 21,
        step: 0.5,
        unit: ' m',
        hint: "How high the stair, one across storeys, may be pulled: the rulebook's 15 m and a stair house of 3 m on the roof. Unset, it reaches the top storey's roof.",
      },
      {
        kind: 'seg',
        name: 'snapStoreys',
        label: 'Snap to the storeys below and above',
        choices: onOff('On', 'Off'),
        hint: 'Moving or stretching a zone, its walls and corners land on the outlines of the zones one storey down and one storey up, as they do on neighbours of its own storey.',
      },
      {
        kind: 'seg',
        name: 'streetLabels',
        label: 'Street names',
        choices: onOff('Shown', 'Hidden'),
        hint: '"Service street", "side street" and "neighbours · north" round the plot, on the sheet and in the mass.',
      },
      {
        kind: 'seg',
        name: 'showUnder',
        label: 'Ground floor shown under the first',
        choices: onOff('Shown faint', 'Hidden'),
        hint: "On the first storey's sheet the ground floor's outlines show faint, to build over them.",
      },
      {
        kind: 'seg',
        name: 'stairAcross',
        label: 'The stair',
        choices: onOff('One across storeys', 'A room per storey'),
        hint: 'One across: the stair stands on both storeys at the same place, moved from either, and upstairs the walk test starts from it. A room per storey: it is an ordinary zone.',
      },
      {
        kind: 'seg',
        name: 'openBelow',
        label: 'Open to below',
        choices: onOff('Shown as an X', 'Off'),
        hint: 'A ground zone taller than the storey shows on the first storey as its footprint with an X. It takes that space: nothing lands on it, and walls snap to it.',
      },
      {
        kind: 'seg',
        name: 'hardSetback',
        label: 'Setback upstairs',
        choices: onOff('Held hard', 'As the ground'),
        hint: 'The Municipality lets only the ground floor stand on the boundary. Held hard, upstairs zones are kept inside the setback line whatever the boundary setting says.',
      },
      {
        kind: 'seg',
        name: 'ratioWarn',
        label: 'Building ratio',
        choices: onOff('Read', 'Quiet'),
        hint: 'The sentence adds every storey and reads them against 210% of the plot, 1,050 m² here; over it turns red.',
      },
    ],
  },
]

/** The category colours as the sheet's own variables, so a swatch changed paints every room. */
const COLOUR_VAR: Record<string, string> = {
  reception: '--reception',
  shared: '--shared',
  private: '--private',
  service: '--service',
  circulation: '--circ',
  open: '--open',
}

export const colourVars = (settings: Settings): Record<string, string> =>
  Object.fromEntries(
    Object.entries(settings.colors).map(([category, colour]) => [
      COLOUR_VAR[category] ?? `--${category}`,
      colour,
    ]),
  )

/** Every setting the window has a row for. */
export const rowNames = (): SettingName[] =>
  TABS.flatMap((tab) => tab.rows.flatMap((row) => (row.kind === 'note' ? [] : [row.name])))

/** The tab to open on: the one for the step in use, else the one last left open. */
export function tabFor(doing: 'drawing' | 'zoning', remembered: number): number {
  if (doing === 'drawing') return TABS.findIndex((tab) => tab.title === 'Drawing and Reshape')
  return remembered >= 0 && remembered < TABS.length ? remembered : 0
}

/** How a setting's value reads beside its label. */
export function valueRead(row: Row, settings: Settings): string {
  if (row.kind !== 'range') return ''
  const held = settings[row.name]
  return `${typeof held === 'number' ? held : Number(held)}${row.unit}`
}
