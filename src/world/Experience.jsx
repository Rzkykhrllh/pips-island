import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping } from 'three'
import Atmosphere from './Atmosphere'
import Bridge from './Bridge'
import CameraControls from './CameraControls'
import Crates from './Crates'
import Director, { CAMERA_START } from './Director'
import Island from './Island'
import Landmarks from './Landmarks'
import Vegetation from './Vegetation'
import { ORDER, PINNED, TIERS, createFpsWatch, guessTier } from './quality'
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

export default function Experience() {
  const [tier, setTier] = useState(guessTier)
  const q = TIERS[tier]
  return (
    <Canvas
      className="stage"
      shadows={q.shadows ? 'percentage' : false}
      dpr={Math.min(window.devicePixelRatio || 1, q.dpr)}
      camera={{ position: CAMERA_START, fov: 50, near: 0.1, far: 1500 }}
      gl={{ antialias: tier !== 'low', toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
      aria-hidden="true"
    >
      <AdaptiveQuality tier={tier} onDrop={setTier} />
      <Director />
      <CameraControls />
      <Atmosphere shadowMap={q.shadowMap} />
      <Island />
      <Landmarks />
      <Vegetation />
      <Bridge />
      <Crates />
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
