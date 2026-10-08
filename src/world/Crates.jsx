import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, MeshToonMaterial, SRGBColorSpace, Vector3 } from 'three'
import { CRATE_PROGRESS, progressToU, trailPoint } from './track'
import { BONUS_CRATES } from './layout'
import { toast, uiStore, world } from '../store'
import { OUTLINE, TOON_RAMP } from './toon'

// Crates, as in the game. Two kinds:
//  - trail crates: the runner spins through them as you scroll (each unlocks a
//    feature card); scroll back and they mend
//  - hidden "?" crates round the island, for anyone who looks around
// Any crate can also be clicked or tapped open. Each pays out fruit once.

const SIZE = 0.7
const PIECES = 8
const GRAVITY = -14
const FRUIT = { trail: 3, bonus: 10 } // the game's basic and "?" crates

// Same crate look as the game (web-3d-project/src/crates.js): light frame,
// dark seams, planks across the middle, and a big "?" on the bonus kind
function woodTexture(question) {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = question ? '#d08a3e' : '#c47f3a'
  g.fillRect(0, 0, s, s)
  g.fillStyle = 'rgba(70,35,10,.45)'
  if (!question) for (let i = 1; i < 4; i++) g.fillRect(s * 0.12, (s * i) / 4 - 2, s * 0.76, 4)
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
  if (question) {
    g.font = '900 78px "Lilita One", "Arial Black", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = 8
    g.lineJoin = 'round'
    g.strokeStyle = '#5e3a1a'
    g.strokeText('?', s / 2, s / 2 + 4)
    g.fillStyle = '#ffd23f'
    g.fillText('?', s / 2, s / 2 + 4)
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
      wood: new MeshToonMaterial({ map: woodTexture(false), gradientMap: TOON_RAMP }),
      bonus: new MeshToonMaterial({ map: woodTexture(true), gradientMap: TOON_RAMP }),
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

const pay = (n) => uiStore.set({ fruit: uiStore.get().fruit + n })

function Crate({ home, index, assets, trailU = null, kind = 'trail', where }) {
  const gl = useThree((s) => s.gl)
  const crate = useRef()
  const pieces = useRef([])
  const fruits = useRef([])
  const state = useRef({ broken: false, byRunner: false, paid: false, t: 0, vel: [], fruitVel: [] })
  const material = kind === 'bonus' ? assets.bonus : assets.wood
  const fruitCount = kind === 'bonus' ? 5 : 1

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
    fruits.current.forEach((f, i) => {
      if (!f) return
      f.visible = true
      f.scale.setScalar(1)
      const a = (i / fruitCount) * Math.PI * 2
      state.current.fruitVel[i] = fruitCount > 1 ? new Vector3(Math.cos(a) * 1.6, 6 + Math.random(), Math.sin(a) * 1.6) : new Vector3(0, 0, 0)
    })
  }

  const smash = (byRunner) => {
    const s = state.current
    if (s.broken) return
    s.broken = true
    s.byRunner = byRunner
    s.t = 0
    resetPieces()
    pieces.current.forEach((m) => m && (m.visible = true))
    crate.current.visible = false
    if (kind === 'trail') uiStore.set({ crates: uiStore.get().crates + 1 })
    if (!s.paid) {
      s.paid = true
      pay(FRUIT[kind])
      if (kind === 'bonus') {
        const found = uiStore.get().bonusFound + 1
        uiStore.set({ bonusFound: found })
        const total = uiStore.get().bonusTotal
        toast(found === total ? `Every hidden crate found! +${FRUIT.bonus} fruit` : `Hidden crate ${where}! ${found} of ${total} · +${FRUIT.bonus} fruit`)
      }
    }
  }

  useFrame((_, dt) => {
    const s = state.current
    if (trailU !== null) {
      // The runner spins through it on the way past, and it mends when you scroll back
      if (world.u >= trailU - 0.004 && !s.broken) {
        smash(true)
        world.hop = 0
      } else if (s.broken && s.byRunner && world.u < trailU - 0.01) {
        s.broken = false
        resetPieces()
        fruits.current.forEach((f) => f && (f.visible = true))
        crate.current.visible = true
        uiStore.set({ crates: Math.max(0, uiStore.get().crates - 1) })
      }
    }

    // Fruit bobs above the crate; once it breaks, it pops out and vanishes
    fruits.current.forEach((f, i) => {
      if (!f) return
      f.rotation.y += dt * 2.5
      if (!s.broken) {
        const spread = fruitCount > 1 ? 0 : 1
        f.position.set(0, SIZE * 0.5 + 0.55 * spread + Math.sin(performance.now() / 400 + index + i) * 0.08 * spread, 0)
        f.visible = fruitCount === 1
      }
    })

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
      const k = Math.min(1, s.t / 0.7)
      fruits.current.forEach((f, i) => {
        if (!f || !f.visible) return
        const v = s.fruitVel[i]
        if (fruitCount > 1) {
          v.y += GRAVITY * 0.6 * dt
          f.position.addScaledVector(v, dt)
        } else {
          f.position.y = SIZE * 0.5 + 0.55 + k * 1.8
        }
        f.scale.setScalar(1 - k * k)
        if (k >= 1) f.visible = false
      })
    }
  })

  // Click or tap to break; a drag (turning the camera) doesn't count
  const onClick = (e) => {
    if (e.delta > 8) return
    e.stopPropagation()
    smash(false)
  }
  const hover = (on) => (e) => {
    e.stopPropagation()
    gl.domElement.style.cursor = on && !state.current.broken ? 'pointer' : ''
  }

  return (
    <group position={home}>
      <group ref={crate} onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        <mesh geometry={assets.box} material={material} castShadow receiveShadow />
        <mesh geometry={assets.box} material={OUTLINE} scale={1.08} />
      </group>
      {Array.from({ length: PIECES }, (_, i) => (
        <mesh key={i} ref={(m) => (pieces.current[i] = m)} geometry={assets.piece} material={material} visible={false} castShadow />
      ))}
      {Array.from({ length: fruitCount }, (_, i) => (
        <group key={i} ref={(f) => (fruits.current[i] = f)}>
          <Fruit />
        </group>
      ))}
    </group>
  )
}

export default function Crates() {
  const assets = useCrateAssets()
  const trail = useMemo(
    () => CRATE_PROGRESS.map(progressToU).map((u) => ({ u, home: trailPoint(u).add(new Vector3(0, SIZE / 2, 0)) })),
    [],
  )
  const bonus = useMemo(() => BONUS_CRATES.map((b) => ({ ...b, home: new Vector3(b.x, b.y + SIZE / 2, b.z) })), [])
  useEffect(() => uiStore.set({ bonusTotal: bonus.length }), [bonus])
  return (
    <>
      {trail.map((c, i) => (
        <Crate key={`t${i}`} index={i} home={c.home} trailU={c.u} assets={assets} />
      ))}
      {bonus.map((c, i) => (
        <Crate key={`b${i}`} index={i + 10} home={c.home} kind="bonus" where={c.where} assets={assets} />
      ))}
    </>
  )
}
