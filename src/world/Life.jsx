import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Object3D } from 'three'
import { ZONES, groundAt, smoothstep } from './terrain'
import { BAMBOO, mulberry32 } from './layout'
import { TOON_RAMP } from './toon'
import { world } from '../store'

// Small things that move: butterflies over the meadow by day, fireflies in
// the jungle and the meadow as the sun goes down. Each is one instanced mesh.

// Two wings meeting at the body; flapping squashes them toward the body line
function wingsGeometry() {
  const g = new BufferGeometry()
  const v = [0, 0, 0.12, -0.32, 0.02, 0.05, 0, 0, -0.12, 0, 0, 0.12, 0, 0, -0.12, 0.32, 0.02, 0.05]
  g.setAttribute('position', new Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return g
}

const BUTTERFLY_COLORS = ['#ffd23f', '#ff8fb1', '#ffffff', '#ff9a3d', '#7cc6ff', '#c79bff']

function Butterflies() {
  const mesh = useRef()
  const geometry = useMemo(wingsGeometry, [])
  const dummy = useMemo(() => new Object3D(), [])
  const flock = useMemo(() => {
    const rand = mulberry32(44)
    const { meadow } = ZONES
    return Array.from({ length: 16 }, () => {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * meadow.radius * 0.8
      const x = meadow.x + Math.cos(a) * r
      const z = meadow.z + Math.sin(a) * r
      return { x, z, y: groundAt(x, z), seed: rand() * 100, wander: 1.5 + rand() * 2, speed: 0.4 + rand() * 0.4 }
    })
  }, [])

  useFrame(({ clock }) => {
    const t = world.reducedMotion ? 0 : clock.elapsedTime
    // They settle down as evening falls
    const day = 1 - smoothstep(0.75, 0.92, world.progress)
    flock.forEach((b, i) => {
      const s = t * b.speed + b.seed
      const x = b.x + Math.sin(s) * b.wander + Math.sin(s * 2.3) * 0.4
      const z = b.z + Math.cos(s * 0.8) * b.wander
      dummy.position.set(x, b.y + 0.8 + Math.sin(s * 3.1) * 0.35 + Math.abs(Math.sin(t * 9 + i)) * 0.1, z)
      // Face the way it's drifting
      dummy.rotation.set(0, Math.atan2(Math.cos(s) * b.wander, -Math.sin(s * 0.8) * 0.8 * b.wander), 0)
      const flap = Math.abs(Math.sin(t * 14 + i * 1.7))
      dummy.scale.set(0.25 + flap * 0.85, 1, 1).multiplyScalar(day * 1.3)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  const colors = useMemo(() => BUTTERFLY_COLORS.map((c) => new Color(c)), [])
  return (
    <instancedMesh
      ref={(m) => {
        mesh.current = m
        if (m && !m.instanceColor) flock.forEach((_, i) => m.setColorAt(i, colors[i % colors.length]))
      }}
      args={[geometry, undefined, flock.length]}
      frustumCulled={false}
    >
      <meshToonMaterial side={DoubleSide} gradientMap={TOON_RAMP} />
    </instancedMesh>
  )
}

function Fireflies() {
  const mesh = useRef()
  const material = useRef()
  const dummy = useMemo(() => new Object3D(), [])
  const swarm = useMemo(() => {
    const rand = mulberry32(73)
    const spots = [
      { ...ZONES.jungle, n: 26, r: ZONES.jungle.radius * 0.7 },
      { ...ZONES.meadow, n: 16, r: ZONES.meadow.radius * 0.7 },
      { x: BAMBOO.x, z: BAMBOO.z, n: 8, r: BAMBOO.radius + 2 },
    ]
    return spots.flatMap((spot) =>
      Array.from({ length: spot.n }, () => {
        const a = rand() * Math.PI * 2
        const r = Math.sqrt(rand()) * spot.r
        const x = spot.x + Math.cos(a) * r
        const z = spot.z + Math.sin(a) * r
        return { x, z, y: groundAt(x, z) + 0.6 + rand() * 2.2, seed: rand() * 100 }
      }),
    )
  }, [])

  useFrame(({ clock }) => {
    const t = world.reducedMotion ? 0 : clock.elapsedTime
    // Out once the light starts to go golden, brightest at the summit's sunset
    const dusk = smoothstep(0.55, 0.85, world.progress)
    material.current.opacity = dusk
    mesh.current.visible = dusk > 0.01
    if (!mesh.current.visible) return
    swarm.forEach((f, i) => {
      const s = t * 0.5 + f.seed
      dummy.position.set(f.x + Math.sin(s) * 1.2, f.y + Math.sin(s * 1.7) * 0.5, f.z + Math.cos(s * 0.9) * 1.2)
      // Each blinks on its own rhythm
      const blink = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2 + f.seed * 3))
      dummy.scale.setScalar(0.09 * blink)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, swarm.length]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial
        ref={material}
        color="#e8ff7a"
        transparent
        opacity={0}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

export default function Life() {
  return (
    <>
      <Butterflies />
      <Fireflies />
    </>
  )
}
