import { useEffect, useState, type ChangeEvent } from 'react'
import { deserialize, serialize } from '../model'
import { downloadJson, fileNameFor } from './files'
import { NotYet } from './NotYet'
import { session } from './session'
import { stages } from './stages'
import { useMessages, useProject } from './useProject'

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
          session.say(`${file.name} cannot be opened: ${problem.message}`),
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
              onClick={() => downloadJson(fileNameFor(project.name), serialize(project))}
            >
              Save file
            </button>
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
      {messages.length > 0 && (
        <ul className="messages">
          {messages.map((message) => (
            <li key={message.id}>
              <span>{message.text}</span>
              <button type="button" onClick={() => session.dismiss(message.id)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
      <main>
        <Screen />
      </main>
    </>
  )
}
