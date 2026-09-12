import { useSyncExternalStore } from 'react'
import { fitCamera, type Camera } from './camera'

/**
 * One camera over the plot, shared by the sheets that draw it. The bubbles and the plan frame the
 * same plot at the same scale, so switching tabs shows the same view, and a zoom, a pan or a Fit
 * on either is on the other when it is opened. It is view memory: the project stores no camera.
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
