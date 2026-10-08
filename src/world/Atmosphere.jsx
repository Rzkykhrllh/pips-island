import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  MathUtils,
  Object3D,
  Vector3,
} from 'three'
import { smoothstep } from './terrain'
import { world } from '../store'
import { TOON_RAMP } from './toon'

const WHITE = new Color('#ffffff')

// Soft round glow for the sun's halo
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,.45)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

// Lighting follows the climb: bright late morning on the beach, golden
// afternoon over the crates and the bridge, sunset at the summit. Each key
// sets the sun's height and colour, the sky, the ambient (hemisphere) light,
// a cool fill from the far side so shadows never go dead, and the exposure.
const KEYS = [
  [0.0, { elev: 0.75, sun: '#fff4dc', sunI: 2.4, sky: '#dff4ff', ground: '#6b8f4e', hemiI: 1.1, fill: '#bfe3ff', fillI: 0.35, top: '#3fb8f0', bottom: '#d9f5ff', exposure: 1.05 }],
  [0.4, { elev: 0.55, sun: '#fff0d2', sunI: 2.6, sky: '#e6f2ff', ground: '#6f8a4a', hemiI: 1.05, fill: '#b8d8ff', fillI: 0.4, top: '#3aa8ea', bottom: '#e3f2ff', exposure: 1.05 }],
  [0.72, { elev: 0.34, sun: '#ffd49a', sunI: 2.5, sky: '#ffe9cf', ground: '#7a7448', hemiI: 0.95, fill: '#a8b8ff', fillI: 0.55, top: '#4b8fe0', bottom: '#ffd9a8', exposure: 1.08 }],
  [1.0, { elev: 0.15, sun: '#ff9550', sunI: 2.4, sky: '#d2b0ff', ground: '#6a4c58', hemiI: 0.8, fill: '#8f9cff', fillI: 0.75, top: '#5a4fb8', bottom: '#ffb37a', exposure: 1.12 }],
]
const COLOR_KEYS = ['sun', 'sky', 'ground', 'fill', 'top', 'bottom']
for (const [, k] of KEYS) for (const c of COLOR_KEYS) k[c] = new Color(k[c])

const light = Object.fromEntries([...COLOR_KEYS.map((c) => [c, new Color()]), ['elev', 0], ['sunI', 0], ['hemiI', 0], ['fillI', 0], ['exposure', 1]])
function lightAt(p) {
  let i = 1
  while (i < KEYS.length - 1 && p > KEYS[i][0]) i++
  const [p0, a] = KEYS[i - 1]
  const [p1, b] = KEYS[i]
  const t = smoothstep(p0, p1, p)
  for (const k in light) {
    if (light[k].isColor) light[k].lerpColors(a[k], b[k], t)
    else light[k] = a[k] + (b[k] - a[k]) * t
  }
  return light
}

// The sun's compass bearing: behind the summit as seen from the final shot.
// Its height comes from the keys above.
const SUN_BEARING = new Vector3(-1, 0, -0.95).normalize()
export const SUN_DIR = new Vector3()
const sunDirAt = (elev) =>
  SUN_DIR.set(SUN_BEARING.x * Math.cos(elev), Math.sin(elev), SUN_BEARING.z * Math.cos(elev))

const ISLAND_MIDDLE = new Vector3(0, 0, -6)
const shadowCenter = new Vector3()

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

// Every puff of every cloud is one instance of one mesh
// Seabirds circling the massif: a flat "V" per bird, wings flapped by
// squashing the V up and down, all one instanced mesh
const BIRDS = Array.from({ length: 7 }, (_, i) => ({
  radius: 14 + (i % 4) * 7,
  height: 26 + ((i * 5) % 9),
  speed: (0.18 + (i % 3) * 0.05) * (i % 2 ? 1 : -1),
  phase: i * 1.7,
  flap: 6 + (i % 3) * 1.5,
}))
const BIRD_CENTER = new Vector3(0, 0, -26)

function birdGeometry() {
  const g = new BufferGeometry()
  // left tip, body front, body back, right tip
  const v = [-0.9, 0.3, -0.15, 0, 0, 0.3, 0, 0, -0.2, 0.9, 0.3, -0.15]
  g.setAttribute('position', new Float32BufferAttribute(v, 3))
  g.setIndex([0, 2, 1, 1, 2, 3])
  g.computeVertexNormals()
  return g
}

function Birds() {
  const mesh = useRef()
  const geometry = useMemo(birdGeometry, [])
  const dummy = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    const t = world.reducedMotion ? 0 : clock.elapsedTime
    BIRDS.forEach((b, i) => {
      const a = b.phase + t * b.speed
      dummy.position.set(BIRD_CENTER.x + Math.cos(a) * b.radius, b.height + Math.sin(t * 0.7 + i) * 1.2, BIRD_CENTER.z + Math.sin(a) * b.radius)
      // Face along the circle, banked into the turn
      dummy.rotation.set(0, -a + (b.speed > 0 ? Math.PI : 0), Math.sign(b.speed) * 0.25)
      dummy.scale.set(1.3, 1.3 * Math.sin(t * b.flap + i), 1.3)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, BIRDS.length]} frustumCulled={false}>
      <meshToonMaterial color="#fbfbf7" side={DoubleSide} gradientMap={TOON_RAMP} />
    </instancedMesh>
  )
}

