/**
 * The chat column: the log, a box to write in that grows with what is typed, Say, and Keep this
 * plan. The architect works the sheet through the same actions as the hand, so everything it does is
 * one Undo.
 */

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  withFeedback,
  withNote,
  withPlan,
  withRequest,
  type Change,
  type Desk,
  type Memory,
  type Result,
  type Sheet,
} from '../../sheet'
import { runMessage } from './agentRun'
import type { Sample } from './claude'
import './chat.css'

/** How tall the box grows before it scrolls: a few lines of the log's own type. */
const LINES_SHOWN = 92

type Who = 'you' | 'page' | 'quiet' | 'bad'

type Line = { id: number; who: Who; text: string; working?: boolean }

type ChatProps = {
  /** The sheet as it stands now, read afresh by every tool call. */
  read: () => Sheet
  /** One action applied without an undo step of its own, so a message is one step. */
  write: (change: Change) => Result
  storey: number
  memory: Memory
  onMemory: (next: Memory) => void
  sample: Sample | null
  ready: boolean
  /** The sheet is kept for one Undo before the assistant touches it. */
  onBegin: () => void
  /** A message that changed nothing leaves no undo step. */
  onEnd: (changed: boolean) => void
}

export function Chat(props: ChatProps) {
  const { read, write, storey, memory, onMemory, sample, ready, onBegin, onEnd } = props
  const [lines, setLines] = useState<Line[]>([])
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const log = useRef<HTMLDivElement | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)
  const nextId = useRef(0)
  const held = useRef(memory)
  held.current = memory

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [lines])

  // The box is as tall as what is typed, up to a few lines, and scrolls beyond that.
  useEffect(() => {
    const held = box.current
    if (!held) return
    held.style.height = 'auto'
    held.style.height = `${Math.min(held.scrollHeight, LINES_SHOWN)}px`
  }, [value])

  const add = (who: Who, text: string, working = false): number => {
    const id = ++nextId.current
    setLines((was) => [...was, { id, who, text, working }])
    return id
  }
  const put = (id: number, text: string) =>
    setLines((was) => was.map((line) => (line.id === id ? { ...line, text } : line)))
  const drop = (id: number) => setLines((was) => was.filter((line) => line.id !== id))

  const keep = (next: Memory) => {
    held.current = next
    onMemory(next)
  }

  const say = async (event?: FormEvent) => {
    event?.preventDefault()
    const text = value.trim()
    if (!text || busy) return
    setValue('')
    add('you', text)
    const now = new Date().toISOString()
    if (!sample) {
      // Nothing else reads the owner's line while the assistant is out of reach, so it is a note too.
      keep(withNote(withFeedback(held.current, text, now), text, now))
      add('quiet', 'Kept in memory. The assistant is reachable only from the link.')
      return
    }
    keep(withFeedback(held.current, text, now))
    setBusy(true)
    const before = JSON.stringify(read().rooms)
    onBegin()
    const working = add('quiet', 'Working…', true)
    let answer = 0
    const desk: Desk = {
      read,
      write,
      say: (line) => add('page', line),
      note: (note, replaces) =>
        keep(withNote(held.current, note, new Date().toISOString(), replaces)),
      request: (asked) => keep(withRequest(held.current, asked, new Date().toISOString())),
    }
    const run = await runMessage({
      sample,
      desk,
      storey,
      memory: held.current,
      text,
      onText: (streamed) => {
        if (!answer) answer = add('page', streamed)
        else put(answer, streamed)
      },
    })
    drop(working)
    if ('error' in run) add('bad', run.error)
    else if (answer) put(answer, run.text)
    else add('page', run.text)
    setBusy(false)
    onEnd(JSON.stringify(read().rooms) !== before)
  }

  /** Enter says it; Shift+Enter is a line of its own, so a sentence can be read back. */
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void say()
  }

  return (
    <aside className="chat">
      <h2>The assistant</h2>
      <div className="log" ref={log} role="log">
        {lines.length === 0 && <div className="quiet">Nothing said yet.</div>}
        {lines.map((line) => (
          <div key={line.id} className={line.who}>
            {line.working && <i className="spin" aria-hidden="true" />}
            {line.text}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="keep"
        onClick={() => keep(withPlan(held.current, read(), storey, new Date().toISOString()))}
      >
        Keep this plan
      </button>
      <form onSubmit={say}>
        <textarea
          ref={box}
          rows={1}
          aria-label="Say something to the assistant"
          placeholder="Ask it to lay out the ground floor"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKey}
        />
        <button type="submit" disabled={busy || !value.trim()}>
          Say
        </button>
      </form>
      <p className="hint">
        {!ready
          ? 'Reaching the assistant…'
          : sample
            ? 'Everything it does to the sheet is one Undo. Keep this plan stores the sheet in its memory.'
            : 'The assistant is reachable only from the link; here your line is kept in its memory.'}
      </p>
    </aside>
  )
}
