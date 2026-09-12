import { useEffect, useRef } from 'react'
import { boundingBox, ringsToPath, type Point, type Polygon } from '../../geometry'
import type { Partition } from '../../zoning'
import { pointsOf } from '../frame'

/*
 * The proposal: the partition drawn over the sheet, dashed, before anything is written down. Each
 * zone is revealed inside a circle growing out of the bubble it came from, so a person sees the
 * bubble they drew becoming the room they get. Nothing here touches the store.
 */

/** What one press of Morph made, and the storey it was made for. */
export type Proposal = {
  readonly storey: number
  readonly made: Partition
  /** Where each zone's bubble stood, which is where its circle opens from. */
  readonly from: ReadonlyMap<string, Point>
}

/** How long the zones take to open, in milliseconds. About a second, with the camera held. */
const MORPH_MS = 900

/** How far a room's name may be from its own middle and still be read as its name, in metres. */
const LABEL_M = 0.6

function centreOf(polygon: Polygon): Point {
  const bounds = boundingBox(polygon)
  return [bounds.left + bounds.width / 2, bounds.top + bounds.depth / 2]
}

/** How far the circle must grow to have shown the whole of a zone. */
function reachOf(polygon: Polygon, from: Point): number {
  let most = 0
  for (const corner of polygon)
    most = Math.max(most, Math.hypot(corner[0] - from[0], corner[1] - from[1]))
  return most
}

/**
 * The zones opening. The circles are grown by writing their radius straight onto the elements,
 * frame by frame, rather than through React: the store does not change while this runs and
 * neither should the tree. Under `prefers-reduced-motion` the whole thing is one cut.
 */
export function MorphZones({
  proposal,
  names,
  cut,
}: {
  proposal: Proposal
  names: ReadonlyMap<string, string>
  cut: boolean
}) {
  const circles = useRef(new Map<string, SVGCircleElement>())

  useEffect(() => {
    const held = circles.current
    const reaches = new Map(
      proposal.made.zones.map((zone) => {
        const from = proposal.from.get(zone.id) ?? centreOf(zone.polygon)
        return [zone.id, reachOf(zone.polygon, from)]
      }),
    )
    const show = (part: number): void => {
      for (const [id, circle] of held)
        circle.setAttribute('r', String(Math.max(0.01, (reaches.get(id) ?? 0) * part)))
    }
    if (cut) {
      show(1)
      return
    }
    let frame = 0
    const began = performance.now()
    const step = (now: number): void => {
      const part = Math.min(1, (now - began) / MORPH_MS)
      show(part)
      if (part < 1) frame = requestAnimationFrame(step)
    }
    show(0)
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [proposal, cut])

  return (
    <g className="morph" data-morph={proposal.storey}>
      <defs>
        <pattern
          id="morph-spill"
          width={0.5}
          height={0.5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={0.5} className="spill-line" />
        </pattern>
        {proposal.made.zones.map((zone) => {
          const from = proposal.from.get(zone.id) ?? centreOf(zone.polygon)
          return (
            <clipPath key={zone.id} id={`morph-open-${zone.id}`} clipPathUnits="userSpaceOnUse">
              <circle
                ref={(element) => {
                  if (element) circles.current.set(zone.id, element)
                  else circles.current.delete(zone.id)
                }}
                cx={from[0]}
                cy={from[1]}
                r={0.01}
              />
            </clipPath>
          )
        })}
      </defs>
      {proposal.made.spill.length > 0 && (
        <path
          d={ringsToPath(proposal.made.spill)}
          className="spill"
          data-spill=""
          fillRule="evenodd"
        />
      )}
      {proposal.made.zones.map((zone) => {
        const middle = centreOf(zone.polygon)
        return (
          <g key={zone.id} data-zone={zone.id} clipPath={`url(#morph-open-${zone.id})`}>
            <polygon points={pointsOf(zone.polygon)} className="zone" />
            <text x={middle[0]} y={middle[1] - LABEL_M} className="zone-name">
              {names.get(zone.id) ?? ''}
            </text>
            <text x={middle[0]} y={middle[1] + LABEL_M} className="zone-area">
              {`${Math.round(zone.areaM2)} m²`}
            </text>
          </g>
        )
      })}
      {proposal.made.doors.map((door) => (
        <line
          key={door.linkId}
          data-zone-door={door.linkId}
          x1={door.at[0] - door.along[0] * 0.45}
          y1={door.at[1] - door.along[1] * 0.45}
          x2={door.at[0] + door.along[0] * 0.45}
          y2={door.at[1] + door.along[1] * 0.45}
          className="zone-door"
        />
      ))}
      {proposal.made.tensions.map((tension) => {
        const a = proposal.made.zones.find((zone) => zone.id === tension.a)
        const b = proposal.made.zones.find((zone) => zone.id === tension.b)
        if (!a || !b) return null
        const from = centreOf(a.polygon)
        const to = centreOf(b.polygon)
        return (
          <line
            key={tension.linkId}
            data-zone-tension={tension.linkId}
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            className="zone-tension"
          >
            <title>{tension.sentence}</title>
          </line>
        )
      })}
    </g>
  )
}
