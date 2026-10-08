import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { AnimationMixer, AnimationUtils, Box3, LoopOnce, MathUtils, MeshToonMaterial, Plane, SkinnedMesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import catUrl from '../assets/cat.glb?url'
import { uiStore, world } from '../store'
import { dampAngle } from './math'
import { OUTLINE, TOON_RAMP } from './toon'

// The tabby cat from web-3d-project: a rigged GLB with Mixamo clips
// (idle, walk, run, victory, spin, ...). Same job as Pip.jsx: follow the trail,
// face the way we're going, spin through crates like in the game, cheer at the
// start and the summit.

const HEIGHT = 1.5 // ear tip to sole, a little taller than Pip
const FPS = 30
// The game's spin attack (web-3d-project/src/config.js: spinTime, spinTurns)
const SPIN_TIME = 0.45
const SPIN_TURNS = 3
const JUMP_TIME = 0.6
const JUMP_HEIGHT = 1.2

// Play with the cat: K or X spins (the game's keys), J jumps. Space is left
// alone so it still scrolls the page.
function useCatKeys() {
  useEffect(() => {
    const down = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      const k = e.key.toLowerCase()
      if (k === 'k' || k === 'x') world.hop = 0
      else if (k === 'j' && world.jump > JUMP_TIME * 0.8) world.jump = 0
    }
    const moved = () => (world.pointerAt = performance.now())
    window.addEventListener('keydown', down)
    window.addEventListener('pointermove', moved, { passive: true })
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('pointermove', moved)
    }
  }, [])
}

const ground = new Plane(new Vector3(0, 1, 0), 0)
const lookPoint = new Vector3()

// Pin the hips' translation to the first frame: x/z always (the trail moves
// the cat, so the clip mustn't drift it), y too when `all` (the jump clip
// lifts the hips, which would stack on top of our own jump arc)
function pinHips(clip, all = false) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('Hips.position')) continue
    const v = track.values
    const [x, y, z] = v
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x
      v[i + 2] = z
      if (all) v[i + 1] = y
    }
  }
  return clip
}
const cut = (clip, name, from, to) =>
  AnimationUtils.subclip(clip, name, Math.round(from * FPS), Math.round(to * FPS), FPS)

function gameClips(animations) {
  const src = Object.fromEntries(animations.map((c) => [c.name, c]))
  const out = {}
  for (const name of ['idle', 'walk', 'run', 'victory']) if (src[name]) out[name] = pinHips(src[name])
  // Spin: a held pose while we do the turning, same as the game. The T-pose
  // (arms straight out) if the model has it, else the arms-out frame of the melee clip
  if (src.tpose) out.spin = pinHips(cut(src.tpose, 'spin', 0, 0.07))
  else if (src.spin) out.spin = pinHips(cut(src.spin, 'spin', 1.1, 1.17))
  if (src.jump) {
    out.jump = pinHips(cut(src.jump, 'jump', 0.5, 0.8), true) // take-off to the top
    out.fall = pinHips(cut(src.jump, 'fall', 0.85, 1.0), true) // legs reaching down
  }
  return out
}

// Dark shell pushed out along the normals after skinning, so the cat gets the
// same cartoon outline as in the game
function outlineFor(mesh, thickness) {
  const mat = OUTLINE.clone()
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinning_vertex>',
      `#include <skinning_vertex>\n transformed += normalize(objectNormal) * ${thickness.toFixed(5)};`,
    )
  }
  const hull = new SkinnedMesh(mesh.geometry, mat)
  hull.bind(mesh.skeleton, mesh.bindMatrix)
  hull.position.copy(mesh.position)
  hull.quaternion.copy(mesh.quaternion)
  hull.scale.copy(mesh.scale)
  hull.frustumCulled = false
  return hull
}

const withMeshopt = (loader) => loader.setMeshoptDecoder(MeshoptDecoder)
// Start downloading as soon as this chunk loads, not when the cat first renders
useLoader.preload(GLTFLoader, catUrl, withMeshopt)

