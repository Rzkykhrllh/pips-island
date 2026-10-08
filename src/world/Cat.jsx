import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { AnimationMixer, AnimationUtils, Box3, LoopOnce, MathUtils, MeshToonMaterial, SkinnedMesh } from 'three'
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

// Pin the hips' x/z translation to the first frame: the trail moves the cat,
// so the clip mustn't drift it
function pinHips(clip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('Hips.position')) continue
    const v = track.values
    const [x, , z] = v
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x
      v[i + 2] = z
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
  const root = useRef()
  const body = useRef()
  const swirl = useRef()
  const anim = useRef({ run: 0, heading: Math.PI, current: null, lastHop: Infinity, still: 0 })

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
    const mixer = new AnimationMixer(scene)
    const actions = {}
    for (const [name, clip] of Object.entries(gameClips(gltf.animations))) actions[name] = mixer.clipAction(clip)
    if (actions.spin) {
      actions.spin.setLoop(LoopOnce)
      actions.spin.clampWhenFinished = true
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
    // Stop scrolling for a moment and the cat turns to look at you
    a.still = a.run < 0.15 ? a.still + dt : 0
    const atSummit = world.progress > 0.94 && a.run < 0.3
    const target = atSummit || a.still > 0.7
      ? Math.atan2(state.camera.position.x - world.pipPos.x, state.camera.position.z - world.pipPos.z)
      : Math.atan2(dir.x * world.facing, dir.z * world.facing)
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

    // Pick a clip
    const waving = (world.progress < 0.07 || atSummit) && a.run < 0.2 && !world.reducedMotion
    let name
    if (spinning && actions.spin) name = 'spin'
    else if (waving && actions.victory) name = 'victory'
    else if (a.run > 0.55) name = 'run'
    else if (a.run > 0.12) name = 'walk'
    else name = 'idle'

    const next = actions[name]
    if (next !== a.current || (spun && name === 'spin')) {
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

  return (
    <group ref={root}>
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
