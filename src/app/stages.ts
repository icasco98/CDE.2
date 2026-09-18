import type { ComponentType } from 'react'
import { BubblesStage } from '../views/bubbles/BubblesStage'
import { RequirementsScreen } from '../views/requirements/RequirementsScreen'
import { SheetStage } from '../views/sheet/SheetStage'

export type Stage = {
  readonly id: string
  readonly label: string
  readonly component: ComponentType
}

export const stages: readonly Stage[] = [
  { id: 'requirements', label: 'Requirements', component: RequirementsScreen },
  { id: 'bubbles', label: 'Bubbles', component: BubblesStage },
  { id: 'sheet', label: 'Sheet', component: SheetStage },
]
