import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping } from 'three'
import Atmosphere from './Atmosphere'
import Bridge from './Bridge'
import CameraControls from './CameraControls'
import Crates from './Crates'
import Critters from './Critters'
import Director, { CAMERA_START } from './Director'
import Effects from './Effects'
import Island from './Island'
import Landmarks from './Landmarks'
import Life from './Life'
import Places from './Places'
import Vegetation from './Vegetation'
import { ORDER, PINNED, TIERS, createFpsWatch, guessTier } from './quality'
import { uiStore, useUi } from '../store'
import { CHARACTER } from '../sections'
import ErrorBoundary from '../ErrorBoundary'

// Each runner is its own chunk, so only the one in use is downloaded
const Runner = lazy(() => (CHARACTER === 'pip' ? import('./Pip') : import('./Cat')))
const PipRunner = lazy(() => import('./Pip'))

// Steps the tier down when the frame rate stays low, and makes materials
// recompile when shadows switch on or off
function AdaptiveQuality({ tier, onDrop }) {
  const scene = useThree((s) => s.scene)
  const watch = useMemo(createFpsWatch, [])
  useEffect(() => {
    scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true
    })
  }, [tier, scene])
  useFrame((_, dt) => {
    if (!PINNED && watch(dt) && tier !== 'low') onDrop(ORDER[ORDER.indexOf(tier) - 1])
  })
  return null
}

// Compile every shader before the island fades in, off the main thread where
// the browser can, so the opening shot doesn't stutter while programs build
function Warmup() {
  const runner = useUi((s) => s.runner)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (!runner) return
    let done = false
    const ready = () => {
      if (done) return
      done = true
      uiStore.set({ ready: true })
    }
    const fallback = setTimeout(ready, 4000) // never hold the page hostage
    Promise.resolve(gl.compileAsync?.(scene, camera))
      .catch(() => {})
      .then(ready)
    return () => clearTimeout(fallback)
  }, [runner, gl, scene, camera])
  return null
}

export default function Experience() {
  const [tier, setTier] = useState(guessTier)
  const q = TIERS[tier]
  // Fixed at creation (WebGL can't switch antialiasing later). Dense screens
  // don't need MSAA on top of their pixels
  const [glOptions] = useState(() => ({
    antialias: tier !== 'low' && (window.devicePixelRatio || 1) < 1.5,
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.05,
    powerPreference: 'high-performance',
  }))
  return (
    <Canvas
      className="stage"
      shadows={q.shadows ? 'percentage' : false}
      dpr={Math.min(window.devicePixelRatio || 1, q.dpr)}
      camera={{ position: CAMERA_START, fov: 50, near: 0.1, far: 1500 }}
      gl={glOptions}
      aria-hidden="true"
    >
      <AdaptiveQuality tier={tier} onDrop={setTier} />
      <Warmup />
      <Director />
      <CameraControls />
      <Atmosphere shadowMap={q.shadowMap} />
      <Island />
      <Landmarks />
      <Places />
      <Vegetation lite={tier === 'low'} />
      <Bridge />
      <Crates />
      {tier !== 'low' && <Life />}
      <Critters lite={tier === 'low'} />
      <Effects lite={tier === 'low'} />
      {/* If the cat's model can't load, Pip runs instead */}
      <ErrorBoundary
        fallback={
          <Suspense fallback={null}>
            <PipRunner />
          </Suspense>
        }
      >
        <Suspense fallback={null}>
          <Runner />
        </Suspense>
      </ErrorBoundary>
    </Canvas>
  )
}
