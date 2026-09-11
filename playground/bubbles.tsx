import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { addHallway, BubblesView, type BubbleProposal } from '../src/views/bubbles'
import type { Position } from '../src/bubbles'
import type { Commit, EdgeKind, Family, Result } from '../src/model'
import {
  circulationPerStorey,
  connectionSource,
  proposedConnections,
  roomTypeById,
} from '../src/rulebook'
import { categoryOf, sampleStore } from './sample'
import '../src/styles.css'

const store = sampleStore()

function Playground() {
  const [project, setProject] = useState(store.getState())
  const [selected, setSelected] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  useEffect(() => store.subscribe(setProject), [])

  const rooms = useMemo(
    () =>
      project.rooms.map((room) => ({
        ...room,
        category: categoryOf(room.type),
        tier: roomTypeById(room.type)?.tier,
      })),
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

  const took = (result: Result<unknown>): boolean => result.ok

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
      {refusal ? <p className="problem">{refusal}</p> : null}
      <BubblesView
        rooms={rooms}
        edges={project.edges}
        proposals={proposals}
        storeys={project.storeys}
        circulation={circulationPerStorey(project.rooms, project.storeys)}
        plot={project.plot}
        weights={project.weights}
        selected={selected}
        onMoveBubble={(id: string, at: Position, commit: Commit) =>
          store.actions.setBubble(id, at, commit)
        }
        onDropBubble={(id: string, at: Position, storey?: number) =>
          took(
            store.transaction(() => {
              const moved = store.actions.setBubble(id, at, 'commit')
              if (!moved.ok || storey === undefined) return moved
              return store.actions.setStorey(id, storey)
            }),
          )
        }
        onPin={(id: string, pinned: boolean) =>
          pinned ? store.actions.pin(id) : store.actions.unpin(id)
        }
        onConnect={(a: string, b: string) => store.actions.connect({ a, b, kind: 'door' })}
        onDisconnect={(edgeId: string) => {
          store.actions.disconnect(edgeId)
          setSelected((held) => (held === edgeId ? null : held))
        }}
        onSetEdgeKind={(edgeId: string, kind: EdgeKind) => store.actions.setEdgeKind(edgeId, kind)}
        onRemoveRoom={(id: string) => {
          store.actions.removeRoom(id)
          setSelected(null)
        }}
        onAddHallway={(storey: number) => addHallway(store, project.rooms, storey, project.storeys)}
        onAccept={(proposal: BubbleProposal) => take(proposal)}
        onAcceptAll={() =>
          store.transaction(() => {
            for (const proposal of proposals) {
              const taken = take(proposal)
              if (!taken.ok) return taken
            }
          })
        }
        onSetWeight={(family: Family, weight: number) =>
          store.actions.setWeights({ ...project.weights, [family]: weight })
        }
        onSelect={setSelected}
        onRefuse={(message: string) => setRefusal(message)}
      />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('bubbles.html has no #root element')

createRoot(root).render(<Playground />)
