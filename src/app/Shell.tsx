import {
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { deserialize, serialize } from '../model'
import { ExportMenu } from './ExportMenu'
import { downloadBlob, fileNameFor } from './files'
import { NotYet } from './NotYet'
import { session, type Message } from './session'
import { stages } from './stages'
import { useMessages, useProject } from './useProject'

/** At most four, newest at the bottom; older ones are dropped rather than scrolled to. */
const maxVisible = 4

/** The corner stack: fading refusals dismiss on a click, sticky problems only by their button or Escape. */
function MessageStack({ messages }: { messages: readonly Message[] }) {
  const visible = messages.slice(-maxVisible)
  return (
    <ul className="messages" role="status" aria-live="polite">
      {visible.map((message) => {
        const sticky = message.until === undefined
        const onKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>): void => {
          if (sticky && event.key === 'Escape') session.dismiss(message.id)
        }
        return (
          <li
            key={message.id}
            data-sticky={sticky || undefined}
            onKeyDown={onKeyDown}
            onClick={() => {
              if (!sticky) session.dismiss(message.id)
            }}
          >
            <span>{message.text}</span>
            {sticky && (
              <button type="button" onClick={() => session.dismiss(message.id)}>
                Dismiss
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Shell() {
  const project = useProject()
  const messages = useMessages()
  const [stageId, setStageId] = useState('requirements')
  const stage = stages.find((entry) => entry.id === stageId)
  const Screen = stage?.component ?? (() => <NotYet stage="Requirements" />)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) session.redo()
      else session.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void file.text().then((text) => {
      const read = deserialize(text)
      if (read.ok) session.actions.load(read.value)
      else
        read.problems.forEach((problem) =>
          session.warn(`${file.name} cannot be opened: ${problem.message}`),
        )
    })
  }

  return (
    <>
      <header className="shell">
        <div className="shell-top">
          <h1>Conceptual Design Engine</h1>
          <div className="shell-actions">
            <button type="button" onClick={() => session.actions.newProject('Untitled')}>
              New project
            </button>
            <label className="file-button">
              Open file
              <input type="file" accept="application/json,.json" onChange={openFile} />
            </label>
            <button
              type="button"
              onClick={() =>
                downloadBlob(
                  fileNameFor(project.name, 'json'),
                  new Blob([serialize(project)], { type: 'application/json' }),
                )
              }
            >
              Save file
            </button>
            <ExportMenu project={project} />
            <button type="button" onClick={() => session.undo()} disabled={!session.canUndo()}>
              Undo
            </button>
            <button type="button" onClick={() => session.redo()} disabled={!session.canRedo()}>
              Redo
            </button>
          </div>
        </div>
        <label className="field project-name">
          <span>Project name</span>
          <input
            type="text"
            value={project.name}
            onChange={(event) => session.actions.setName(event.target.value)}
          />
        </label>
        <nav className="tabs">
          {stages.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === stageId}
              onClick={() => setStageId(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
      </header>
      <main className={`stage-${stageId}`}>
        <Screen />
      </main>
      <MessageStack messages={messages} />
    </>
  )
}
