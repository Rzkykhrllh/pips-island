import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
} from 'three'
import { groundAt, shoreRadius, smoothstep } from './terrain'
import { CAMPFIRE, DOCK, HUTS, LAVA, TOWER, groundPath, mulberry32 } from './layout'
import { TOON_RAMP } from './toon'
import { painted } from './paint'
import { world } from '../store'

// The island's residents and passers-by: villagers about the village, crabs
// on the beaches, fish leaping offshore, sailboats going round, bubbles on
// the lava and petals on the breeze. Each kind is one instanced mesh (two for
// the villagers), so all of it adds only a handful of draw calls; nothing here
// casts shadows.

const dummy = new Object3D()
const toonProps = { vertexColors: true, flatShading: true, gradientMap: TOON_RAMP }

// Write one instance's transform from the shared dummy
function place(mesh, i, x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx, roll = 0, pitch = 0) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(pitch, yaw, roll, 'YXZ')
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}
const time = (clock) => (world.reducedMotion ? 0 : clock.elapsedTime)

// ---------------------------------------------------------------- villagers

const SKIN = '#8a5a32'
const villagerBase = () =>
  painted([
    [new CylinderGeometry(0.07, 0.07, 0.36, 5).translate(-0.09, 0.18, 0), '#5e3a1a'],
    [new CylinderGeometry(0.07, 0.07, 0.36, 5).translate(0.09, 0.18, 0), '#5e3a1a'],
    [new CylinderGeometry(0.055, 0.055, 0.42, 5).rotateZ(0.25).translate(-0.27, 0.62, 0), SKIN],
    [new CylinderGeometry(0.055, 0.055, 0.42, 5).rotateZ(-0.25).translate(0.27, 0.62, 0), SKIN],
    [new SphereGeometry(0.19, 10, 8).translate(0, 1.04, 0), SKIN],
    [new SphereGeometry(0.03, 6, 4).translate(-0.07, 1.07, 0.17), '#1e1e22'],
    [new SphereGeometry(0.03, 6, 4).translate(0.07, 1.07, 0.17), '#1e1e22'],
    [new ConeGeometry(0.34, 0.24, 9).translate(0, 1.27, 0), '#e7b53a'],
  ])
// The shirt is white, tinted per villager by the instance colour
const villagerShirt = () => painted([[new CylinderGeometry(0.19, 0.24, 0.5, 8).translate(0, 0.6, 0), '#ffffff']])
const SHIRTS = ['#c8323a', '#2f5fb3', '#e0a020', '#2fa39a', '#f2e6cf']

// How each villager spends its time: walking a circle round the fire, pacing
// between a hut and the jetty, or sitting at the end of the jetty fishing
function villagerRoutines() {
  const fire = CAMPFIRE
  const hut = HUTS[1]
  return [
    { kind: 'circle', cx: fire.x, cz: fire.z, r: 3.2, speed: 0.32, phase: 0 },
    { kind: 'circle', cx: fire.x, cz: fire.z, r: 4.4, speed: -0.22, phase: 2.5 },
    { kind: 'pace', ax: hut.x + 1, az: hut.z - 2.2, bx: DOCK.x0 + 0.5, bz: DOCK.z, period: 16 },
    { kind: 'sit', x: DOCK.x1 - 0.6, z: DOCK.z - 0.55, y: DOCK.y + 0.05, yaw: Math.PI / 2 },
    { kind: 'idle', x: TOWER.x + 1.6, z: TOWER.z - 1.4, yaw: -2.4 },
  ]
}

