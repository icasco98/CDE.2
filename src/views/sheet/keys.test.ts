import { describe, expect, it } from 'vitest'
import { keyCommand, keyRelease, type KeyWorld } from './keys'

const idle: KeyWorld = {
  typing: false,
  selected: 1,
  drawing: false,
  polygon: 0,
  reshaping: false,
  measuring: false,
  dragging: false,
  openings: false,
  doorSelected: false,
  grid: 0.25,
}

const openings: KeyWorld = { ...idle, selected: 0, openings: true, doorSelected: true }

describe('the sheet’s keys', () => {
  it('turns a quarter on R and sends back on Delete', () => {
    expect(keyCommand({ key: 'r' }, idle)).toEqual({ kind: 'quarter-turn' })
    expect(keyCommand({ key: 'Delete' }, idle)).toEqual({ kind: 'send-back' })
    expect(keyCommand({ key: 'Delete' }, { ...idle, selected: 0 })).toBeNull()
  })

  it('nudges a grid step, and a metre with Shift', () => {
    expect(keyCommand({ key: 'ArrowRight' }, idle)).toEqual({ kind: 'nudge', dx: 0.25, dy: 0 })
    expect(keyCommand({ key: 'ArrowUp', shiftKey: true }, idle)).toEqual({
      kind: 'nudge',
      dx: 0,
      dy: -1,
    })
    expect(keyCommand({ key: 'ArrowUp' }, { ...idle, grid: 0 })).toEqual({
      kind: 'nudge',
      dx: 0,
      dy: -0.25,
    })
  })

  it('leaves the arrows alone while a drag or a drawing is in hand', () => {
    expect(keyCommand({ key: 'ArrowLeft' }, { ...idle, dragging: true })).toBeNull()
    expect(keyCommand({ key: 'ArrowLeft' }, { ...idle, drawing: true })).toBeNull()
  })

  it('measures on M and fits on F', () => {
    expect(keyCommand({ key: 'm' }, idle)).toEqual({ kind: 'measure' })
    expect(keyCommand({ key: 'F' }, idle)).toEqual({ kind: 'fit' })
  })

  it('holds the sheet for panning while Space is down', () => {
    expect(keyCommand({ key: ' ' }, idle)).toEqual({ kind: 'pan-held', held: true })
    expect(keyRelease({ key: ' ' })).toEqual({ kind: 'pan-held', held: false })
    expect(keyRelease({ key: 'r' })).toBeNull()
  })

  it('closes a polygon on Enter once it has three corners', () => {
    const drawing = { ...idle, drawing: true, polygon: 3 }
    expect(keyCommand({ key: 'Enter' }, drawing)).toEqual({ kind: 'close-polygon' })
    expect(keyCommand({ key: 'Enter' }, { ...drawing, polygon: 2 })).toBeNull()
  })

  it('applies a reshape on Enter and cancels it on Esc, clearing a polygon first', () => {
    const reshaping = { ...idle, reshaping: true, drawing: true }
    expect(keyCommand({ key: 'Enter' }, reshaping)).toEqual({ kind: 'apply-reshape' })
    expect(keyCommand({ key: 'Escape' }, reshaping)).toEqual({ kind: 'cancel-reshape' })
    expect(keyCommand({ key: 'Escape' }, { ...reshaping, polygon: 2 })).toEqual({
      kind: 'clear-polygon',
    })
  })

  it('undoes and redoes, copies and pastes on the command key', () => {
    expect(keyCommand({ key: 'z', ctrlKey: true }, idle)).toEqual({ kind: 'undo' })
    expect(keyCommand({ key: 'Z', ctrlKey: true, shiftKey: true }, idle)).toEqual({ kind: 'redo' })
    expect(keyCommand({ key: 'c', metaKey: true }, idle)).toEqual({ kind: 'copy' })
    expect(keyCommand({ key: 'v', metaKey: true }, idle)).toEqual({ kind: 'paste' })
  })

  it('switches step on Z and O, and never on Esc', () => {
    expect(keyCommand({ key: 'z' }, idle)).toEqual({ kind: 'step', to: 'zoning' })
    expect(keyCommand({ key: 'O' }, idle)).toEqual({ kind: 'step', to: 'openings' })
    expect(keyCommand({ key: 'd' }, idle)).toEqual({ kind: 'step', to: 'other' })
    expect(keyCommand({ key: 'Escape' }, openings)).toEqual({ kind: 'escape' })
  })

  it('gives the selected door F, H, Space, the arrows and Delete', () => {
    expect(keyCommand({ key: 'f' }, openings)).toEqual({ kind: 'door-swing' })
    expect(keyCommand({ key: 'h' }, openings)).toEqual({ kind: 'door-hinge' })
    expect(keyCommand({ key: ' ' }, openings)).toEqual({ kind: 'door-hinge-or-swing' })
    expect(keyCommand({ key: 'Delete' }, openings)).toEqual({ kind: 'door-remove' })
    expect(keyCommand({ key: 'ArrowLeft' }, openings)).toEqual({ kind: 'door-slide', step: -0.25 })
    expect(keyCommand({ key: 'ArrowUp' }, openings)).toEqual({ kind: 'door-slide', step: -0.25 })
    expect(keyCommand({ key: 'ArrowRight', shiftKey: true }, openings)).toEqual({
      kind: 'door-slide',
      step: 1,
    })
  })

  it('leaves F alone in the Openings step with no door in hand, and Space pans', () => {
    const empty = { ...openings, doorSelected: false }
    expect(keyCommand({ key: 'f' }, empty)).toBeNull()
    expect(keyCommand({ key: ' ' }, empty)).toEqual({ kind: 'pan-held', held: true })
  })

  it('leaves every key to the box a number is being typed into', () => {
    expect(keyCommand({ key: 'r' }, { ...idle, typing: true })).toBeNull()
    expect(keyCommand({ key: 'Escape' }, { ...idle, typing: true })).toBeNull()
  })
})
