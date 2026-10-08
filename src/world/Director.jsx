import { useEffect } from 'react'
import { advance, useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Spherical, Vector3 } from 'three'
import { ISLAND, groundAt, smoothstep } from './terrain'
import { markerU, progressToU, track, trailPoint } from './track'
import { SPIRES } from './layout'
import { uiStore, world } from '../store'

// Turns scroll progress into the runner's position and the camera.
//
// The camera works like a film crew rather than a fixed chase cam:
//  - Each stretch of the trail has its own shot (distance, height, angle round
//    the runner), blended as you scroll: low and front-on to meet the cat, up
//    over the canopy in the jungle, wide on the bridge to show the gorge and
//    the waterfall, pulled back on the climb so the spires fit in.
//  - The heading it orbits from is smoothed, so switchbacks don't swing it.
//  - It keeps clear of the ground, the spires, and hills between it and the runner.
//  - The viewer can swing it round, tilt it and zoom (CameraControls.jsx and
//    the HUD buttons); that rides on top of whatever shot is playing.
//  - Where the runner sits on screen (beside the text sign, or above it on
//    phones) is done with a view offset, which slides the picture without
//    changing the perspective.

world.pipPos = new Vector3()
world.pipDir = new Vector3(0, 0, -1)

const UP = new Vector3(0, 1, 0)
const ISLAND_CENTER = new Vector3(-2, 6, -10)
const MASSIF = new Vector3(ISLAND.mound.x, 0, ISLAND.mound.z)

// Shots along the trail: [progress, { dist, height, angle, ahead, lookUp, outward }].
// angle 0 films from the runner's side; positive swings round to its front.
// outward 1 films from straight out from the massif instead, looking in at it.
const SHOTS = [
  [0.1, { dist: 6.5, height: 2.6, angle: 0.95, ahead: 0.4, lookUp: 1, outward: 0 }], // meet the cat, face-on
  [0.2, { dist: 7.5, height: 4.6, angle: 0.6, ahead: 1, lookUp: 0.9, outward: 0 }], // jungle: over the canopy
  [0.36, { dist: 7, height: 4, angle: 0.3, ahead: 1, lookUp: 0.9, outward: 0 }], // crates
  [0.62, { dist: 7, height: 4, angle: 0.3, ahead: 1, lookUp: 0.9, outward: 0 }],
  [0.7, { dist: 11, height: 4.5, angle: -0.15, ahead: 1.5, lookUp: 0.6, outward: 0 }], // bridge: wide, gorge and waterfall behind
  [0.82, { dist: 11, height: 5, angle: -0.1, ahead: 1.5, lookUp: 0.8, outward: 0 }],
  [0.9, { dist: 12, height: 3, angle: 0.45, ahead: 0.5, lookUp: 3.2, outward: 1 }], // the climb, spires in frame
]

const shot = { dist: 0, height: 0, angle: 0, ahead: 0, lookUp: 0, outward: 0 }
function shotAt(p) {
  let i = 1
  while (i < SHOTS.length - 1 && p > SHOTS[i][0]) i++
  const [p0, a] = SHOTS[i - 1]
  const [p1, b] = SHOTS[i]
  const t = smoothstep(p0, p1, p)
  for (const k in shot) shot[k] = a[k] + (b[k] - a[k]) * t
  return shot
}

// Where the runner should sit on screen, as a fraction of the screen.
// Wide screens: beside the sign (+ = runner on the left, sign on the right).
function sideFraming(p) {
  const meet = smoothstep(0.1, 0.16, p) * (1 - smoothstep(0.3, 0.35, p))
  const crates = smoothstep(0.3, 0.35, p) * (1 - smoothstep(0.64, 0.68, p))
  const bridge = smoothstep(0.64, 0.68, p) * (1 - smoothstep(0.85, 0.9, p))
  return crates - meet - bridge
}

const peak = trailPoint(markerU.peak)
// Summit: from the open south-east side, so the cat stands against the spires and the sunset
const OUTRO_DIR = new Vector3(0.75, 0, 0.66).normalize()

const spireBases = SPIRES.map((s) => groundAt(s.x, s.z) - 1.5)

// Push a camera position out of the ground and out of any spire
function keepClear(pos) {
  pos.y = Math.max(pos.y, groundAt(pos.x, pos.z) + 1.6)
  SPIRES.forEach((s, i) => {
    const t = (pos.y - spireBases[i]) / s.height
    if (t >= 1) return
    const r = s.radius * 1.2 * (1 - Math.max(0, t)) + 1.5
    const dx = pos.x - s.x
    const dz = pos.z - s.z
    const d = Math.hypot(dx, dz)
    if (d < r && d > 1e-3) {
      pos.x = s.x + (dx / d) * r
      pos.z = s.z + (dz / d) * r
    }
  })
  return pos
}

