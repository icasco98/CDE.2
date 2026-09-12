import { useSyncExternalStore } from 'react'
import { fitCamera, type Camera } from './camera'

/**
 * One camera over the plot, shared by the sheets that draw it. The bubbles and the plan frame the
 * same plot with the same extent, so both sheets show the same metres, and a zoom, a pan or a Fit
 * on either is on the other when it is opened. What they show is the same; how large it is drawn
 * is not, because the two tabs keep different columns beside their sheets and each letterboxes the
 * same metres into the width it has left. It is view memory: the project stores no camera.
 */
let camera: Camera = fitCamera
const listeners = new Set<() => void>()

export const sheetCamera = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  get: (): Camera => camera,
  set(next: Camera): void {
    if (next === camera) return
    camera = next
    listeners.forEach((listener) => listener())
  },
}

export function useSheetCamera(): readonly [Camera, (next: Camera) => void] {
  const held = useSyncExternalStore(sheetCamera.subscribe, sheetCamera.get, sheetCamera.get)
  return [held, sheetCamera.set]
}
