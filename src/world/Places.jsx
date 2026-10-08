import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { groundAt } from './terrain'
import { BOAT, CAMPFIRE, DOCK, POND, RUINS, RUINS_BASE, mulberry32 } from './layout'
import { Instances, Puffs, Toon } from './Landmarks'
import { windSway } from './wind'
import Baked from './Baked'
import { world } from '../store'

// Places to look at between the trail and the sea: a pond with lily pads in the
// meadow, temple ruins in the west, a jetty and a rowboat at the village, and
// a campfire between the huts.

// ---------------------------------------------------------------- fire

// Flickering flames: a few glowing cones that stretch and squash out of step
function Flame({ position, size = 1 }) {
  const group = useRef()
  useFrame(({ clock }) => {
    const t = world.reducedMotion ? 0 : clock.elapsedTime
    group.current.children.forEach((m, i) => {
      const k = 1 + Math.sin(t * (9 + i * 3.1) + i * 2) * 0.18 + Math.sin(t * 17 + i) * 0.08
      m.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k))
    })
  })
  return (
    <group ref={group} position={position} scale={size}>
      <mesh position-y={0.45}>
        <coneGeometry args={[0.42, 0.9, 6]} />
        <meshBasicMaterial color="#ff6a1a" toneMapped={false} />
      </mesh>
      <mesh position-y={0.4}>
        <coneGeometry args={[0.28, 0.75, 6]} />
        <meshBasicMaterial color="#ffb02e" toneMapped={false} />
      </mesh>
      <mesh position-y={0.32}>
        <coneGeometry args={[0.15, 0.5, 5]} />
        <meshBasicMaterial color="#fff2a8" toneMapped={false} />
      </mesh>
    </group>
  )
}

// A warm light that wavers with the flames, brighter as the evening comes
function FireLight({ position }) {
  const light = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const flicker = world.reducedMotion ? 1 : 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.07
    light.current.intensity = (25 + world.progress * 40) * flicker
  })
  return <pointLight ref={light} position={position} color="#ff9a40" distance={14} decay={2} />
}

function Campfire() {
  const { x, z } = CAMPFIRE
  const y = groundAt(x, z)
  const stones = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        return { pos: [x + Math.cos(a) * 0.85, y + 0.08, z + Math.sin(a) * 0.85], rot: [a, a * 2, 0], scale: 0.22 }
      }),
    [x, y, z],
  )
  return (
    <>
      <Instances items={stones} color="#8d8478">
        <dodecahedronGeometry args={[1, 0]} />
      </Instances>
      <Baked>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[x, y + 0.12, z]} rotation={[0, (i * Math.PI) / 4, 0.25]}>
            <cylinderGeometry args={[0.09, 0.11, 1.1, 5]} />
            <Toon color="#5e3a1a" />
          </mesh>
        ))}
        {/* Log benches */}
        {[0.6, 2.4].map((a, i) => (
          <mesh key={i} position={[x + Math.cos(a) * 2.2, y + 0.25, z + Math.sin(a) * 2.2]} rotation={[0, -a, Math.PI / 2]}>
            <cylinderGeometry args={[0.25, 0.28, 1.8, 7]} />
            <Toon color="#8a5a32" />
          </mesh>
        ))}
      </Baked>
      <Flame position={[x, y + 0.1, z]} />
      <FireLight position={[x, y + 1.2, z]} />
      <Puffs at={new Vector3(x, y + 1.1, z)} count={6} color="#9a938c" rise={4.5} spread={0.8} size={0.45} period={3.5} />
    </>
  )
}

// ---------------------------------------------------------------- pond

