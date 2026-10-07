import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, Color, Fog, Vector3 } from 'three'
import { smoothstep } from './terrain'
import { world } from '../store'

// Day at the beach -> golden sunset at the summit.
const SKY = {
  dayTop: new Color('#3fb8f0'),
  dayBottom: new Color('#d9f5ff'),
  duskTop: new Color('#5a4fb8'),
  duskBottom: new Color('#ffb37a'),
  sunDay: new Color('#fff6e0'),
  sunDusk: new Color('#ffb070'),
}

// Direction the sun sits in (behind the summit when seen from the final shot).
export const SUN_DIR = new Vector3(-1, 0.32, -0.95).normalize()

function SkyDome({ uniforms }) {
  return (
    <mesh scale={450} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
        fragmentShader={`
          uniform vec3 uTop;
          uniform vec3 uBottom;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y * 1.6 + 0.15, 0.0, 1.0);
            gl_FragColor = vec4(mix(uBottom, uTop, pow(h, 0.8)), 1.0);
            #include <colorspace_fragment>
          }`}
      />
    </mesh>
  )
}

function Clouds() {
  const group = useRef()
  const clouds = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        x: -160 + ((i * 73) % 320),
        y: 48 + ((i * 17) % 16),
        z: -120 + ((i * 53) % 220),
        s: 2.2 + ((i * 7) % 3),
        puffs: 3 + (i % 3),
      })),
    [],
  )

  useFrame((_, dt) => {
    if (world.reducedMotion) return
    group.current.children.forEach((c) => {
      c.position.x += dt * 1.2
      if (c.position.x > 170) c.position.x = -170
    })
  })

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {Array.from({ length: c.puffs }, (_, j) => (
            <mesh key={j} position={[j * 1.3 - c.puffs * 0.6, Math.sin(j * 2.1) * 0.35, (j % 2) * 0.6]} scale={1 - (j % 2) * 0.25}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#ffffff" flatShading roughness={1} emissive="#ffffff" emissiveIntensity={0.55} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

export default function Atmosphere() {
  const scene = useThree((s) => s.scene)
  const sun = useRef()
  const hemi = useRef()
  const disc = useRef()
  const uniforms = useMemo(
    () => ({ uTop: { value: SKY.dayTop.clone() }, uBottom: { value: SKY.dayBottom.clone() } }),
    [],
  )
  const fog = useMemo(() => {
    const f = new Fog(SKY.dayBottom.clone(), 70, 260)
    scene.fog = f
    return f
  }, [scene])

  useFrame(({ camera }) => {
    const dusk = smoothstep(0.7, 1, world.progress)
    uniforms.uTop.value.lerpColors(SKY.dayTop, SKY.duskTop, dusk)
    uniforms.uBottom.value.lerpColors(SKY.dayBottom, SKY.duskBottom, dusk)
    fog.color.copy(uniforms.uBottom.value)

    // Shadow-casting sun follows Pip so the shadow map stays sharp around him.
    const p = world.pipPos
    sun.current.position.copy(p).addScaledVector(SUN_DIR, 60)
    sun.current.target.position.copy(p)
    sun.current.target.updateMatrixWorld()
    sun.current.color.lerpColors(SKY.sunDay, SKY.sunDusk, dusk)
    sun.current.intensity = 2.6 - dusk * 0.6
    hemi.current.intensity = 1.1 - dusk * 0.35

    disc.current.position.copy(camera.position).addScaledVector(SUN_DIR, 380)
    disc.current.lookAt(camera.position)
  })

  return (
    <>
      <SkyDome uniforms={uniforms} />
      <hemisphereLight ref={hemi} args={['#dff4ff', '#6b8f4e', 1.1]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />
      <mesh ref={disc}>
        <circleGeometry args={[18, 32]} />
        <meshBasicMaterial color="#fff1b8" fog={false} toneMapped={false} />
      </mesh>
      <Clouds />
    </>
  )
}
