import type { PlotSide, PlotSides } from './sides'

/*
 * The walls of decision 20: three kinds do not settle where the forces would like them, they stand
 * on a kerb line inside the setback and slide along it. The diwaniya is not among them; it is a
 * force, S1, and may stand back behind its own court.
 */

/**
 * The kerb a kind stands on: the service street's for the entry and every garage bay; for the
 * service entrance the side street's where the plot has one, because deliveries and staff arrive
 * at a side door, and otherwise the service street beside the garage.
 */
export function kerbFor(kind: string, sides: PlotSides): PlotSide | undefined {
  if (kind === 'entry-foyer' || kind === 'garage') return sides.service
  if (kind !== 'service-entrance') return undefined
  return sides.street.find((side) => side !== sides.service) ?? sides.service
}
