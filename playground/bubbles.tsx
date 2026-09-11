import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BubblesView } from '../src/views/bubbles'
import type { Position } from '../src/bubbles'
import type { Commit } from '../src/model'
import { categoryOf, sampleStore } from './sample'
import '../src/styles.css'

const store = sampleStore()

function Playground() {
  const [project, setProject] = useState(store.getState())
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => store.subscribe(setProject), [])

  const rooms = useMemo(
    () => project.rooms.map((room) => ({ ...room, category: categoryOf(room.type) })),
    [project.rooms],
  )

  return (
    <main className="playground">
      <h1>Bubbles</h1>
      <BubblesView
        rooms={rooms}
        edges={project.edges}
        storeys={project.storeys}
        plot={project.plot}
        selected={selected}
        onMoveBubble={(id: string, at: Position, commit: Commit) =>
          store.actions.setBubble(id, at, commit)
        }
        onPin={(id: string, pinned: boolean) =>
          pinned ? store.actions.pin(id) : store.actions.unpin(id)
        }
        onConnect={(a: string, b: string) => store.actions.connect({ a, b, kind: 'door' })}
        onDisconnect={(edgeId: string) => store.actions.disconnect(edgeId)}
        onSelect={setSelected}
      />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('bubbles.html has no #root element')

createRoot(root).render(<Playground />)