function Pond() {
  const { x, z, water } = POND
  const reeds = useMemo(() => {
    const rand = mulberry32(31)
    const out = []
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2
      const r = POND.radius * (0.95 + rand() * 0.35)
      const px = x + Math.cos(a) * r
      const pz = z + Math.sin(a) * r
      out.push({ pos: [px, Math.max(groundAt(px, pz), water) + 0.6, pz], rot: [(rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3], scale: [1, 0.7 + rand() * 0.8, 1] })
    }
    return out
  }, [x, z, water])
  const pads = useMemo(() => {
    const rand = mulberry32(17)
    return Array.from({ length: 9 }, () => {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * POND.radius * 0.7
      return { pos: [x + Math.cos(a) * r, water + 0.03, z + Math.sin(a) * r], rot: [0, rand() * 6.28, 0], scale: 0.6 + rand() * 0.5 }
    })
  }, [x, z, water])
  const reedSway = useMemo(() => windSway({ perHeight: 0.25 }), [])
  const pond = useRef()
  useFrame(({ clock }) => {
    if (!world.reducedMotion) pond.current.position.y = water + Math.sin(clock.elapsedTime * 0.8) * 0.02
  })

  return (
    <>
      <mesh ref={pond} position={[x, water, z]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[POND.radius * 1.25, 28]} />
        <Toon color="#3fb0c8" transparent opacity={0.9} />
      </mesh>
      {/* Lily pads: discs with a notch, and a couple of pink flowers */}
      <Instances items={pads} color="#4caf4a" shadow={false}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 12, 1, false, 0.35, Math.PI * 2 - 0.35]} />
      </Instances>
      <Instances items={pads.slice(0, 3).map((p) => ({ ...p, pos: [p.pos[0] + 0.1, p.pos[1] + 0.08, p.pos[2]], scale: 0.9 }))} color="#ff8fb1" shadow={false}>
        <icosahedronGeometry args={[0.16, 0]} />
      </Instances>
      <Instances items={reeds} color="#5f9e3a" shadow={false} {...reedSway}>
        <coneGeometry args={[0.05, 1.6, 3]} />
      </Instances>
    </>
  )
}

// ---------------------------------------------------------------- ruins

// Old stone temple: a stepped platform, standing and broken pillars with a
// lintel, a fallen column, loose blocks with moss, and a brazier still burning
function Ruins() {
  const { x, z, rot } = RUINS
  const y = RUINS_BASE
  const stone = '#c2b69c'
  const dark = '#a3977e'
  const moss = '#5c9a45'
  const pillar = (px, pz, h, key) => (
    <group key={key} position={[px, 1.1, pz]}>
      <mesh position-y={h / 2}>
        <cylinderGeometry args={[0.32, 0.38, h, 8]} />
        <Toon color={stone} />
      </mesh>
      <mesh position-y={0.12}>
        <boxGeometry args={[0.95, 0.25, 0.95]} />
        <Toon color={dark} />
      </mesh>
      {h > 2 && (
        <mesh position-y={h + 0.12}>
          <boxGeometry args={[0.95, 0.25, 0.95]} />
          <Toon color={dark} />
        </mesh>
      )}
    </group>
  )
  return (
    <group position={[x, y, z]} rotation-y={rot}>
      <Baked>
        {/* Two-tier platform with steps up the front */}
        <mesh position-y={0.4}>
          <boxGeometry args={[8.5, 0.8, 6.5]} />
          <Toon color={dark} />
        </mesh>
        <mesh position-y={0.95}>
          <boxGeometry args={[6, 0.4, 4.6]} />
          <Toon color={stone} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.15 + i * 0.27, 3.6 + (2 - i) * 0.45]}>
            <boxGeometry args={[2.6, 0.3, 0.5]} />
            <Toon color={stone} />
          </mesh>
        ))}
        {pillar(-2.4, -1.7, 3.2, 'a')}
        {pillar(2.4, -1.7, 3.2, 'b')}
        {pillar(-2.4, 1.7, 1.3, 'c')}
        {pillar(2.4, 1.7, 2.4, 'd')}
        {/* Lintel across the back pair */}
        <mesh position={[0, 1.1 + 3.55, -1.7]}>
          <boxGeometry args={[5.6, 0.5, 0.8]} />
          <Toon color={stone} />
        </mesh>
        {/* A fallen column and loose blocks */}
        <mesh position={[4.6, 0.35, 2.2]} rotation={[0, 0.6, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.36, 2.8, 8]} />
          <Toon color={stone} />
        </mesh>
        {[
          [-4.8, 0.3, 1.5, 0.3],
          [-4.2, 0.25, -2.6, 1.1],
          [3.9, 0.3, -3.4, 0.5],
        ].map(([bx, by, bz, r], i) => (
          <mesh key={i} position={[bx, by, bz]} rotation-y={r}>
            <boxGeometry args={[0.9, 0.6, 0.7]} />
            <Toon color={dark} />
          </mesh>
        ))}
        {/* Moss on the stones */}
        {[
          [-2.4, 2.5, 1.7],
          [-4.8, 0.65, 1.5],
          [3.9, 0.65, -3.4],
          [2.6, 4.9, -1.7],
          [-3, 1.2, -2],
        ].map(([mx, my, mz], i) => (
          <mesh key={i} position={[mx, my, mz]} scale={[0.45, 0.18, 0.45]}>
            <icosahedronGeometry args={[1, 0]} />
            <Toon color={moss} />
          </mesh>
        ))}
        {/* Brazier bowl on the top tier */}
        <mesh position={[0, 1.45, 0]}>
          <cylinderGeometry args={[0.55, 0.3, 0.5, 8]} />
          <Toon color="#6d6455" />
        </mesh>
      </Baked>
      {/* Flame only: every point light costs every lit material, so just the campfire and the lava get one */}
      <Flame position={[0, 1.6, 0]} size={0.8} />
    </group>
  )
}

