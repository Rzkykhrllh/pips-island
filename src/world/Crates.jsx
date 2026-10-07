import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import { CRATE_PROGRESS, progressToU, trailPoint } from './track'
import { uiStore, world } from '../store'

const SIZE = 0.7
const PIECES = 8
const GRAVITY = -14

function useWoodTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = '#c98a43'
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = '#a86c2f'
    for (let y = 0; y < 128; y += 32) g.fillRect(0, y + 29, 128, 3)
    g.strokeStyle = '#6e4120'
    g.lineWidth = 14
    g.strokeRect(7, 7, 114, 114)
    g.fillStyle = '#e0b46e'
    for (const [x, y] of [[14, 14], [114, 14], [14, 114], [114, 114]]) {
      g.beginPath()
      g.arc(x, y, 4, 0, Math.PI * 2)
      g.fill()
    }
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    return tex
  }, [])
}

function Crate({ u, index, texture }) {
  const crate = useRef()
  const pieces = useRef([])
  const shard = useRef()
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
      uiStore.set({ shards: uiStore.get().shards + 1 })
    } else if (!shouldBreak && s.broken && world.u < u - 0.01) {
      s.broken = false
      resetPieces()
      crate.current.visible = true
      shard.current.visible = true
      uiStore.set({ shards: Math.max(0, uiStore.get().shards - 1) })
    }

    // Shard spins above the crate, then flies up and vanishes once collected.
    shard.current.rotation.y += dt * 2.5
    if (!s.broken) {
      shard.current.position.set(0, SIZE * 0.5 + 0.55 + Math.sin(performance.now() / 400 + index) * 0.08, 0)
      shard.current.scale.setScalar(1)
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
      shard.current.position.y = SIZE * 0.5 + 0.55 + k * 1.8
      shard.current.scale.setScalar(1 - k)
      if (k >= 1) shard.current.visible = false
    }
  })

  return (
    <group position={home}>
      <mesh ref={crate} castShadow receiveShadow>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
        <meshStandardMaterial map={texture} roughness={0.85} />
      </mesh>
      {Array.from({ length: PIECES }, (_, i) => (
        <mesh key={i} ref={(m) => (pieces.current[i] = m)} visible={false} castShadow>
          <boxGeometry args={[SIZE * 0.48, SIZE * 0.48, SIZE * 0.48]} />
          <meshStandardMaterial map={texture} roughness={0.85} />
        </mesh>
      ))}
      <mesh ref={shard} castShadow>
        <octahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#ffd23f" emissive="#ff9f1c" emissiveIntensity={0.6} flatShading />
      </mesh>
    </group>
  )
}

export default function Crates() {
  const texture = useWoodTexture()
  const us = useMemo(() => CRATE_PROGRESS.map(progressToU), [])
  return us.map((u, i) => <Crate key={i} index={i} u={u} texture={texture} />)
}
