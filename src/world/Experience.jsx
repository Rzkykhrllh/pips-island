import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping } from 'three'
import Atmosphere from './Atmosphere'
import Bridge from './Bridge'
import Crates from './Crates'
import Director, { CAMERA_START } from './Director'
import Island from './Island'
import Pip from './Pip'
import Vegetation from './Vegetation'

export default function Experience() {
  return (
    <Canvas
      className="stage"
      shadows="percentage"
      dpr={[1, 1.75]}
      camera={{ position: CAMERA_START, fov: 50, near: 0.1, far: 1500 }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      aria-hidden="true"
    >
      <Director />
      <Atmosphere />
      <Island />
      <Vegetation />
      <Bridge />
      <Crates />
      <Pip />
    </Canvas>
  )
}
