import { useMemo, useState } from 'react'
import { session } from '../../app/session'
import { useProject } from '../../app/useProject'
import type { Position } from '../../bubbles'
import type { Commit } from '../../model'
import { roomTypeById } from '../../rulebook'
import { BubblesView } from './BubblesView'

/** The bubbles view over the app's one store: every callback is a store action, refusals are said out loud. */
export function BubblesStage() {
  const project = useProject()
  const [selected, setSelected] = useState<string | null>(null)

  const rooms = useMemo(
    () =>
      project.rooms.map((room) => ({
        ...room,
        category: roomTypeById(room.type)?.category,
      })),
    [project.rooms],
  )

  const report = (result: { ok: boolean; problems?: readonly { message: string }[] }): void => {
    if (!result.ok) result.problems?.forEach((problem) => session.say(problem.message))
  }

  return (
    <BubblesView
      rooms={rooms}
      edges={project.edges}
      storeys={project.storeys}
      plot={project.plot}
      selected={selected}
      onMoveBubble={(id: string, at: Position, commit: Commit) =>
        session.actions.setBubble(id, at, commit)
      }
      onPin={(id: string, pinned: boolean) =>
        report(pinned ? session.actions.pin(id) : session.actions.unpin(id))
      }
      onConnect={(a: string, b: string) => report(session.actions.connect({ a, b, kind: 'door' }))}
      onDisconnect={(edgeId: string) => report(session.actions.disconnect(edgeId))}
      onSelect={setSelected}
    />
  )
}
