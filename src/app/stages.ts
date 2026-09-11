import { createElement, type ComponentType } from 'react'
import { RequirementsScreen } from '../views/requirements/RequirementsScreen'
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
  { id: 'bubbles', label: 'Bubbles', component: notYet('Bubbles') },
  { id: 'zoning', label: 'Zoning', component: notYet('Zoning') },
  { id: 'massing', label: 'Massing', component: notYet('Massing') },
]
