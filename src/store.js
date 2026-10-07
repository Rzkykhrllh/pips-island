import { useSyncExternalStore } from 'react'
import { Vector3 } from 'three'

// Per-frame values live in a plain mutable object (no React re-renders).
export const world = {
  target: 0, // raw scroll progress 0..1
  progress: 0, // smoothed progress
  u: 0, // Pip's position on the trail 0..1
  velocity: 0, // trail units per second (sign = direction)
  pipPos: new Vector3(),
  pipDir: new Vector3(0, 0, -1),
  facing: 1,
  hop: 10, // seconds since the last hop
  reducedMotion: false,
}

// Tiny external store for the few values the HTML overlay cares about.
let ui = { shards: 0 }
const listeners = new Set()
export const uiStore = {
  get: () => ui,
  set(patch) {
    ui = { ...ui, ...patch }
    listeners.forEach((l) => l())
  },
  subscribe(l) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}
export const useUi = (select) => useSyncExternalStore(uiStore.subscribe, () => select(uiStore.get()))
