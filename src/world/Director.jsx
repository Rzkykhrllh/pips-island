import { useFrame } from '@react-three/fiber'
import { MathUtils, Vector3 } from 'three'
import { heightAt, smoothstep } from './terrain'
import { markerU, progressToU, track, trailPoint } from './track'
import { world } from '../store'

// Turns scroll progress into Pip's position and a chase camera.

const UP = new Vector3(0, 1, 0)
const INTRO_POS = new Vector3(6, 7, 102)
const INTRO_LOOK = new Vector3(0, 2.5, 46)

const peak = trailPoint(markerU.peak)
const OUTRO_POS = peak.clone().add(new Vector3(10, 4.5, 9))
const OUTRO_LOOK = peak.clone().add(new Vector3(0, 1.4, 0))

const tangent = new Vector3()
const side = new Vector3()
const follow = new Vector3()
const followLook = new Vector3()
const desired = new Vector3()
const desiredLook = new Vector3()
const look = INTRO_LOOK.clone()
const forward = new Vector3()
const right = new Vector3()

// Which side of the screen Pip should sit on, so the text sign never covers him.
// +1 = Pip on the left (sign on the right), -1 = Pip on the right (sign on the left).
function framing(p) {
  const meet = smoothstep(0.1, 0.16, p) * (1 - smoothstep(0.3, 0.35, p))
  const crates = smoothstep(0.3, 0.35, p) * (1 - smoothstep(0.64, 0.68, p))
  const bridge = smoothstep(0.64, 0.68, p) * (1 - smoothstep(0.85, 0.9, p))
  return crates - meet - bridge
}

export const CAMERA_START = INTRO_POS.toArray()

export default function Director() {
  useFrame(({ camera, size }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
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

    // Side cam, slightly ahead of Pip, so we see his face as he runs toward the summit.
    side.crossVectors(tangent, UP).normalize()
    const narrow = size.width / size.height < 0.8
    const reach = narrow ? 1.55 : 1 // portrait screens need more distance to fit Pip in
    follow
      .copy(world.pipPos)
      .addScaledVector(tangent, 1.6 * reach)
      .addScaledVector(side, 3.6 * reach)
      .add(UP.clone().multiplyScalar(1.6 * reach))
    // Never let the camera dip into a hillside.
    follow.y = Math.max(follow.y, heightAt(follow.x, follow.z) + 1.3, world.pipPos.y + 1.1)
    followLook.copy(world.pipPos).addScaledVector(tangent, 0.5).add(UP.clone().multiplyScalar(0.7))

    // Shift the look target sideways so Pip sits beside the sign. On narrow screens
    // the sign sits at the bottom, so lift Pip into the upper half instead.
    forward.subVectors(followLook, follow).normalize()
    right.crossVectors(forward, UP).normalize()
    if (narrow) followLook.y -= 1.1
    else followLook.addScaledVector(right, framing(p) * 1.5)

    const intro = smoothstep(0, 0.1, p)
    const outro = smoothstep(0.9, 1, p)
    desired.lerpVectors(INTRO_POS, follow, intro).lerp(OUTRO_POS, outro)
    desiredLook.lerpVectors(INTRO_LOOK, followLook, intro).lerp(OUTRO_LOOK, outro)
    if (narrow) desiredLook.y += 2.2 * outro // keep Pip below the summit sign

    const k = 1 - Math.exp(-(world.reducedMotion ? 30 : 5) * dt)
    camera.position.lerp(desired, k)
    look.lerp(desiredLook, k)
    camera.lookAt(look)
  })
  return null
}
