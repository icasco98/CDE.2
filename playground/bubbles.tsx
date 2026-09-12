import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { addHallway, BubblesView } from '../src/views/bubbles'
import type { Position } from '../src/bubbles'
import { EXTERIOR, type Commit, type EdgeKind, type Family } from '../src/model'
import { circulationPerStorey, connectionSource, roomTypeById } from '../src/rulebook'
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
        kind: room.type,
        category: categoryOf(room.type),
        tier: roomTypeById(room.type)?.tier,
      })),
    [project.rooms],
  )

  const edges = useMemo(() => {
    const kindOf = (id: string): string =>
      id === EXTERIOR ? EXTERIOR : (project.rooms.find((room) => room.id === id)?.type ?? '')
    return project.edges.map((edge) => {
      const source = connectionSource(kindOf(edge.a), kindOf(edge.b), edge.kind)
      return source ? { ...edge, source } : edge
    })
  }, [project.edges, project.rooms])

  return (
    <main className="playground">
      <h1>Bubbles</h1>
      {refusal ? <p className="problem">{refusal}</p> : null}
      <BubblesView
        rooms={rooms}
        edges={edges}
        storeys={project.storeys}
        circulation={circulationPerStorey(project.rooms, project.storeys)}
        plot={project.plot}
        site={project.site}
        weights={project.weights}
        selected={selected}
        onMoveBubble={(id: string, at: Position, commit: Commit) =>
          store.actions.setBubble(id, at, commit)
        }
        onDropBubble={(id: string, at: Position) =>
          // Dropped is held: the bubble is put where the hand left it and pinned there in the one
          // step, so the forces cannot take it back and Let go is what hands it to them again.
          store.transaction(() => {
            const put = store.actions.setBubble(id, at, 'commit')
            return put.ok ? store.actions.pin(id) : put
          })
        }
        onSetStorey={(id: string, storey: number) => store.actions.setStorey(id, storey)}
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
