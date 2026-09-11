import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BubblesView, type BubbleProposal } from '../src/views/bubbles'
import type { Position } from '../src/bubbles'
import type { Commit } from '../src/model'
import { connectionSource, proposedConnections } from '../src/rulebook'
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

  const proposals = useMemo(
    () =>
      proposedConnections(project.rooms, project.edges).map((proposal) => ({
        ...proposal,
        source: connectionSource(proposal.rowId),
      })),
    [project.rooms, project.edges],
  )

  const take = (proposal: BubbleProposal) =>
    store.actions.connect({
      a: proposal.a,
      b: proposal.b,
      kind: proposal.kind,
      storey: proposal.storey,
    })

  return (
    <main className="playground">
      <h1>Bubbles</h1>
      <BubblesView
        rooms={rooms}
        edges={project.edges}
        proposals={proposals}
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
        onAccept={(proposal: BubbleProposal) => take(proposal)}
        onAcceptAll={() =>
          store.transaction(() => {
            for (const proposal of proposals) {
              const taken = take(proposal)
              if (!taken.ok) return taken
            }
          })
        }
        onSelect={setSelected}
      />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('bubbles.html has no #root element')

createRoot(root).render(<Playground />)
