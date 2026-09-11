import type { ComponentType } from 'react'
import { BubblesStage } from '../views/bubbles/BubblesStage'
import { PlanStage } from '../views/plan/PlanStage'
import { RequirementsScreen } from '../views/requirements/RequirementsScreen'

export type Stage = {
  readonly id: string
  readonly label: string
  readonly component: ComponentType
}

export const stages: readonly Stage[] = [
  { id: 'requirements', label: 'Requirements', component: RequirementsScreen },
  { id: 'bubbles', label: 'Bubbles', component: BubblesStage },
  { id: 'plan', label: 'Plan', component: PlanStage },
]
