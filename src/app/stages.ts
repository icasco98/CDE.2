import { createElement, type ComponentType } from 'react'
import { BubblesStage } from '../views/bubbles/BubblesStage'
import { RequirementsScreen } from '../views/requirements/RequirementsScreen'
import { ZoningStage } from '../views/zoning/ZoningStage'
import { NotYet } from './NotYet'

export type Stage = {
  readonly id: string
  readonly label: string
  readonly component: ComponentType
}

const notYet =
  (stage: string): ComponentType =>
  () =>
    createElement(NotYet, { stage })

export const stages: readonly Stage[] = [
  { id: 'requirements', label: 'Requirements', component: RequirementsScreen },
  { id: 'bubbles', label: 'Bubbles', component: BubblesStage },
  { id: 'zoning', label: 'Zoning', component: ZoningStage },
  { id: 'massing', label: 'Massing', component: notYet('Massing') },
]
