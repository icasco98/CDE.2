import type { ReactElement } from 'react'
import { BubblesStage } from '../views/bubbles/BubblesStage'
import { RequirementsScreen } from '../views/requirements/RequirementsScreen'
import { SheetStage, type SheetMode } from '../views/sheet/SheetStage'

export type Stage = {
  readonly id: string
  readonly label: string
  /** Whether the stage draws the project's plan, which brings the export menu and the plan's page. */
  readonly plan: boolean
  /** The screen, handed the way to another stage for the keys that change it from inside. */
  readonly screen: (go: (id: string) => void) => ReactElement
}

// Both plan stages render the one SheetStage at the same place, so a change of tab keeps its state.
const onPlan = (mode: SheetMode) => (go: (id: string) => void) => (
  <SheetStage mode={mode} onMode={(to) => go(to === 'zoning' ? 'sheet' : 'openings')} />
)

export const stages: readonly Stage[] = [
  {
    id: 'requirements',
    label: 'Requirements',
    plan: false,
    screen: () => <RequirementsScreen />,
  },
  { id: 'bubbles', label: 'Bubbles', plan: false, screen: () => <BubblesStage /> },
  { id: 'sheet', label: 'Zoning and 3D', plan: true, screen: onPlan('zoning') },
  { id: 'openings', label: 'Openings', plan: true, screen: onPlan('openings') },
]