// ---------------------------------------------------------------- jetty

function Dock() {
  const { x0, x1, z, y } = DOCK
  const planks = []
  for (let px = x0; px <= x1; px += 0.42) planks.push(px)
  const posts = []
  for (let px = x0 + 0.5; px <= x1; px += 2.6) posts.push(px)
  return (
    <Baked>
      {planks.map((px, i) => (
        <mesh key={i} position={[px, y + (i % 3 === 0 ? 0.02 : 0), z]} rotation-y={((i * 37) % 5) * 0.01}>
          <boxGeometry args={[0.38, 0.1, 2]} />
          <Toon color={i % 4 ? '#b07a42' : '#9c6a37'} />
        </mesh>
      ))}
      {posts.flatMap((px, i) =>
        [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} position={[px, y - 1, z + s * 1.05]}>
            <cylinderGeometry args={[0.12, 0.14, 2.6, 6]} />
            <Toon color="#6e4526" />
          </mesh>
        )),
      )}
    </Baked>
  )
}

// A rowboat tied at the end of the jetty, rocking on the swell
function Boat() {
  const boat = useRef()
  useFrame(({ clock }) => {
    const t = world.reducedMotion ? 0 : clock.elapsedTime
    boat.current.position.y = -0.05 + Math.sin(t * 1.1) * 0.08
    boat.current.rotation.z = Math.sin(t * 0.9 + 1) * 0.06
    boat.current.rotation.x = Math.sin(t * 0.7) * 0.03
  })
  return (
    <group ref={boat} position={[BOAT.x, 0, BOAT.z]} rotation-y={0.15}>
      <Baked castShadow>
        <mesh position-y={0.2} scale={[1, 0.5, 0.42]}>
          <sphereGeometry args={[1.5, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <Toon color="#c8323a" />
        </mesh>
        <mesh position-y={0.21} scale={[1, 0.08, 0.42]}>
          <cylinderGeometry args={[1.38, 1.38, 1, 12]} />
          <Toon color="#f2e6cf" />
        </mesh>
        {[-0.5, 0.45].map((bx) => (
          <mesh key={bx} position={[bx, 0.28, 0]}>
            <boxGeometry args={[0.25, 0.08, 1.15]} />
            <Toon color="#9c6a37" />
          </mesh>
        ))}
        <mesh position={[0.2, 0.33, 0.25]} rotation={[0.2, 0.4, 1.35]}>
          <cylinderGeometry args={[0.04, 0.04, 1.9, 4]} />
          <Toon color="#8a5a32" />
        </mesh>
      </Baked>
    </group>
  )
}

export default function Places() {
  return (
    <>
      <Pond />
      <Ruins />
      <Dock />
      <Boat />
      <Campfire />
    </>
  )
}
