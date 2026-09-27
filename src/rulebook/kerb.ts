import type { PlotSide, PlotSides } from './sides'

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
