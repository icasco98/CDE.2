import { useState, type ReactNode } from 'react'

type NumberInputProps = {
  value: number
  onCommit: (value: number) => void
  step?: number
  min?: number
  label: string
  className?: string
}

/** Commits every keystroke that reads as a number, and holds what was typed until it loses focus. */
export function NumberInput({ value, onCommit, step, min, label, className }: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="number"
      aria-label={label}
      className={className}
      step={step ?? 1}
      min={min ?? 0}
      value={draft ?? String(value)}
      onChange={(event) => {
        const text = event.target.value
        setDraft(text)
        const parsed = Number(text)
        if (text.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

export function NumberField({
  label,
  problem,
  ...rest
}: Omit<NumberInputProps, 'className'> & { problem?: string | null }) {
  return (
    <label className="field">
      <span>{label}</span>
      <NumberInput label={label} {...rest} />
      {problem ? <span className="problem">{problem}</span> : null}
    </label>
  )
}

export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
