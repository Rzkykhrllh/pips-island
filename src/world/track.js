import { CatmullRomCurve3, Vector3 } from 'three'
import { groundAt, heightAt } from './terrain'
export { STOPS } from '../sections'

// ---------------------------------------------------------------------------
// The trail the runner follows. Scroll progress -> position on this curve.
// ---------------------------------------------------------------------------

const ground = (x, z) => new Vector3(x, heightAt(x, z), z)

export const BRIDGE = { x: 0, zStart: -8, zEnd: -18, sag: 0.6, width: 1.9 }

export function bridgeEnds() {
  return { a: ground(BRIDGE.x, BRIDGE.zStart), b: ground(BRIDGE.x, BRIDGE.zEnd) }
}

export function bridgeDeckPoint(t, target = new Vector3()) {
  const { a, b } = bridgeEnds()
  target.copy(a).lerp(b, t)
  target.y -= BRIDGE.sag * Math.sin(Math.PI * t)
  return target
}

const points = []
const marks = {}
const add = (v, name) => {
  if (name) marks[name] = points.length
  points.push(v)
}

// Beach -> jungle -> crate clearing -> rope bridge -> switchbacks up the massif -> summit
add(ground(0, 49), 'start')
add(ground(3, 41))
add(ground(-3, 34))
add(ground(2, 27))
add(ground(5, 19), 'cratesStart')
add(ground(0, 11))
add(ground(-4, 3))
add(ground(-1, -3), 'cratesEnd')
for (let i = 0; i <= 6; i++) {
  add(bridgeDeckPoint(i / 6), i === 0 ? 'bridgeStart' : i === 6 ? 'bridgeEnd' : undefined)
}
add(ground(4, -22))
add(ground(9, -26))
add(ground(8, -30))
add(ground(3, -32))
add(ground(0, -34), 'peak')

export const track = new CatmullRomCurve3(points, false, 'centripetal')

// Arc-length position (0..1) of each named control point.
const PER_SEGMENT = 60
const divisions = (points.length - 1) * PER_SEGMENT
track.arcLengthDivisions = divisions
const lengths = track.getLengths(divisions)
const total = lengths[divisions]
export const markerU = Object.fromEntries(
  Object.entries(marks).map(([name, i]) => [name, lengths[i * PER_SEGMENT] / total]),
)

// ---------------------------------------------------------------------------
// Scroll timeline: [scroll progress, trail marker]. The runner moves linearly between
// keyframes, so each page section lines up with a place on the island.
// Tweak these together with the section heights in ui/Overlay.jsx.
// ---------------------------------------------------------------------------
export const TIMELINE = [
  [0.0, 'start'],
  [0.08, 'start'],
  [0.3, 'cratesStart'],
  [0.62, 'cratesEnd'],
  [0.68, 'bridgeStart'],
  [0.82, 'bridgeEnd'],
  [0.95, 'peak'],
  [1.0, 'peak'],
]

export function progressToU(p) {
  for (let i = 1; i < TIMELINE.length; i++) {
    const [p1, m1] = TIMELINE[i]
    if (p <= p1) {
      const [p0, m0] = TIMELINE[i - 1]
      const t = p1 === p0 ? 1 : (p - p0) / (p1 - p0)
      return markerU[m0] + (markerU[m1] - markerU[m0]) * Math.max(0, t)
    }
  }
  return markerU.peak
}

// Where crates sit, expressed as scroll progress (each one is a feature card).
export const CRATE_PROGRESS = [0.36, 0.43, 0.5, 0.57]

export const isOnBridge = (u) => u > markerU.bridgeStart && u < markerU.bridgeEnd

// Highest point of the drawn ground under a footprint of radius r, so feet
// planted on a slope never sink into the uphill side
export function footing(x, z, r = 0.35) {
  let h = groundAt(x, z)
  h = Math.max(h, groundAt(x + r, z), groundAt(x - r, z), groundAt(x, z + r), groundAt(x, z - r))
  return h
}

// The dashed path is drawn this far above the ground; the runner and the
// crates stand on top of it
export const PATH_TOP = 0.1

// Where the runner's feet go at trail position u: on the path, or on the planks
export function trailPoint(u, target = new Vector3()) {
  track.getPointAt(Math.min(1, Math.max(0, u)), target)
  if (!isOnBridge(u)) target.y = footing(target.x, target.z) + PATH_TOP
  return target
}

// Squared distance from (x, z) to the trail, for anything within one grid cell
// (4 units) of it; Infinity further out. Points along the trail are bucketed
// in a grid, so a lookup checks a handful of points instead of all of them.
const CELL = 4
const trailGrid = new Map()
for (const p of track.getSpacedPoints(480)) {
  const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`
  if (!trailGrid.has(key)) trailGrid.set(key, [])
  trailGrid.get(key).push(p)
}
export function trailDistance2(x, z) {
  const cx = Math.floor(x / CELL)
  const cz = Math.floor(z / CELL)
  let best = Infinity
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const bucket = trailGrid.get(`${cx + i},${cz + j}`)
      if (!bucket) continue
      for (const p of bucket) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2)
    }
  }
  return best
}
