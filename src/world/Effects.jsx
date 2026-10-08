import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, Object3D, ShaderMaterial, Vector3 } from 'three'
import { ZONES, groundAt, smoothstep } from './terrain'
import { CAMPFIRE, LAVA, RUINS, RUINS_BASE, WATERFALL, mulberry32 } from './layout'
import { world } from '../store'

// Light and magic, all cheap additive tricks rather than post-processing, so
// they run on every quality tier:
//  - the warp beam the cat arrives and leaves by
//  - soft glows round the fires and the lava
//  - a rainbow over the waterfall by day
//  - shafts of sunlight slanting into the jungle

let glowMap = null
function glowTexture() {
  if (glowMap) return glowMap
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.3, 'rgba(255,255,255,.5)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  glowMap = new CanvasTexture(c)
  return glowMap
}

// ---------------------------------------------------------------- warp

const BEAM_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`
const BEAM_FRAG = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.6);
    float ripple = 0.65 + 0.35 * sin(vUv.x * 40.0 + vUv.y * 30.0 - uTime * 10.0);
    gl_FragColor = vec4(uColor * fade * ripple * uOpacity, 1.0);
  }`

// How bright the beam is: a flash in as the cat lands, fading after; on the
// way out it rises and stays until the page changes
function beamStrength() {
  if (world.leaving >= 0) return smoothstep(0, 0.3, world.leaving)
  if (world.warp < 0 || world.warp > 1.8) return 0
  return smoothstep(0, 0.2, world.warp) * (1 - smoothstep(0.9, 1.8, world.warp))
}

function WarpBeam() {
  const group = useRef()
  const ring = useRef()
  const sparks = useRef()
  const dummy = useMemo(() => new Object3D(), [])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new Color('#fff1b0') } }), [])
  const inner = useMemo(() => ({ uTime: uniforms.uTime, uOpacity: { value: 0 }, uColor: { value: new Color('#ffffff') } }), [uniforms])
  // Materials built here, not as JSX props: R3F copies a `uniforms` prop into
  // new wrappers, so values set on our objects would never reach the shader
  const [outerMat, innerMat] = useMemo(
    () =>
      [uniforms, inner].map(
        (u) =>
          new ShaderMaterial({
            vertexShader: BEAM_VERT,
            fragmentShader: BEAM_FRAG,
            uniforms: u,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
            side: DoubleSide,
          }),
      ),
    [uniforms, inner],
  )
  const SPARKS = 28

  useFrame((_, dt) => {
    const k = beamStrength()
    group.current.visible = k > 0.01
    if (!group.current.visible) return
    uniforms.uTime.value += dt
    uniforms.uOpacity.value = k * 0.9
    inner.uOpacity.value = k
    group.current.position.copy(world.pipPos)
    // A ring of light spreads over the ground as the beam lands
    const t = world.leaving >= 0 ? world.leaving : world.warp
    ring.current.scale.setScalar(1 + (t % 1.2) * 3)
    ring.current.material.opacity = k * (1 - (t % 1.2) / 1.2)
    // Sparks spiral up the beam
    for (let i = 0; i < SPARKS; i++) {
      const p = (i / SPARKS + t * 0.6) % 1
      const a = i * 2.4 + t * 4
      dummy.position.set(Math.cos(a) * 1.1, p * 9, Math.sin(a) * 1.1)
      dummy.scale.setScalar(0.08 * k * (1 - p))
      dummy.updateMatrix()
      sparks.current.setMatrixAt(i, dummy.matrix)
    }
    sparks.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group} visible={false}>
      <mesh position-y={15}>
        <cylinderGeometry args={[1.1, 1.1, 30, 24, 1, true]} />
        <primitive object={outerMat} attach="material" />
      </mesh>
      <mesh position-y={15}>
        <cylinderGeometry args={[0.35, 0.35, 30, 12, 1, true]} />
        <primitive object={innerMat} attach="material" />
      </mesh>
      <mesh ref={ring} position-y={0.15} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.8, 1.05, 32]} />
        <meshBasicMaterial color="#fff1b0" transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, SPARKS]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#fffbe0" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// ---------------------------------------------------------------- glows

function Glow({ position, color, size, flicker = 0, evening = 0 }) {
  const sprite = useRef()
  const seed = useMemo(() => Math.random() * 10, [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed
    const f = world.reducedMotion ? 1 : 1 + flicker * (Math.sin(t * 9) * 0.6 + Math.sin(t * 23) * 0.4)
    sprite.current.scale.setScalar(size * f)
    sprite.current.material.opacity = 0.55 + evening * smoothstep(0.55, 1, world.progress) * 0.45
  })
  return (
    <sprite ref={sprite} position={position}>
      <spriteMaterial map={glowTexture()} color={color} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </sprite>
  )
}