export default function Cat() {
  const gltf = useLoader(GLTFLoader, catUrl, withMeshopt)
  useEffect(() => uiStore.set({ ready: true }), [])
  useCatKeys()
  const gl = useThree((s) => s.gl)
  const root = useRef()
  const body = useRef()
  const swirl = useRef()
  const anim = useRef({ run: 0, heading: Math.PI, current: null, lastHop: Infinity, lastJump: Infinity, still: 0 })

  const { scene, scale, lift, mixer, actions } = useMemo(() => {
    const scene = clone(gltf.scene)
    scene.updateMatrixWorld(true)
    const box = new Box3().setFromObject(scene)
    const scale = HEIGHT / (box.max.y - box.min.y)
    const skinned = []
    scene.traverse((o) => o.isSkinnedMesh && skinned.push(o))
    for (const m of skinned) {
      // Toon shading like the rest of the island (the FBX-converted material is
      // metallic and reads almost black without an environment map)
      m.material = new MeshToonMaterial({ map: m.material.map, gradientMap: TOON_RAMP })
      m.castShadow = true
      m.frustumCulled = false // the bind-pose bounds don't follow the animation
      m.parent.add(outlineFor(m, 0.012 / scale))
    }
    // Pointer events use the hit box instead (see below)
    scene.traverse((o) => {
      if (o.isMesh) o.raycast = () => {}
    })
    const mixer = new AnimationMixer(scene)
    const actions = {}
    for (const [name, clip] of Object.entries(gameClips(gltf.animations))) actions[name] = mixer.clipAction(clip)
    for (const name of ['spin', 'jump', 'fall']) {
      if (!actions[name]) continue
      actions[name].setLoop(LoopOnce)
      actions[name].clampWhenFinished = true
    }
    // A hair of clearance, so a planted foot never dips below the path
    return { scene, scale, lift: -box.min.y * scale + 0.03, mixer, actions }
  }, [gltf])

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05)
    const a = anim.current
    const speed = MathUtils.clamp(Math.abs(world.velocity) / 0.05, 0, 1)
    a.run = MathUtils.damp(a.run, speed, 8, dt)

    // Position & heading
    root.current.position.copy(world.pipPos)
    const dir = world.pipDir
    // Stop scrolling for a moment and the cat turns to look at you, or at
    // wherever your pointer is on the island if you've moved it lately
    a.still = a.run < 0.15 ? a.still + dt : 0
    const atSummit = world.progress > 0.94 && a.run < 0.3
    let target = Math.atan2(dir.x * world.facing, dir.z * world.facing)
    if (atSummit || a.still > 0.7) {
      target = Math.atan2(state.camera.position.x - world.pipPos.x, state.camera.position.z - world.pipPos.z)
      if (performance.now() - world.pointerAt < 4000) {
        ground.constant = -world.pipPos.y
        state.raycaster.setFromCamera(state.pointer, state.camera)
        const hit = state.raycaster.ray.intersectPlane(ground, lookPoint)
        if (hit && hit.distanceToSquared(world.pipPos) > 1) target = Math.atan2(hit.x - world.pipPos.x, hit.z - world.pipPos.z)
      }
    }
    a.heading = dampAngle(a.heading, target, 10, dt)
    root.current.rotation.y = a.heading

    // Spin through the crate (a crate breaking resets world.hop): arms out,
    // three fast turns with an ease-out, and the swirl ring round the body
    world.hop += dt
    const spinT = world.hop / SPIN_TIME
    const spinning = spinT < 1
    const spun = world.hop < a.lastHop
    a.lastHop = world.hop
    const turn = spinning && !world.reducedMotion ? 1 - (1 - spinT) ** 2 : 0
    body.current.rotation.y = turn * Math.PI * 2 * SPIN_TURNS
    swirl.current.visible = spinning
    if (spinning) {
      swirl.current.material.opacity = 0.7 * Math.sin(spinT * Math.PI)
      swirl.current.scale.setScalar(0.85 + spinT * 0.3)
    }

    // Jump (J): our own arc, the clips pose the legs
    world.jump += dt
    const jumpT = world.jump / JUMP_TIME
    const jumping = jumpT < 1
    const jumped = world.jump < a.lastJump
    a.lastJump = world.jump
    if (jumping) root.current.position.y += Math.sin(jumpT * Math.PI) * JUMP_HEIGHT

    // Warp in (opening shot) and out (Play): spin up from nothing, spin away to nothing
    const warpIn = world.warp < 0 ? 0 : Math.min(1, world.warp / 0.7)
    const warpOut = world.leaving < 0 ? 0 : Math.min(1, world.leaving / 0.6)
    const presence = warpIn * (1 - warpOut)
    root.current.scale.setScalar(Math.max(0.0001, presence < 1 ? 1 - (1 - presence) ** 2 : 1))
    if (presence < 1) body.current.rotation.y += (1 - presence) * Math.PI * 4

    // Pick a clip
    const waving = (world.progress < 0.07 || atSummit) && a.run < 0.2 && !world.reducedMotion
    let name
    if (spinning && actions.spin) name = 'spin'
    else if (jumping && actions.jump) name = jumpT < 0.5 ? 'jump' : 'fall'
    else if (waving && actions.victory) name = 'victory'
    else if (a.run > 0.55) name = 'run'
    else if (a.run > 0.12) name = 'walk'
    else name = 'idle'

    const next = actions[name]
    if (next !== a.current || (spun && name === 'spin') || (jumped && name === 'jump')) {
      const fade = name === 'spin' ? 0.05 : 0.15
      next.reset().setEffectiveWeight(1).fadeIn(fade).play()
      if (a.current !== next) a.current?.fadeOut(fade)
      a.current = next
    }
    // Match the feet to the scroll speed
    if (name === 'run') next.timeScale = 0.7 + 0.5 * a.run
    if (name === 'walk') next.timeScale = 0.6 + 1.2 * a.run
    mixer.update(dt)
  })

  // Click or tap the cat to make it spin
  const onClick = (e) => {
    if (e.delta > 8) return
    e.stopPropagation()
    world.hop = 0
  }
  const hover = (on) => (e) => {
    e.stopPropagation()
    gl.domElement.style.cursor = on ? 'pointer' : ''
  }

  return (
    <group ref={root}>
      {/* Clicks land on this invisible box, not on the skinned mesh: raycasting
          ~18k skinned triangles on every pointer move would be slow */}
      <mesh position-y={0.75} onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        <boxGeometry args={[0.9, 1.5, 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <group ref={body}>
        <group scale={scale} position-y={lift}>
          <primitive object={scene} />
        </group>
      </group>
      {/* Spin effect, same ring as the game */}
      <mesh ref={swirl} position-y={0.75} rotation-x={Math.PI / 2} visible={false}>
        <torusGeometry args={[0.95, 0.06, 6, 28]} />
        <meshBasicMaterial color="#fff3d1" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
