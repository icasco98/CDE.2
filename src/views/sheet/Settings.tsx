/**
 * The settings window: nine tabs, every setting of the sheet with the line that says what it does,
 * and Reset to the spec. It reads the sheet's settings and hands every change back as one action.
 */

import { useEffect, useRef, useState } from 'react'
import { DEFAULTS, type Settings } from '../../sheet'
import { CATEGORY_LABEL, TABS, valueRead, type Row } from './settings'

type SettingsWindowProps = {
  settings: Settings
  /** The tab it opens on: the step in use, or the one last left open. */
  tab: number
  onTab: (tab: number) => void
  onChange: (name: string, value: string | number) => void
  onResetSpec: () => void
  /** Every category back to the colour the tool ships with. */
  onStandardColours: () => void
  onClose: () => void
  /** What the spec did last: saved, or that there is none yet. */
  specState: string
}

export function SettingsWindow(props: SettingsWindowProps) {
  const { settings, tab, onChange } = props
  const open = TABS[Math.max(0, Math.min(TABS.length - 1, tab))]!
  // Listening once, through a ref: a listener re-added on every render can be taken off the window
  // in the middle of the keypress that another handler is still answering.
  const close = useRef(props.onClose)
  close.current = props.onClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="modal"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-label="Settings">
        <div className="dialog-head">
          <h2>Settings</h2>
          <span className="state">{props.specState}</span>
          <button
            type="button"
            onClick={props.onResetSpec}
            title="Back to the settings saved as the spec"
          >
            Reset to the spec
          </button>
          <button type="button" onClick={props.onClose} title="Esc">
            Close
          </button>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((entry, i) => (
            <button
              key={entry.title}
              type="button"
              role="tab"
              aria-selected={entry === open}
              className={entry === open ? 'on' : ''}
              onClick={() => props.onTab(i)}
            >
              {entry.title}
            </button>
          ))}
        </div>
        <div className="panes">
          {open.rows.map((row, i) => (
            <SettingRow
              key={row.kind === 'note' ? `note${i}` : row.name}
              row={row}
              {...{ settings, onChange }}
            />
          ))}
          {open.title === 'Colours' && (
            <button type="button" className="standard-colours" onClick={props.onStandardColours}>
              Back to the standard colours
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type RowProps = {
  row: Row
  settings: Settings
  onChange: (name: string, value: string | number) => void
}

function SettingRow({ row, settings, onChange }: RowProps) {
  if (row.kind === 'note')
    return (
      <div className="row">
        <label>{row.label}</label>
        <div className="hint">{row.hint}</div>
      </div>
    )
  const held = settings[row.name]
  return (
    <div className="row" data-setting={row.name}>
      <label
        htmlFor={row.kind === 'range' || row.kind === 'select' ? `set-${row.name}` : undefined}
      >
        {row.label} {row.kind === 'range' && <span className="v">{valueRead(row, settings)}</span>}
      </label>
      {row.kind === 'seg' && (
        <div className="seg">
          {row.choices.map((choice) => (
            <button
              key={String(choice.value)}
              type="button"
              aria-pressed={held === choice.value}
              className={held === choice.value ? 'on' : ''}
              onClick={() => onChange(row.name, choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
      {row.kind === 'range' && (
        <input
          type="range"
          id={`set-${row.name}`}
          min={row.min}
          max={row.max}
          step={row.step}
          value={Number(held)}
          onChange={(event) => onChange(row.name, Number(event.target.value))}
        />
      )}
      {row.kind === 'select' && (
        <select
          id={`set-${row.name}`}
          value={String(held)}
          onChange={(event) => onChange(row.name, event.target.value)}
        >
          {row.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      )}
      {row.kind === 'colour' && (
        <div className="swatches">
          {Object.keys(DEFAULTS.colors).map((category) => (
            <label key={category}>
              <input
                type="color"
                value={settings.colors[category] ?? DEFAULTS.colors[category]}
                onChange={(event) => onChange(`color.${category}`, event.target.value)}
              />{' '}
              {CATEGORY_LABEL[category]}
            </label>
          ))}
        </div>
      )}
      {row.hint && <div className="hint">{row.hint}</div>}
    </div>
  )
}

/** The window, with the button that opens it and the tab it remembers between openings. */
export function useSettingsWindow(): {
  open: boolean
  tab: number
  setOpen: (on: boolean) => void
  setTab: (tab: number) => void
} {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(() => remembered())
  return {
    open,
    tab,
    setOpen,
    setTab: (next) => {
      setTab(next)
      try {
        globalThis.localStorage?.setItem(TAB_KEY, String(next))
      } catch {
        // a browser with its store switched off opens the window on the first tab
      }
    },
  }
}

const TAB_KEY = 'cde.settings.tab'

function remembered(): number {
  try {
    const held = Number(globalThis.localStorage?.getItem(TAB_KEY))
    return Number.isInteger(held) && held >= 0 && held < TABS.length ? held : 0
  } catch {
    return 0
  }
}
