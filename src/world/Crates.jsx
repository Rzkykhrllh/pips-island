import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, MeshToonMaterial, SRGBColorSpace, Vector3 } from 'three'
import { CRATE_PROGRESS, progressToU, trailPoint } from './track'
import { uiStore, world } from '../store'
import { OUTLINE, TOON_RAMP } from './toon'

const SIZE = 0.7
const PIECES = 8
const GRAVITY = -14

// Same crate look as the game (web-3d-project/src/crates.js): light frame,
// dark seams, planks across the middle
function woodTexture() {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#c47f3a'
  g.fillRect(0, 0, s, s)
  g.fillStyle = 'rgba(70,35,10,.45)'
  for (let i = 1; i < 4; i++) g.fillRect(s * 0.12, (s * i) / 4 - 2, s * 0.76, 4)
  const lw = s * 0.12
  g.strokeStyle = '#e9b06a'
  g.lineWidth = lw
  g.strokeRect(lw / 2, lw / 2, s - lw, s - lw)
  g.strokeStyle = 'rgba(40,20,5,.8)'
  g.lineWidth = 3
  g.strokeRect(1.5, 1.5, s - 3, s - 3)
  g.strokeRect(lw, lw, s - lw * 2, s - lw * 2)
  g.fillStyle = 'rgba(40,20,5,.75)'
  for (const [x, y] of [
    [lw / 2, lw / 2],
    [s - lw / 2, lw / 2],
    [s - lw / 2, s - lw / 2],
    [lw / 2, s - lw / 2],
  ]) {
    g.beginPath()
    g.arc(x, y, 3, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

// Shared by every crate and piece
function useCrateAssets() {
  return useMemo(
    () => ({
      box: new BoxGeometry(SIZE, SIZE, SIZE),
      piece: new BoxGeometry(SIZE * 0.48, SIZE * 0.48, SIZE * 0.48),
      wood: new MeshToonMaterial({ map: woodTexture(), gradientMap: TOON_RAMP }),
    }),
    [],
  )
}

// The fruit inside each crate, as in the game
function Fruit() {
  return (
    <group>
      <mesh castShadow scale={[1, 0.9, 1]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshToonMaterial color="#ff7a2f" gradientMap={TOON_RAMP} emissive="#ff5a00" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0.05, 0.2, 0]} rotation-z={-0.6} scale={[1, 0.35, 0.6]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshToonMaterial color="#4cbf3e" gradientMap={TOON_RAMP} />
      </mesh>
    </group>
  )
}

function Crate({ u, index, assets }) {
  const crate = useRef()
  const pieces = useRef([])
  const fruit = useRef()
  const state = useRef({ broken: false, t: 0, vel: [] })

  const home = useMemo(() => trailPoint(u).add(new Vector3(0, SIZE / 2, 0)), [u])

  const resetPieces = () => {
    pieces.current.forEach((m, i) => {
      if (!m) return
      const ox = (i & 1 ? 1 : -1) * SIZE * 0.25
      const oy = (i & 2 ? 1 : -1) * SIZE * 0.25
      const oz = (i & 4 ? 1 : -1) * SIZE * 0.25
      m.position.set(ox, oy, oz)
      m.rotation.set(0, 0, 0)
      m.scale.setScalar(1)
      m.visible = false
      state.current.vel[i] = new Vector3(ox * 9 + (Math.random() - 0.5) * 2, 4 + Math.random() * 3, oz * 9)
    })
  }

  useFrame((_, dt) => {
    const s = state.current
    const shouldBreak = world.u >= u - 0.004

    if (shouldBreak && !s.broken) {
      s.broken = true
      s.t = 0
      resetPieces()
      pieces.current.forEach((m) => m && (m.visible = true))
      crate.current.visible = false
      world.hop = 0
      uiStore.set({ crates: uiStore.get().crates + 1 })
    } else if (!shouldBreak && s.broken && world.u < u - 0.01) {
      s.broken = false
      resetPieces()
      crate.current.visible = true
      fruit.current.visible = true
      uiStore.set({ crates: Math.max(0, uiStore.get().crates - 1) })
    }

    // Fruit bobs above the crate, then flies up and vanishes once collected.
    fruit.current.rotation.y += dt * 2.5
    if (!s.broken) {
      fruit.current.position.set(0, SIZE * 0.5 + 0.55 + Math.sin(performance.now() / 400 + index) * 0.08, 0)
      fruit.current.scale.setScalar(1)
    }

    if (s.broken) {
      s.t += dt
      pieces.current.forEach((m, i) => {
        if (!m || !m.visible) return
        const v = s.vel[i]
        v.y += GRAVITY * dt
        m.position.addScaledVector(v, dt)
        m.rotation.x += v.z * dt
        m.rotation.z -= v.x * dt
        if (m.position.y < -SIZE * 0.4) {
          m.position.y = -SIZE * 0.4
          v.multiplyScalar(0.4)
          v.y = Math.abs(v.y) * 0.3
        }
        if (s.t > 1.4) m.scale.setScalar(Math.max(0, 1 - (s.t - 1.4) * 2))
        if (s.t > 2) m.visible = false
      })
      const k = Math.min(1, s.t / 0.6)
      fruit.current.position.y = SIZE * 0.5 + 0.55 + k * 1.8
      fruit.current.scale.setScalar(1 - k)
      if (k >= 1) fruit.current.visible = false
    }
  })

  return (
    <group position={home}>
      <group ref={crate}>
        <mesh geometry={assets.box} material={assets.wood} castShadow receiveShadow />
        <mesh geometry={assets.box} material={OUTLINE} scale={1.08} />
      </group>
      {Array.from({ length: PIECES }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => (pieces.current[i] = m)}
          geometry={assets.piece}
          material={assets.wood}
          visible={false}
          castShadow
        />
      ))}
      <group ref={fruit}>
        <Fruit />
      </group>
    </group>
  )
}

export default function Crates() {
  const assets = useCrateAssets()
  const us = useMemo(() => CRATE_PROGRESS.map(progressToU), [])
  return us.map((u, i) => <Crate key={i} index={i} u={u} assets={assets} />)
}
