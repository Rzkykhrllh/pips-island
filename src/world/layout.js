import { CatmullRomCurve3, Vector3 } from 'three'
import { ISLAND, LAVA, WATERFALL, groundAt } from './terrain'

// Where the landmarks sit. Landmarks.jsx builds them, Vegetation.jsx keeps
// trees out of their way.

// Seeded RNG so the island looks the same on every load.
export function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const { mound } = ISLAND

// Rock spires crowning the massif, with a gap on the south-east side where the
// trail climbs to the summit. [angle from the summit (atan2(dz, dx), +z is
// toward the camera), distance, height, base radius]
const RING = [
  [-1.57, 9, 30, 4.6],
  [-2.1, 12, 25, 4],
  [-1.0, 12, 24, 3.8],
  [-2.6, 9, 20, 3.4],
  [-0.45, 9, 17, 3.2],
  [-1.85, 18, 19, 3.6],
  [-1.25, 19, 15, 3.2],
  [2.9, 11, 17, 3.6], // the tiki face looks out from this one
  [-0.1, 13, 12, 2.8],
  [0.1, 19, 8, 2.2],
  [-2.95, 15, 11, 2.6],
]
export const SPIRES = RING.map(([a, d, h, r]) => ({
  x: mound.x + Math.cos(a) * d,
  z: mound.z + Math.sin(a) * d,
  height: h,
  radius: r,
}))
export const FACE_SPIRE = SPIRES[7]

// Sea stacks offshore
export const STACKS = [
  { x: -60, z: 22, height: 9, radius: 3.2 },
  { x: -55, z: 28, height: 5, radius: 2 },
  { x: 63, z: -26, height: 11, radius: 3.4 },
  { x: -40, z: -58, height: 8, radius: 3 },
  { x: 50, z: 46, height: 6, radius: 2.4 },
]

// The waterfall and lava flow carve their channels in terrain.js
export { LAVA, WATERFALL }

export const VILLAGE = ISLAND.village
export const HUTS = [
  { x: 36, z: 1, rot: 0.6, band: '#c8323a', size: 1 },
  { x: 44, z: 9, rot: 2.2, band: '#2f5fb3', size: 1.15 },
  { x: 47, z: -1, rot: -0.8, band: '#e0a020', size: 0.9 },
]
export const TOWER = { x: 37, z: 11 }
export const CAMPFIRE = { x: 41, z: 4 }
// A plank jetty off the village's east beach, with a boat tied at the end
export const DOCK = { x0: 57, x1: 68, z: 7, y: 0.75 }
export const BOAT = { x: 66.5, z: 9.6 }
export const POND = { ...ISLAND.pond, water: 2.1 }
// Old stone temple ruins on the west lowland: a nod to the game's Fire Temple
export const RUINS = { x: -26, z: 10, rot: 0.5 }
export const BAMBOO = { x: -16, z: 31, radius: 4 }
export const TOTEM = { x: 10.5, z: 14 }

// Palisade of sharpened logs around the west side of the village
export const PALISADE = []
for (let a = 2.0; a <= 4.1; a += 0.055) {
  PALISADE.push({ x: VILLAGE.x + Math.cos(a) * 13, z: VILLAGE.z + Math.sin(a) * 13, a })
}

// Ground-following path through control points, sampled evenly
export function groundPath(points, samples) {
  const curve = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal')
  return curve.getSpacedPoints(samples).map((p) => new Vector3(p.x, groundAt(p.x, p.z), p.z))
}

const lavaPts = groundPath(LAVA, 40)
const fallPts = groundPath(WATERFALL, 20)

// Is (x, z) free of landmarks, with `margin` to spare?
export function isClear(x, z, margin = 1) {
  for (const s of SPIRES) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (s.radius + margin) ** 2) return false
  for (const h of HUTS) if ((h.x - x) ** 2 + (h.z - z) ** 2 < (2.6 + margin) ** 2) return false
  if ((TOWER.x - x) ** 2 + (TOWER.z - z) ** 2 < (2 + margin) ** 2) return false
  if ((TOTEM.x - x) ** 2 + (TOTEM.z - z) ** 2 < (1.6 + margin) ** 2) return false
  if ((CAMPFIRE.x - x) ** 2 + (CAMPFIRE.z - z) ** 2 < (2.2 + margin) ** 2) return false
  if ((POND.x - x) ** 2 + (POND.z - z) ** 2 < (POND.radius * 1.15 + margin) ** 2) return false
  if ((RUINS.x - x) ** 2 + (RUINS.z - z) ** 2 < (7 + margin) ** 2) return false
  if ((BAMBOO.x - x) ** 2 + (BAMBOO.z - z) ** 2 < (BAMBOO.radius + margin) ** 2) return false
  if (x > DOCK.x0 - 3 && Math.abs(z - DOCK.z) < 2 + margin) return false
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z)
  if (Math.abs(dv - 13) < 0.8 + margin && x < VILLAGE.x + 4) return false
  for (const p of lavaPts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (2 + margin) ** 2) return false
  for (const p of fallPts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (2.2 + margin) ** 2) return false
  return true
}