function Glows() {
  const spots = useMemo(() => {
    const [vx, vz] = LAVA[0]
    const [mx, mz] = LAVA[LAVA.length - 1]
    const [lx, lz] = LAVA[2]
    const brazier = [
      RUINS.x,
      RUINS_BASE + 2.2,
      RUINS.z,
    ]
    return [
      { position: [CAMPFIRE.x, groundAt(CAMPFIRE.x, CAMPFIRE.z) + 0.8, CAMPFIRE.z], color: '#ff9a40', size: 4, flicker: 0.12, evening: 1 },
      { position: brazier, color: '#ff9a40', size: 3.2, flicker: 0.12, evening: 1 },
      { position: [vx, groundAt(vx, vz) + 1, vz], color: '#ff6a1a', size: 9, flicker: 0.05, evening: 1 },
      { position: [lx, groundAt(lx, lz) + 0.6, lz], color: '#ff6a1a', size: 6, flicker: 0.04, evening: 1 },
      { position: [mx, 0.8, mz], color: '#ffb070', size: 7, flicker: 0.06, evening: 1 },
    ]
  }, [])
  return spots.map((s, i) => <Glow key={i} {...s} />)
}

// ---------------------------------------------------------------- rainbow

const RAINBOW_VERT = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`
const RAINBOW_FRAG = `
  uniform float uOpacity;
  uniform float uInner;
  uniform float uOuter;
  varying vec3 vPos;
  vec3 band(float t) {
    // red on the outside, violet inside
    vec3 c = mix(vec3(0.55, 0.3, 1.0), vec3(0.3, 0.55, 1.0), smoothstep(0.0, 0.2, t));
    c = mix(c, vec3(0.3, 0.9, 0.45), smoothstep(0.2, 0.4, t));
    c = mix(c, vec3(1.0, 0.95, 0.35), smoothstep(0.4, 0.6, t));
    c = mix(c, vec3(1.0, 0.6, 0.25), smoothstep(0.6, 0.8, t));
    c = mix(c, vec3(1.0, 0.3, 0.3), smoothstep(0.8, 1.0, t));
    return c;
  }
  void main() {
    float t = (length(vPos.xy) - uInner) / (uOuter - uInner);
    float a = sin(clamp(t, 0.0, 1.0) * 3.14159) * uOpacity;
    a *= smoothstep(0.0, 0.35, vPos.y / uOuter); // fade where it meets the ground
    gl_FragColor = vec4(band(t) * a, 1.0);
  }`

function Rainbow() {
  const [x, z] = WATERFALL[WATERFALL.length - 1]
  const inner = 6
  const outer = 7.6
  const uniforms = useMemo(() => ({ uOpacity: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer } }), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: RAINBOW_VERT,
        fragmentShader: RAINBOW_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [uniforms],
  )
  useFrame(() => {
    // A daytime thing: gone by the golden hour
    uniforms.uOpacity.value = 0.42 * (1 - smoothstep(0.55, 0.8, world.progress))
  })
  return (
    <mesh position={[x + 1, -0.5, z + 1.5]} rotation-y={-0.35}>
      <ringGeometry args={[inner, outer, 64, 1, 0, Math.PI]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

// ---------------------------------------------------------------- sun shafts

// Slanting shafts of light in the jungle: soft vertical gradients that turn
// to face the camera, leaning the way the light falls
let shaftMap = null
function shaftTexture() {
  if (shaftMap) return shaftMap
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')
  const v = g.createLinearGradient(0, 0, 0, 128)
  v.addColorStop(0, 'rgba(255,255,255,0)')
  v.addColorStop(0.25, 'rgba(255,255,255,.9)')
  v.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = v
  g.fillRect(0, 0, 64, 128)
  // Soft sides
  g.globalCompositeOperation = 'destination-in'
  const h = g.createLinearGradient(0, 0, 64, 0)
  h.addColorStop(0, 'rgba(0,0,0,0)')
  h.addColorStop(0.5, 'rgba(0,0,0,1)')
  h.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = h
  g.fillRect(0, 0, 64, 128)
  shaftMap = new CanvasTexture(c)
  return shaftMap
}

function SunShafts() {
  const group = useRef()
  const shafts = useMemo(() => {
    const rand = mulberry32(19)
    const { jungle } = ZONES
    return Array.from({ length: 7 }, () => {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * jungle.radius * 0.7
      const x = jungle.x + Math.cos(a) * r
      const z = jungle.z + Math.sin(a) * r
      return { x, z, y: groundAt(x, z), w: 1.4 + rand() * 1.4, h: 7 + rand() * 4, seed: rand() * 10 }
    })
  }, [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: shaftTexture(),
        color: '#fff2c0',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  )
  const tmp = useMemo(() => new Vector3(), [])

  useFrame(({ camera, clock }) => {
    const day = 1 - smoothstep(0.6, 0.85, world.progress)
    group.current.visible = day > 0.01
    if (!group.current.visible) return
    material.opacity = 0.16 * day
    group.current.children.forEach((m, i) => {
      const s = shafts[i]
      tmp.set(camera.position.x - s.x, 0, camera.position.z - s.z)
      m.rotation.set(0, Math.atan2(tmp.x, tmp.z), 0.32)
      const pulse = world.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(clock.elapsedTime * 0.6 + s.seed)
      m.scale.set(s.w * pulse, s.h, 1)
    })
  })

  return (
    <group ref={group}>
      {shafts.map((s, i) => (
        <mesh key={i} position={[s.x, s.y + s.h * 0.45, s.z]} material={material}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  )
}

export default function Effects() {
  return (
    <>
      <WarpBeam />
      <Glows />
      <Rainbow />
      <SunShafts />
    </>
  )
}
