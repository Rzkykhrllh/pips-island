import { useSyncExternalStore } from 'react'

// Per-frame values live in a plain mutable object (no React re-renders).
export const world = {
  target: 0, // raw scroll progress 0..1
  progress: 0, // smoothed progress
  u: 0, // the runner's position on the trail 0..1
  velocity: 0, // trail units per second (sign = direction)
  // Vector3s, created by world/Director.jsx so this file (and the page around
  // the 3D scene) doesn't pull in three.js
  pipPos: null,
  pipDir: null,
  facing: 1,
  hop: 10, // seconds since the last spin (a crate breaking, a click on the cat, K / X)
  jump: 10, // seconds since the last jump (J)
  pointerAt: -1e9, // performance.now() of the viewer's last pointer move over the island
  intro: 1, // opening shot, 0 -> 1 (Director.jsx); 1 when skipped
  warp: -1, // seconds since the cat warped in (negative: not yet)
  leaving: -1, // seconds since Play was pressed and the cat warps out (negative: not leaving)
  // Where the viewer has swung the camera (drag / pinch / buttons), on top of
  // the scroll-driven shot. Targets; Director.jsx eases toward them.
  orbit: { yaw: 0, pitch: 0, zoom: 1 },
  reducedMotion: false,
}

// Tiny external store for the few values the HTML overlay cares about.
// crates: broken so far; ready: the 3D scene has its runner loaded;
// orbited: the viewer has moved the camera away from the default shot;
// noScene: no WebGL, or the scene failed to load (the page carries on without it);
// fruit: collected from crates; bonusFound / bonusTotal: hidden "?" crates;
// toast: a short message for the HUD ({ text, id })
let ui = { crates: 0, ready: false, orbited: false, noScene: false, fruit: 0, bonusFound: 0, bonusTotal: 0, toast: null }
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

// Camera nudges shared by the drag/pinch handlers and the HUD buttons
export const ZOOM_MIN = 0.45
export const ZOOM_MAX = 2.2
export const PITCH_MIN = -0.5
export const PITCH_MAX = 0.6
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export function nudgeCamera({ yaw = 0, pitch = 0, zoom = 1 }) {
  const o = world.orbit
  o.yaw += yaw
  o.pitch = clamp(o.pitch + pitch, PITCH_MIN, PITCH_MAX)
  o.zoom = clamp(o.zoom * zoom, ZOOM_MIN, ZOOM_MAX)
  const turned = Math.abs(Math.atan2(Math.sin(o.yaw), Math.cos(o.yaw)))
  const moved = turned > 0.01 || Math.abs(o.pitch) > 0.01 || Math.abs(o.zoom - 1) > 0.01
  if (moved !== uiStore.get().orbited) uiStore.set({ orbited: moved })
}
export function resetCamera() {
  // Back to the nearest whole turn, so the camera never unwinds several spins
  const o = world.orbit
  o.yaw = Math.round(o.yaw / (Math.PI * 2)) * Math.PI * 2
  o.pitch = 0
  o.zoom = 1
  uiStore.set({ orbited: false })
}

let toastId = 0
export const toast = (text) => uiStore.set({ toast: { text, id: ++toastId } })