function Villagers() {
  const base = useRef()
  const shirts = useRef()
  const geos = useMemo(() => ({ base: villagerBase(), shirt: villagerShirt() }), [])
  const routines = useMemo(villagerRoutines, [])
  useLayoutEffect(() => {
    const c = new Color()
    routines.forEach((_, i) => shirts.current.setColorAt(i, c.set(SHIRTS[i % SHIRTS.length])))
    shirts.current.instanceColor.needsUpdate = true
  }, [routines])

  useFrame(({ clock }) => {
    const t = time(clock)
    routines.forEach((r, i) => {
      let x, z, yaw, walking
      if (r.kind === 'circle') {
        const a = r.phase + t * r.speed
        x = r.cx + Math.cos(a) * r.r
        z = r.cz + Math.sin(a) * r.r
        yaw = Math.atan2(-Math.sin(a) * Math.sign(r.speed), Math.cos(a) * Math.sign(r.speed))
        walking = true
      } else if (r.kind === 'pace') {
        // Walk there, stand a moment, walk back
        const u = (t / r.period) % 1
        const leg = u < 0.5 ? smoothstep(0.05, 0.42, u) : 1 - smoothstep(0.55, 0.92, u)
        x = r.ax + (r.bx - r.ax) * leg
        z = r.az + (r.bz - r.az) * leg
        const out = u < 0.5
        yaw = Math.atan2((r.bx - r.ax) * (out ? 1 : -1), (r.bz - r.az) * (out ? 1 : -1))
        walking = (u > 0.05 && u < 0.42) || (u > 0.55 && u < 0.92)
      } else {
        x = r.x
        z = r.z
        yaw = r.yaw
        walking = false
      }
      const y = r.kind === 'sit' ? r.y : groundAt(x, z)
      const bob = walking ? Math.abs(Math.sin(t * 7 + i)) * 0.07 : Math.sin(t * 1.5 + i) * 0.015
      const sway = walking ? Math.sin(t * 7 + i) * 0.08 : 0
      const squash = r.kind === 'sit' ? 0.72 : 1 // sitting: shorter, legs tucked
      place(base.current, i, x, y + bob, z, yaw, 1, squash, 1, sway)
      place(shirts.current, i, x, y + bob, z, yaw, 1, squash, 1, sway)
    })
    base.current.instanceMatrix.needsUpdate = true
    shirts.current.instanceMatrix.needsUpdate = true
  })

  // The angler's rod, out over the water
  const angler = routines.find((r) => r.kind === 'sit')
  return (
    <>
      <instancedMesh ref={base} args={[geos.base, undefined, routines.length]} frustumCulled={false}>
        <meshToonMaterial {...toonProps} />
      </instancedMesh>
      <instancedMesh ref={shirts} args={[geos.shirt, undefined, routines.length]} frustumCulled={false}>
        <meshToonMaterial {...toonProps} />
      </instancedMesh>
      <mesh position={[angler.x + 0.9, angler.y + 0.75, angler.z]} rotation={[0, 0, -1.05]}>
        <cylinderGeometry args={[0.015, 0.025, 2.2, 4]} />
        <meshToonMaterial color="#6e4526" gradientMap={TOON_RAMP} />
      </mesh>
    </>
  )
}

// ---------------------------------------------------------------- crabs

const crabGeometry = () =>
  painted([
    [new SphereGeometry(0.25, 10, 6).scale(1, 0.45, 0.75).translate(0, 0.12, 0), '#e2533a'],
    [new SphereGeometry(0.1, 6, 4).scale(1, 0.8, 1.2).translate(-0.31, 0.12, 0.17), '#f06a4a'],
    [new SphereGeometry(0.1, 6, 4).scale(1, 0.8, 1.2).translate(0.31, 0.12, 0.17), '#f06a4a'],
    [new CylinderGeometry(0.015, 0.015, 0.14, 3).translate(-0.08, 0.24, 0.12), '#c94430'],
    [new CylinderGeometry(0.015, 0.015, 0.14, 3).translate(0.08, 0.24, 0.12), '#c94430'],
    [new SphereGeometry(0.035, 6, 4).translate(-0.08, 0.32, 0.12), '#1e1e22'],
    [new SphereGeometry(0.035, 6, 4).translate(0.08, 0.32, 0.12), '#1e1e22'],
    ...[-1, 1].flatMap((s) =>
      [-0.1, 0, 0.1].map((dz) => [new CylinderGeometry(0.018, 0.012, 0.22, 3).rotateZ(s * 1.0).translate(s * 0.26, 0.06, dz), '#c94430']),
    ),
  ])