function Clouds() {
  const mesh = useRef()
  const puffs = useMemo(() => {
    const out = []
    for (let i = 0; i < 12; i++) {
      const c = { x: -160 + ((i * 73) % 320), y: 48 + ((i * 17) % 16), z: -120 + ((i * 53) % 220), s: 2.2 + ((i * 7) % 3) }
      const n = 3 + (i % 3)
      for (let j = 0; j < n; j++) {
        out.push({
          cloud: i,
          x: c.x + (j * 1.3 - n * 0.6) * c.s,
          y: c.y + Math.sin(j * 2.1) * 0.35 * c.s,
          z: c.z + (j % 2) * 0.6 * c.s,
          s: c.s * (1 - (j % 2) * 0.25),
        })
      }
    }
    return out
  }, [])
  const drift = useRef(0)
  const dummy = useMemo(() => new Object3D(), [])

  useFrame((_, dt) => {
    if (!world.reducedMotion) drift.current += dt * 1.2
    puffs.forEach((p, i) => {
      // Wraps far out in the fog, where nobody sees a cloud split for a moment
      const x = ((p.x + drift.current + 170) % 340) - 170
      dummy.position.set(x, p.y, p.z)
      dummy.scale.setScalar(p.s)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, puffs.length]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshToonMaterial color="#ffffff" flatShading gradientMap={TOON_RAMP} emissive="#ffffff" emissiveIntensity={0.45} />
    </instancedMesh>
  )
}

export default function Atmosphere({ shadowMap = 2048 }) {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const sun = useRef()
  const fill = useRef()
  const hemi = useRef()
  const disc = useRef()
  const face = useRef()
  const halo = useRef()
  const glow = useMemo(glowTexture, [])
  const uniforms = useMemo(() => ({ uTop: { value: new Color() }, uBottom: { value: new Color() } }), [])
  const fog = useMemo(() => {
    const f = new Fog('#d9f5ff', 110, 360)
    scene.fog = f
    return f
  }, [scene])

  // A new shadow map size only takes once the old map is thrown away
  useEffect(() => {
    const shadow = sun.current.shadow
    shadow.mapSize.set(shadowMap, shadowMap)
    shadow.map?.dispose()
    shadow.map = null
  }, [shadowMap])

  useFrame(({ camera }) => {
    const p = world.progress
    const l = lightAt(p)
    sunDirAt(l.elev)

    uniforms.uTop.value.copy(l.top)
    uniforms.uBottom.value.copy(l.bottom)
    fog.color.copy(l.bottom)
    gl.toneMappingExposure = l.exposure

    // Shadows: tight round the runner while following it (sharp), widened to
    // the whole island for the map view at the top, and when zoomed out
    const overview = 1 - smoothstep(0.02, 0.11, p)
    const extent = MathUtils.lerp(24, 88, overview) * Math.max(1, world.orbit.zoom)
    shadowCenter.lerpVectors(world.pipPos, ISLAND_MIDDLE, overview)
    const s = sun.current
    s.position.copy(shadowCenter).addScaledVector(SUN_DIR, 150)
    s.target.position.copy(shadowCenter)
    s.target.updateMatrixWorld()
    const cam = s.shadow.camera
    if (cam.right !== extent) {
      cam.left = cam.bottom = -extent
      cam.right = cam.top = extent
      cam.updateProjectionMatrix()
    }
    // Bigger texels need more normal bias to stay acne-free
    s.shadow.normalBias = 0.03 * (extent / 24)
    s.color.copy(l.sun)
    s.intensity = l.sunI

    fill.current.position.set(-SUN_DIR.x, 0.5, -SUN_DIR.z)
    fill.current.color.copy(l.fill)
    fill.current.intensity = l.fillI

    hemi.current.color.copy(l.sky)
    hemi.current.groundColor.copy(l.ground)
    hemi.current.intensity = l.hemiI

    disc.current.position.copy(camera.position).addScaledVector(SUN_DIR, 380)
    disc.current.lookAt(camera.position)
    face.current.material.color.copy(l.sun).lerp(WHITE, 0.45)
    halo.current.material.color.copy(l.sun)
    halo.current.material.opacity = 0.35 + smoothstep(0.6, 1, p) * 0.4
  })

  return (
    <>
      <SkyDome uniforms={uniforms} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={320}
      />
      {/* Cool fill from the far side; no shadows */}
      <directionalLight ref={fill} />
      <group ref={disc}>
        <mesh ref={face}>
          <circleGeometry args={[16, 32]} />
          <meshBasicMaterial fog={false} toneMapped={false} />
        </mesh>
        <mesh ref={halo} position-z={-1}>
          <planeGeometry args={[110, 110]} />
          <meshBasicMaterial map={glow} fog={false} toneMapped={false} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      </group>
      <Clouds />
      <Birds />
    </>
  )
}