// Raise the camera until no hill blocks its view of `target`
function keepLineOfSight(pos, target) {
  for (let i = 1; i <= 5; i++) {
    const t = i / 6
    const x = pos.x + (target.x - pos.x) * t
    const z = pos.z + (target.z - pos.z) * t
    const y = pos.y + (target.y - pos.y) * t
    const ground = groundAt(x, z) + 0.6
    if (ground > y) pos.y += (ground - y) / (1 - t)
  }
  return pos
}

const tangent = new Vector3()
const sample = new Vector3()
const heading = new Vector3(0, 0, -1) // smoothed trail direction the camera orbits from
const side = new Vector3()
const camDir = new Vector3()
const outDir = new Vector3()
const follow = new Vector3()
const followLook = new Vector3()
const intro = new Vector3()
const introLook = new Vector3()
const outro = new Vector3()
const outroLook = new Vector3()
const desired = new Vector3()
const desiredLook = new Vector3()
const look = ISLAND_CENTER.clone()
const view = { x: 0, y: 0 } // damped view offset, fractions of the screen
const orbit = { yaw: 0, pitch: 0, zoom: 1 } // damped copy of world.orbit
const offset = new Vector3()
const spherical = new Spherical()

// Trail direction averaged over a long stretch either side of u, so the camera
// follows the general way the trail goes, not every zigzag
function smoothTangent(u, target) {
  target.set(0, 0, 0)
  for (let k = -3; k <= 3; k++) {
    track.getTangentAt(MathUtils.clamp(u + k * 0.025, 0, 0.999), sample)
    target.add(sample)
  }
  target.y = 0
  return target.normalize()
}

// Opening: the camera starts high above the clouds, then spirals down through
// them to the world-map view while the island fades in; near the end the cat
// warps in on the beach. Skipped with reduced motion or when the page loads
// part-way down; scrolling during it hurries it along.
const INTRO_TIME = 4.5
const INTRO_HEIGHT = 150
const WARP_AT = 0.72 // point in the opening when the cat beams down
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const PLAYS_INTRO =
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.scrollY < 20

function introShot(t, narrow, target, lookTarget) {
  // A slow drift round the island, like an idle world map
  const a = 0.42 + (world.reducedMotion ? 0 : Math.sin(t * 0.07) * 0.12)
  const r = narrow ? 145 : 104
  const height = narrow ? 68 : 50
  const e = easeInOut(world.intro)
  // From high and close over the island, swinging round as it descends
  const swing = a + (1 - e) * 0.9
  const reach = r * (0.3 + 0.7 * e)
  target.set(ISLAND_CENTER.x + Math.sin(swing) * reach, MathUtils.lerp(INTRO_HEIGHT, height, e), ISLAND_CENTER.z + Math.cos(swing) * reach)
  lookTarget.copy(ISLAND_CENTER)
}

function outroShot(t, narrow, target, lookTarget) {
  const sway = world.reducedMotion ? 0 : Math.sin(t * 0.15) * 0.18
  const dir = camDir.copy(OUTRO_DIR).applyAxisAngle(UP, sway)
  const dist = narrow ? 13 : 9.5
  target.copy(peak).addScaledVector(dir, dist)
  target.y = peak.y + (narrow ? 5 : 3.6)
  keepClear(target)
  lookTarget.copy(world.pipPos).addScaledVector(UP, 1.3)
}

export const CAMERA_START = (() => {
  world.intro = PLAYS_INTRO ? 0 : 1
  introShot(0, false, intro, introLook)
  return intro.toArray()
})()
let introDecided = false