function Crabs() {
  const mesh = useRef()
  const geometry = useMemo(crabGeometry, [])
  const crabs = useMemo(() => {
    const rand = mulberry32(61)
    const out = []
    const sandy = (x, z) => {
      const y = groundAt(x, z)
      return y > 0.12 && y < 0.8
    }
    for (let tries = 0; tries < 3000 && out.length < 8; tries++) {
      const a = rand() * Math.PI * 2
      const r = shoreRadius(a) - 2 + rand() * 12
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (Math.abs(z + 13) < 7) continue // not on the gorge's steep mouth
      const yaw = rand() * Math.PI * 2
      const reach = 0.9 + rand() * 0.9
      // Both ends of its scuttle must be on dry sand too
      const ex = Math.cos(yaw) * reach
      const ez = -Math.sin(yaw) * reach
      if (!sandy(x, z) || !sandy(x + ex, z + ez) || !sandy(x - ex, z - ez)) continue
      if (out.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < 36)) continue // spread them out
      out.push({ x, z, yaw, speed: 0.6 + rand() * 0.6, phase: rand() * 10, reach })
    }
    return out
  }, [])

  useFrame(({ clock }) => {
    const t = time(clock)
    crabs.forEach((c, i) => {
      // Scuttle sideways, pause, scuttle back
      const s = Math.sin(t * c.speed + c.phase)
      const side = Math.sign(s) * Math.min(1, Math.abs(s) * 1.6)
      const x = c.x + Math.cos(c.yaw) * side * c.reach
      const z = c.z - Math.sin(c.yaw) * side * c.reach
      const moving = Math.abs(Math.cos(t * c.speed + c.phase)) > 0.35
      const hop = moving ? Math.abs(Math.sin(t * 22 + i)) * 0.03 : 0
      place(mesh.current, i, x, groundAt(x, z) + hop, z, c.yaw, 0.85)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, crabs.length]} frustumCulled={false}>
      <meshToonMaterial {...toonProps} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------- fish

const fishGeometry = () =>
  painted([
    [new OctahedronGeometry(1, 0).scale(0.12, 0.17, 0.42), '#8cc6e0'],
    [new ConeGeometry(0.16, 0.22, 4).rotateX(-Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, -0.5), '#5fa3c8'],
  ])

// Every so often each fish leaps out of the shallows in an arc, with a ring of
// foam where it goes in and where it comes out
function Fish() {
  const fish = useRef()
  const rings = useRef()
  const geometry = useMemo(fishGeometry, [])
  const school = useMemo(() => {
    const rand = mulberry32(83)
    return Array.from({ length: 5 }, (_, i) => ({ seed: rand() * 100, period: 5 + rand() * 5, offset: rand() * 9, i }))
  }, [])
  // Where a fish jumps this time round: a fresh spot in the shallows each leap
  const spot = (f, n) => {
    const rand = mulberry32(Math.floor(f.seed * 1000) + n * 7919)
    const a = rand() * Math.PI * 2
    const r = shoreRadius(a) + 14 + rand() * 12
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, dir: rand() * Math.PI * 2 }
  }

  useFrame(({ clock }) => {
    const t = time(clock)
    school.forEach((f, i) => {
      const cycle = (t + f.offset) / f.period
      const n = Math.floor(cycle)
      const u = (cycle - n) * f.period // seconds into this cycle
      const s = spot(f, n)
      const leap = 0.9
      const k = u / leap
      const dx = Math.sin(s.dir)
      const dz = Math.cos(s.dir)
      if (k < 1) {
        const along = (k - 0.5) * 2.6
        const y = Math.sin(k * Math.PI) * 1.3 - 0.2
        const tilt = Math.cos(k * Math.PI) * 0.9 // nose up, then nose down
        place(fish.current, i, s.x + dx * along, y, s.z + dz * along, s.dir, 1, 1, 1, 0, -tilt)
      } else {
        place(fish.current, i, 0, -50, 0, 0, 0.0001)
      }
      // Splash rings: one at the take-off, one at the landing
      ;[0, 1].forEach((end) => {
        const ru = u - end * leap
        const j = i * 2 + end
        if (ru > 0 && ru < 0.7) {
          const along = (end - 0.5) * 2.6
          const grow = 0.3 + ru * 1.6
          const g = grow * (1 - ru / 0.7)
          place(rings.current, j, s.x + dx * along, -0.12, s.z + dz * along, 0, g, g, 1, 0, -Math.PI / 2)
        } else {
          place(rings.current, j, 0, -50, 0, 0, 0.0001)
        }
      })
    })
    fish.current.instanceMatrix.needsUpdate = true
    rings.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={fish} args={[geometry, undefined, school.length]} frustumCulled={false}>
        <meshToonMaterial {...toonProps} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, school.length * 2]} frustumCulled={false}>
        <ringGeometry args={[0.55, 0.75, 16]} />
        <meshBasicMaterial color="#e8fbff" side={DoubleSide} />
      </instancedMesh>
    </>
  )
}

// ---------------------------------------------------------------- sailboats

function sailGeometry() {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute([0, 0.35, 0.05, 0, 2.6, 0.05, 0, 0.35, 1.3], 3))
  g.computeVertexNormals()
  return g
}
const boatGeometry = () =>
  painted([
    [new SphereGeometry(1, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.55, 0.45, 1.6), '#f2e6cf'],
    [new CylinderGeometry(0.56, 0.56, 0.08, 12).scale(1, 1, 2.9).translate(0, -0.02, 0), '#c8323a'],
    [new CylinderGeometry(0.04, 0.05, 2.5, 4).translate(0, 1.25, 0.05), '#6e4526'],
    [sailGeometry(), '#fff8ea'],
    [sailGeometry().scale(-1, 1, 1), '#fff8ea'],
  ])

