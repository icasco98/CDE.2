import type { ComponentType } from 'react'
import { BubblesStage } from '../views/bubbles/BubblesStage'
import { MassingStage } from '../views/massing/MassingStage'
import { RequirementsScreen } from '../views/requirements/RequirementsScreen'
import { ZoningStage } from '../views/zoning/ZoningStage'

export type Stage = {
  readonly id: string
  readonly label: string
  readonly component: ComponentType
}

export const stages: readonly Stage[] = [
  { id: 'requirements', label: 'Requirements', component: RequirementsScreen },
  { id: 'bubbles', label: 'Bubbles', component: BubblesStage },
  { id: 'zoning', label: 'Zoning', component: ZoningStage },
  { id: 'massing', label: 'Massing', component: MassingStage },
]