export default function Director() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => () => camera.clearViewOffset(), [camera])
  // Dev only: poke at the camera, renderer and scene from the console
  useEffect(() => {
    if (import.meta.env.DEV) window.__island = { world, camera, gl, scene, heading, look, advance }
  }, [camera, gl, scene])

  useFrame(({ camera, size, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime

    // The opening waits for the runner, so it plays with everything in place
    if (!introDecided && uiStore.get().ready) {
      introDecided = true
      if (world.reducedMotion || world.progress > 0.02) world.intro = 1
      if (world.intro >= 1) world.warp = 10
    }
    if (introDecided && world.intro < 1) {
      world.intro = Math.min(1, world.intro + dt / INTRO_TIME + (world.target > 0.02 ? dt * 0.8 : 0))
    }
    if (world.intro >= WARP_AT && world.warp < 0) world.warp = 0
    if (world.warp >= 0) world.warp += dt
    if (world.leaving >= 0) world.leaving += dt
    const lambda = world.reducedMotion ? 30 : 3.5
    world.progress = MathUtils.damp(world.progress, world.target, lambda, dt)
    const p = world.progress

    const u = progressToU(p)
    world.velocity = MathUtils.damp(world.velocity, (u - world.u) / Math.max(dt, 1e-4), 10, dt)
    world.u = u
    if (Math.abs(world.velocity) > 0.004) world.facing = Math.sign(world.velocity)

    trailPoint(u, world.pipPos)
    track.getTangentAt(Math.min(u, 0.999), tangent)
    tangent.y = 0
    tangent.normalize()
    world.pipDir.copy(tangent)

    const narrow = size.width / size.height < 0.8

    // Follow shot
    smoothTangent(u, sample)
    const turn = 1 - Math.exp(-(world.reducedMotion ? 30 : 2.5) * dt)
    heading.lerp(sample, turn).normalize()
    side.crossVectors(heading, UP).normalize()
    const s = shotAt(p)
    const reach = narrow ? 1.35 : 1
    camDir.copy(side).multiplyScalar(Math.cos(s.angle)).addScaledVector(heading, Math.sin(s.angle))
    if (s.outward > 0) {
      outDir.subVectors(world.pipPos, MASSIF).setY(0).normalize()
      camDir.lerp(outDir, s.outward).normalize()
    }
    followLook.copy(world.pipPos).addScaledVector(heading, s.ahead).addScaledVector(UP, s.lookUp)
    follow
      .copy(world.pipPos)
      .addScaledVector(camDir, s.dist * reach)
      .addScaledVector(UP, s.height * reach)
    keepLineOfSight(keepClear(follow), followLook)

    introShot(t, narrow, intro, introLook)
    outroShot(t, narrow, outro, outroLook)

    // Blend the three: map -> follow -> summit
    const toFollow = smoothstep(0.02, 0.11, p)
    const toOutro = smoothstep(0.88, 0.98, p)
    desired.lerpVectors(intro, follow, toFollow).lerp(outro, toOutro)
    desiredLook.lerpVectors(introLook, followLook, toFollow).lerp(outroLook, toOutro)

    // The viewer's own orbit, around whatever the shot is looking at
    const kOrbit = 1 - Math.exp(-(world.reducedMotion ? 30 : 7) * dt)
    orbit.yaw += (world.orbit.yaw - orbit.yaw) * kOrbit
    orbit.pitch += (world.orbit.pitch - orbit.pitch) * kOrbit
    orbit.zoom += (world.orbit.zoom - orbit.zoom) * kOrbit
    spherical.setFromVector3(offset.subVectors(desired, desiredLook))
    spherical.theta += orbit.yaw
    spherical.phi = MathUtils.clamp(spherical.phi - orbit.pitch, 0.2, 1.5)
    spherical.radius *= orbit.zoom
    desired.copy(desiredLook).add(offset.setFromSpherical(spherical))
    keepLineOfSight(keepClear(desired), desiredLook)

    // Warping out to the game: push in on the cat
    if (world.leaving >= 0) desired.lerp(desiredLook, Math.min(0.55, world.leaving * 0.6))

    // Tight follow during the opening, so its path plays as written
    const kPos = 1 - Math.exp(-(world.reducedMotion || world.intro < 1 ? 30 : 4) * dt)
    const kLook = 1 - Math.exp(-(world.reducedMotion ? 30 : 6) * dt)
    camera.position.lerp(desired, kPos)
    look.lerp(desiredLook, kLook)
    camera.lookAt(look)

    // Screen framing. Hero and summit: the island / runner sits below the
    // title or sign. Signs: beside them on wide screens, above them on phones.
    const hero = 1 - toFollow
    const signs = toFollow * (1 - toOutro)
    let vx = 0
    let vy = -0.1 * hero - (narrow ? 0.12 : 0.16) * toOutro
    if (narrow) vy += 0.2 * signs * smoothstep(0.08, 0.14, p)
    else vx = sideFraming(p) * 0.2
    const kView = 1 - Math.exp(-(world.reducedMotion ? 30 : 3) * dt)
    view.x += (vx - view.x) * kView
    view.y += (vy - view.y) * kView

    const fov = narrow ? 58 : 50
    if (camera.fov !== fov) camera.fov = fov
    const w = size.width
    const h = size.height
    camera.setViewOffset(w, h, view.x * w, view.y * h, w, h) // also updates the projection
  })
  return null
}