function Sailboats() {
  const mesh = useRef()
  const geometry = useMemo(boatGeometry, [])
  const boats = [
    { r: 88, speed: 0.012, phase: 0.4, scale: 1.6 },
    { r: 104, speed: -0.009, phase: 3.3, scale: 1.3 },
  ]
  useFrame(({ clock }) => {
    const t = time(clock)
    boats.forEach((b, i) => {
      const a = b.phase + t * b.speed
      const x = Math.cos(a) * b.r
      const z = Math.sin(a) * b.r
      const heading = Math.atan2(-Math.sin(a) * Math.sign(b.speed), Math.cos(a) * Math.sign(b.speed))
      const roll = Math.sin(t * 0.9 + i) * 0.06
      place(mesh.current, i, x, Math.sin(t * 1.1 + i) * 0.1, z, heading, b.scale, b.scale, b.scale, roll, Math.sin(t * 0.7 + i) * 0.03)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, boats.length]} frustumCulled={false}>
      <meshToonMaterial {...toonProps} side={DoubleSide} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------- lava bubbles

function LavaBubbles() {
  const mesh = useRef()
  const bubbles = useMemo(() => {
    const rand = mulberry32(5)
    const path = groundPath(LAVA, 60)
    return Array.from({ length: 12 }, () => {
      const p = path[Math.floor(rand() * (path.length - 4))]
      return { x: p.x + (rand() - 0.5) * 1.2, y: p.y + 0.3, z: p.z + (rand() - 0.5) * 1.2, period: 1.4 + rand() * 1.6, offset: rand() * 5 }
    })
  }, [])
  useFrame(({ clock }) => {
    const t = time(clock)
    bubbles.forEach((b, i) => {
      // Swell, then pop
      const u = ((t + b.offset) / b.period) % 1
      const size = u < 0.85 ? smoothstep(0, 0.85, u) * 0.32 : 0.32 * (1 - (u - 0.85) / 0.15) * 1.4
      place(mesh.current, i, b.x, b.y + u * 0.15, b.z, 0, Math.max(0.0001, size), Math.max(0.0001, size * 0.8))
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, bubbles.length]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffb02e" toneMapped={false} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------- petals

// Petals and leaves on the breeze round wherever the cat is, wrapping round a
// box that follows it, so there are always a few drifting through the shot
function Petals() {
  const mesh = useRef()
  const BOX = 18
  const petals = useMemo(() => {
    const rand = mulberry32(12)
    return Array.from({ length: 36 }, () => ({ x: rand() * BOX, y: rand() * 6, z: rand() * BOX, spin: rand() * 6, speed: 0.6 + rand() * 0.6 }))
  }, [])
  useLayoutEffect(() => {
    const colors = ['#ffb3c8', '#ffffff', '#ffd23f', '#9ad864'].map((c) => new Color(c))
    petals.forEach((_, i) => mesh.current.setColorAt(i, colors[i % colors.length]))
    mesh.current.instanceColor.needsUpdate = true
  }, [petals])
  useFrame(({ clock }, dt) => {
    const t = time(clock)
    const step = world.reducedMotion ? 0 : Math.min(dt, 0.05)
    const c = world.pipPos
    petals.forEach((p, i) => {
      p.x += step * 1.4 * p.speed
      p.z += step * 0.6 * p.speed
      p.y -= step * 0.35 * p.speed
      if (p.y < 0) p.y += 6
      const x = c.x - BOX / 2 + (((p.x % BOX) + BOX) % BOX)
      const z = c.z - BOX / 2 + (((p.z % BOX) + BOX) % BOX)
      place(mesh.current, i, x, c.y + 0.3 + p.y + Math.sin(t * 2 + i) * 0.15, z, t * p.spin, 0.12, 0.12, 0.12, t * 1.7 + i, t + i)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, petals.length]} frustumCulled={false}>
      <planeGeometry args={[1, 0.7]} />
      <meshBasicMaterial side={DoubleSide} />
    </instancedMesh>
  )
}

export default function Critters({ lite = false }) {
  return (
    <>
      <Villagers />
      <Crabs />
      <Sailboats />
      <LavaBubbles />
      {!lite && <Fish />}
      {!lite && <Petals />}
    </>
  )
}
