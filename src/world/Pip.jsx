import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'
import { uiStore, world } from '../store'
import { TOON_RAMP } from './toon'
import { dampAngle } from './math'

// Pip: an original sprout spirit built from primitives.
// The default runner is the cat (Cat.jsx); Pip is still here behind ?char=pip.

const COLORS = {
  body: '#3fcfae',
  belly: '#d4fbe9',
  leaf: '#8ee05a',
  feet: '#ff9a3d',
  cheek: '#ff8fa3',
}

function Eye({ x }) {
  return (
    <group position={[x, 0.1, 0.42]}>
      <mesh scale={[1, 1.15, 0.6]}>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshToonMaterial color="#ffffff" gradientMap={TOON_RAMP} />
      </mesh>
      <mesh position={[0, -0.01, 0.05]} scale={[1, 1.2, 0.6]}>
        <sphereGeometry args={[0.07, 14, 10]} />
        <meshToonMaterial color="#1c2b33" gradientMap={TOON_RAMP} />
      </mesh>
      <mesh position={[0.025, 0.035, 0.1]}>
        <sphereGeometry args={[0.022, 8, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

export default function Pip() {
  useEffect(() => uiStore.set({ runner: true }), [])
  const root = useRef()
  const body = useRef()
  const eyes = useRef()
  const leaf = useRef()
  const armL = useRef()
  const armR = useRef()
  const footL = useRef()
  const footR = useRef()
  const anim = useRef({ run: 0, phase: 0, heading: Math.PI, blink: 2 })

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05)
    const a = anim.current
    const t = state.clock.elapsedTime
    const speed = MathUtils.clamp(Math.abs(world.velocity) / 0.05, 0, 1)
    a.run = MathUtils.damp(a.run, speed, 8, dt)
    a.phase += dt * (5 + 11 * a.run)

    // Position & heading
    root.current.position.copy(world.pipPos)
    const dir = world.pipDir
    const atSummit = world.progress > 0.94 && a.run < 0.3
    const target = atSummit
      ? Math.atan2(state.camera.position.x - world.pipPos.x, state.camera.position.z - world.pipPos.z)
      : Math.atan2(dir.x * world.facing, dir.z * world.facing)
    a.heading = dampAngle(a.heading, target, 10, dt)
    root.current.rotation.y = a.heading

    // Hop (triggered when a crate breaks)
    world.hop += dt
    const hopT = world.hop / 0.45
    const hop = hopT < 1 ? Math.sin(hopT * Math.PI) * 0.7 : 0

    // Body: bob, lean, squash & stretch
    const bob = Math.abs(Math.sin(a.phase)) * 0.09 * a.run
    const breathe = Math.sin(t * 2.2) * 0.015 * (1 - a.run)
    body.current.position.y = 0.55 + bob + breathe + hop
    body.current.rotation.x = 0.18 * a.run
    const squash = 1 + Math.sin(a.phase * 2) * 0.04 * a.run + (hopT < 1 ? Math.sin(hopT * Math.PI) * 0.08 : 0)
    body.current.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))

    // Feet
    const stride = 0.2 * a.run
    footL.current.position.z = Math.sin(a.phase) * stride
    footR.current.position.z = -Math.sin(a.phase) * stride
    footL.current.position.y = 0.07 + Math.max(0, Math.cos(a.phase)) * 0.12 * a.run + hop
    footR.current.position.y = 0.07 + Math.max(0, -Math.cos(a.phase)) * 0.12 * a.run + hop

    // Arms: swing while running, wave hello on the beach
    const waving = (world.progress < 0.07 || atSummit) && a.run < 0.2 && !world.reducedMotion
    armL.current.rotation.x = -Math.sin(a.phase) * 0.9 * a.run
    armR.current.rotation.x = Math.sin(a.phase) * 0.9 * a.run
    armR.current.rotation.z = MathUtils.damp(
      armR.current.rotation.z,
      waving ? -2.3 + Math.sin(t * 9) * 0.35 : -0.25,
      10,
      dt,
    )
    armL.current.rotation.z = 0.25

    // Leaf sway & blink
    leaf.current.rotation.z = Math.sin(t * 3) * 0.12 + Math.sin(a.phase) * 0.15 * a.run
    leaf.current.rotation.x = -0.2 * a.run
    a.blink -= dt
    const closing = a.blink < 0.12 && a.blink > 0
    eyes.current.scale.y = closing ? 0.1 : 1
    if (a.blink <= 0) a.blink = 2 + Math.random() * 3
  })

  return (
    <group ref={root}>
      <group ref={body}>
        <mesh castShadow scale={[0.5, 0.47, 0.46]}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshToonMaterial color={COLORS.body} gradientMap={TOON_RAMP} />
        </mesh>
        <mesh position={[0, -0.08, 0.26]} scale={[0.33, 0.3, 0.22]}>
          <sphereGeometry args={[1, 20, 14]} />
          <meshToonMaterial color={COLORS.belly} gradientMap={TOON_RAMP} />
        </mesh>
        <group ref={eyes}>
          <Eye x={-0.16} />
          <Eye x={0.16} />
        </group>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, -0.04, 0.34]} scale={[1, 0.6, 0.4]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshToonMaterial color={COLORS.cheek} gradientMap={TOON_RAMP} />
          </mesh>
        ))}
        {/* Sprout on top */}
        <group ref={leaf} position={[0, 0.44, 0]}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.18, 6]} />
            <meshToonMaterial color="#5aa83c" gradientMap={TOON_RAMP} />
          </mesh>
          <mesh position={[-0.13, 0.19, 0]} rotation={[0, 0, 0.6]} scale={[0.17, 0.06, 0.1]} castShadow>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color={COLORS.leaf} flatShading gradientMap={TOON_RAMP} />
          </mesh>
          <mesh position={[0.13, 0.21, 0]} rotation={[0, 0, -0.5]} scale={[0.19, 0.06, 0.11]} castShadow>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color={COLORS.leaf} flatShading gradientMap={TOON_RAMP} />
          </mesh>
        </group>
        {/* Arms pivot at the shoulder */}
        <group ref={armL} position={[0.45, 0, 0]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.14, 4, 8]} />
            <meshToonMaterial color={COLORS.body} gradientMap={TOON_RAMP} />
          </mesh>
        </group>
        <group ref={armR} position={[-0.45, 0, 0]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.14, 4, 8]} />
            <meshToonMaterial color={COLORS.body} gradientMap={TOON_RAMP} />
          </mesh>
        </group>
      </group>
      {[footL, footR].map((ref, i) => (
        <mesh key={i} ref={ref} position={[i ? -0.18 : 0.18, 0.07, 0]} scale={[0.13, 0.08, 0.19]} castShadow>
          <sphereGeometry args={[1, 12, 8]} />
          <meshToonMaterial color={COLORS.feet} gradientMap={TOON_RAMP} />
        </mesh>
      ))}
    </group>
  )
}
