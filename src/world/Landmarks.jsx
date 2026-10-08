import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { groundAt } from './terrain'
import { STOPS, isOnBridge, markerU, progressToU, track, trailPoint } from './track'
import {
  FACE_SPIRE,
  HUTS,
  LAVA,
  PALISADE,
  SPIRES,
  STACKS,
  TOTEM,
  TOWER,
  WATERFALL,
  groundPath,
  mulberry32,
} from './layout'
import { TOON_RAMP } from './toon'
import Baked from './Baked'
import { world } from '../store'

// The set dressing that makes the island read as a world map: jagged rock
// spires, a tiki face in the cliff, a waterfall into the gorge, a lava flow
// down the west flank, a stilt village behind a palisade, and an orange dashed
// trail with red stops.

export const Toon = (props) => <meshToonMaterial gradientMap={TOON_RAMP} {...props} />

// ---------------------------------------------------------------- spires

// A cone pulled out of shape: rings scaled and nudged at random, a lean that
// grows toward the tip, darker rock at the base and lighter at the top.
function spireGeometry({ x, z, height, radius }, rand, baseY, straight = false) {
  const rings = 6
  const geo = new ConeGeometry(radius, height, 7, rings).toNonIndexed()
  geo.translate(0, height / 2, 0)
  const pos = geo.attributes.position
  // The face spire stays true, so the carving sits on its surface
  const wild = straight ? 0 : 1
  const ringScale = Array.from({ length: rings + 1 }, () => 1 + (rand() - 0.5) * 0.4 * wild)
  const ringShift = Array.from({ length: rings + 1 }, () => [(rand() - 0.5) * radius * 0.35 * wild, (rand() - 0.5) * radius * 0.35 * wild])
  const lean = [(rand() - 0.5) * radius * 0.8 * wild, (rand() - 0.5) * radius * 0.8 * wild]
  const dark = new Color('#7a4b2f')
  const light = new Color('#c89568')
  const colors = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height
    const ring = Math.round(t * rings)
    const k = ringScale[ring]
    const lift = t * t
    pos.setX(i, pos.getX(i) * k + ringShift[ring][0] * (1 - t) + lean[0] * lift)
    pos.setZ(i, pos.getZ(i) * k + ringShift[ring][1] * (1 - t) + lean[1] * lift)
    c.copy(dark).lerp(light, Math.min(1, t * 1.2 + (rand() - 0.5) * 0.15))
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.translate(x, baseY, z)
  return geo
}

function Spires() {
  const geometry = useMemo(() => {
    const rand = mulberry32(21)
    const parts = [
      ...SPIRES.map((s) => spireGeometry(s, rand, groundAt(s.x, s.z) - 1.5, s === FACE_SPIRE)),
      ...STACKS.map((s) => spireGeometry(s, rand, -3)),
    ]
    const merged = mergeGeometries(parts)
    merged.computeVertexNormals()
    return merged
  }, [])

  // Green tufts clinging to the spires and stacks
  const tufts = useMemo(() => {
    const rand = mulberry32(5)
    const out = []
    for (const s of [...SPIRES, ...STACKS]) {
      const base = STACKS.includes(s) ? -3 : groundAt(s.x, s.z) - 1.5
      const n = 2 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const t = 0.25 + rand() * 0.5
        const a = rand() * Math.PI * 2
        const r = s.radius * (1 - t) * 0.95
        out.push({
          pos: [s.x + Math.cos(a) * r, base + s.height * t, s.z + Math.sin(a) * r],
          scale: 0.5 + rand() * 0.5,
        })
      }
      if (STACKS.includes(s)) out.push({ pos: [s.x, base + s.height * 0.92, s.z], scale: 0.9 })
    }
    return out
  }, [])

  return (
    <>
      <mesh geometry={geometry} castShadow receiveShadow>
        <Toon vertexColors flatShading />
      </mesh>
      <Instances items={tufts} color="#3f9a44">
        <icosahedronGeometry args={[1, 0]} />
      </Instances>
    </>
  )
}

// A great stone face in the cliff, looking out over the gorge
function TikiFace() {
  const s = FACE_SPIRE
  const baseY = groundAt(s.x, s.z) - 1.5
  const h = 6.5
  const r = s.radius * (1 - h / s.height) - 0.15
  const yaw = Math.atan2(-0.6, 0.8) // toward the south-west, where the camera passes
  const dark = '#2a160c'
  return (
    <group position={[s.x, baseY + h, s.z]} rotation-y={yaw}>
      <group position={[0, 0, r]}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.75, 0.3, 0]} rotation-z={side * 0.25} scale={[0.55, 0.7, 0.35]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshBasicMaterial color={dark} />
          </mesh>
        ))}
        <mesh position={[0, -0.6, 0.1]} rotation-x={-0.3} scale={[0.32, 0.5, 0.4]}>
          <coneGeometry args={[1, 1, 3]} />
          <meshBasicMaterial color={dark} />
        </mesh>
        <mesh position={[0, 0.95, 0.15]} scale={[1.6, 0.22, 0.4]} castShadow>
          <boxGeometry />
          <Toon color="#8b5a38" flatShading />
        </mesh>
        <mesh position={[0, -1.35, 0]} scale={[1.1, 0.22, 0.3]}>
          <boxGeometry />
          <meshBasicMaterial color={dark} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- flows

// Flat strip lying on the ground along `points`; uv.y runs along it. Edge heights:
//  'groove': level with the centre line (the bottom of a carved channel)
//  'under':  follow the ground, but never above the centre line, so nothing
//            standing on the centre line sinks into it
function ribbonGeometry(points, width, lift, mode = 'groove') {
  const n = points.length
  const pos = new Float32Array(n * 2 * 3)
  const uv = new Float32Array(n * 2 * 2)
  const idx = []
  const side = new Vector3()
  const dir = new Vector3()
  let along = 0
  for (let i = 0; i < n; i++) {
    const p = points[i]
    dir.subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).setY(0).normalize()
    side.set(-dir.z, 0, dir.x)
    if (i > 0) along += p.distanceTo(points[i - 1])
    for (let s = 0; s < 2; s++) {
      const k = s ? 1 : -1
      const x = p.x + side.x * width * 0.5 * k
      const z = p.z + side.z * width * 0.5 * k
      const y = mode === 'groove' ? p.y + lift : Math.min(groundAt(x, z) + 0.08, p.y + lift)
      pos.set([x, y, z], (i * 2 + s) * 3)
      uv.set([s, along], (i * 2 + s) * 2)
    }
    if (i < n - 1) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) // counter-clockwise from above
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('uv', new BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

const FLOW_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`
const FLOW_FRAG = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uScale;
  uniform vec3 uBase;
  uniform vec3 uStreak;
  uniform vec3 uEdge;
  varying vec2 vUv;
  void main() {
    float wobble = sin(vUv.x * 9.0 + vUv.y * 0.7) * 0.18;
    float s = fract(vUv.y * uScale - uTime * uSpeed + wobble);
    float streak = smoothstep(0.55, 0.62, s) * (1.0 - smoothstep(0.8, 0.88, s));
    float edge = smoothstep(0.32, 0.5, abs(vUv.x - 0.5));
    vec3 col = mix(uBase, uStreak, streak);
    col = mix(col, uEdge, edge);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`

function Flow({ points, width, lift, base, streak, edge, speed, scale }) {
  const geometry = useMemo(() => ribbonGeometry(points, width, lift), [points, width, lift])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uScale: { value: scale },
      uBase: { value: new Color(base) },
      uStreak: { value: new Color(streak) },
      uEdge: { value: new Color(edge) },
    }),
    [base, streak, edge, speed, scale],
  )
  // Built here rather than as JSX props: R3F copies a `uniforms` prop into new
  // wrappers, so values set on our object afterwards would never reach the shader
  const material = useMemo(
    () => new ShaderMaterial({ vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, uniforms, side: DoubleSide }),
    [uniforms],
  )
  useFrame((_, dt) => {
    if (!world.reducedMotion) uniforms.uTime.value += dt
  })
  return (
    <mesh geometry={geometry}>
      <primitive object={material} attach="material" />
    </mesh>
  )
}

// Puffs that rise, grow and fade on a loop: spray under the waterfall, steam
// where the lava meets the sea
export function Puffs({ at, count, color, rise, spread, size, period }) {
  const mesh = useRef()
  const seeds = useMemo(() => {
    const rand = mulberry32(count * 13 + Math.round(at.x))
    return Array.from({ length: count }, () => ({ dx: (rand() - 0.5) * spread, dz: (rand() - 0.5) * spread, t: rand() }))
  }, [at, count, spread])
  useFrame((_, dt) => {
    seeds.forEach((s, i) => {
      if (!world.reducedMotion) s.t = (s.t + dt / period) % 1
      _p.set(at.x + s.dx * (1 + s.t), at.y + s.t * rise, at.z + s.dz * (1 + s.t))
      _s.setScalar(size * (0.4 + s.t) * (1 - s.t * s.t))
      mesh.current.setMatrixAt(i, _m.compose(_p, _q.identity(), _s))
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <Toon color={color} flatShading />
    </instancedMesh>
  )
}

function Waterfall() {
  const points = useMemo(() => groundPath(WATERFALL, 30), [])
  const foot = points[points.length - 1].clone().setY(-0.1)
  return (
    <>
      <Flow points={points} width={2} lift={0.45} base="#3cb6e6" streak="#e8fbff" edge="#ffffff" speed={1.4} scale={0.9} />
      <Puffs at={foot} count={7} color="#ffffff" rise={1.4} spread={2.4} size={0.65} period={1.6} />
    </>
  )
}

function Lava() {
  const glow = useRef()
  const points = useMemo(() => groundPath(LAVA, 60), [])
  // Warm light off the vent, flickering a little, stronger as the sun goes down
  useFrame(({ clock }) => {
    const flicker = world.reducedMotion ? 1 : 0.9 + Math.sin(clock.elapsedTime * 7.3) * 0.06 + Math.sin(clock.elapsedTime * 3.1) * 0.04
    glow.current.intensity = (60 + world.progress * 90) * flicker
  })
  const mouth = points[points.length - 1].clone().setY(0)
  const vent = points[0]
  return (
    <>
      <Flow points={points} width={2} lift={0.3} base="#ff6a1a" streak="#ffd23a" edge="#a8240c" speed={0.25} scale={0.35} />
      {/* Vent: a dark lip round a glowing pool */}
      <mesh position={[vent.x, vent.y + 0.2, vent.z]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.7, 10]} />
        <meshBasicMaterial color="#ffb02e" toneMapped={false} />
      </mesh>
      <pointLight ref={glow} position={[vent.x, vent.y + 2.5, vent.z]} color="#ff7a2a" distance={22} decay={2} />
      <Puffs at={mouth} count={8} color="#f4efe8" rise={4} spread={3} size={1.1} period={3.2} />
      <Puffs at={vent.clone().setY(vent.y + 0.5)} count={4} color="#8d817a" rise={3} spread={1.5} size={0.7} period={2.6} />
    </>
  )
}

// ---------------------------------------------------------------- village

function Hut({ x, z, rot, band, size }) {
  const y = groundAt(x, z)
  return (
    <group position={[x, y, z]} rotation-y={rot} scale={size}>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * 1.05, 0.5, sz * 1.05]} castShadow>
          <cylinderGeometry args={[0.12, 0.14, 1.4, 5]} />
          <Toon color="#6e4526" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 0.2, 3]} />
        <Toon color="#9c6a37" flatShading />
      </mesh>
      <mesh position={[0, 2.1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.35, 1.45, 1.6, 8]} />
        <Toon color="#b07a42" flatShading />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <cylinderGeometry args={[1.42, 1.48, 0.35, 8]} />
        <Toon color={band} flatShading />
      </mesh>
      <mesh position={[0, 1.9, 1.38]}>
        <boxGeometry args={[0.6, 1.1, 0.1]} />
        <meshBasicMaterial color="#2a160c" />
      </mesh>
      <mesh position={[0, 3.65, 0]} castShadow>
        <coneGeometry args={[2.3, 1.9, 9]} />
        <Toon color="#e7b53a" flatShading />
      </mesh>
      <mesh position={[0, 4.75, 0]} castShadow>
        <coneGeometry args={[0.35, 0.6, 5]} />
        <Toon color="#c99024" flatShading />
      </mesh>
    </group>
  )
}

function Tower() {
  const y = groundAt(TOWER.x, TOWER.z)
  return (
    <group position={[TOWER.x, y, TOWER.z]} rotation-y={0.4}>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * 0.8, 2.6, sz * 0.8]} rotation={[sz * 0.06, 0, -sx * 0.06]} castShadow>
          <cylinderGeometry args={[0.12, 0.16, 5.4, 5]} />
          <Toon color="#6e4526" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 5.2, 0]} castShadow>
        <boxGeometry args={[2.2, 0.6, 2.2]} />
        <Toon color="#9c6a37" flatShading />
      </mesh>
      <mesh position={[0, 6.6, 0]} castShadow>
        <coneGeometry args={[1.8, 1.4, 4]} />
        <Toon color="#e7b53a" flatShading />
      </mesh>
    </group>
  )
}

function Palisade() {
  const logs = useMemo(() => {
    const rand = mulberry32(9)
    return PALISADE.map(({ x, z, a }) => {
      const h = 2 + rand() * 0.8
      return { pos: [x, groundAt(x, z) + h / 2 - 0.3, z], scale: [1, h, 1], rot: [(rand() - 0.5) * 0.1, a, (rand() - 0.5) * 0.1] }
    })
  }, [])
  const tips = useMemo(
    () => logs.map((l) => ({ pos: [l.pos[0], l.pos[1] + l.scale[1] / 2 + 0.25, l.pos[2]], scale: [1, 1, 1], rot: l.rot })),
    [logs],
  )
  return (
    <>
      <Instances items={logs} color="#8a5a32">
        <cylinderGeometry args={[0.28, 0.28, 1, 6]} />
      </Instances>
      <Instances items={tips} color="#b8844f">
        <coneGeometry args={[0.28, 0.5, 6]} />
      </Instances>
    </>
  )
}

// Stacked tiki totem by the crate clearing
function Totem() {
  const y = groundAt(TOTEM.x, TOTEM.z)
  const blocks = ['#c8323a', '#2fa39a', '#e0a020']
  return (
    <group position={[TOTEM.x, y, TOTEM.z]} rotation-y={-0.5}>
      {blocks.map((color, i) => (
        <group key={i} position={[0, 0.6 + i * 1.15, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.1, 1.1, 1.1]} />
            <Toon color={color} flatShading />
          </mesh>
          {[-0.25, 0.25].map((x) => (
            <mesh key={x} position={[x, 0.15, 0.56]}>
              <boxGeometry args={[0.24, 0.16, 0.04]} />
              <meshBasicMaterial color="#1e1e22" />
            </mesh>
          ))}
          <mesh position={[0, -0.25, 0.56]}>
            <boxGeometry args={[0.6, 0.12, 0.04]} />
            <meshBasicMaterial color="#1e1e22" />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.85, 3.2, 0]} rotation-z={-s * 0.5} castShadow>
          <boxGeometry args={[0.8, 0.18, 0.5]} />
          <Toon color="#e0a020" flatShading />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------- trail

// The trail drawn on the ground all the way to the summit, like the path on a
// world map: a sandy strip with an orange dashed centre line, plus a red stop
// for each section of the page

// Sand with darker edges and an orange dash down the middle; repeats along the trail
function pathTexture() {
  const w = 32
  const h = 64
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.fillStyle = '#f0cf86'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#d29a55'
  g.fillRect(0, 0, 4, h)
  g.fillRect(w - 4, 0, 4, h)
  g.fillStyle = '#ff8a1e'
  g.fillRect(w / 2 - 4, 0, 8, h * 0.55)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapT = RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function TrailPath() {
  const { strips, stops, material } = useMemo(() => {
    const p = new Vector3()
    // Two strips, either side of the bridge (the planks are the path there)
    const strip = (from, to) => {
      const n = Math.ceil(((to - from) * track.getLength()) / 0.4)
      return Array.from({ length: n + 1 }, (_, i) => trailPoint(from + ((to - from) * i) / n, new Vector3()))
    }
    // Just under the runner's feet down the middle; on a sideways slope the
    // uphill edge tucks into the hill rather than rising above them
    const strips = [
      ribbonGeometry(strip(0, markerU.bridgeStart - 0.002), 1.8, -0.02, 'under'),
      ribbonGeometry(strip(markerU.bridgeEnd + 0.002, 1), 1.8, -0.02, 'under'),
    ]
    const stops = STOPS.map((s) => {
      // A stop that lands on the bridge sits at its near end instead
      const u = progressToU(s.p)
      trailPoint(isOnBridge(u) ? markerU.bridgeStart - 0.004 : u, p)
      return { pos: [p.x, p.y + 0.02, p.z], rot: [0, 0, 0], scale: [1, 1, 1] }
    })
    const map = pathTexture()
    map.repeat.set(1, 1 / 2.2) // one dash every 2.2 units
    const material = new MeshToonMaterial({ map, gradientMap: TOON_RAMP, polygonOffset: true, polygonOffsetFactor: -2 })
    return { strips, stops, material }
  }, [])

  return (
    <>
      {strips.map((geo, i) => (
        <mesh key={i} geometry={geo} material={material} receiveShadow />
      ))}
      <Instances items={stops} color="#e2333a">
        <cylinderGeometry args={[0.85, 0.9, 0.16, 14]} />
      </Instances>
    </>
  )
}

// ---------------------------------------------------------------- helpers

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _e = new Euler()

// One instanced mesh for a list of { pos, rot?, scale? }; extra props go to
// the material (a wind sway, say)
export function Instances({ items, color, children, shadow = true, ...material }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const mesh = ref.current
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(...(it.rot ?? [0, 0, 0])))
      const sc = it.scale
      _s.set(...(Array.isArray(sc) ? sc : [sc ?? 1, sc ?? 1, sc ?? 1]))
      mesh.setMatrixAt(i, _m.compose(_p.set(...it.pos), _q, _s))
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={shadow} receiveShadow>
      {children}
      <Toon color={color} flatShading {...material} />
    </instancedMesh>
  )
}

// The dark lip round the lava vent
function VentRim() {
  const [x, z] = LAVA[0]
  return (
    <mesh position={[x, groundAt(x, z) + 0.15, z]}>
      <torusGeometry args={[1.9, 0.6, 5, 10]} />
      <Toon color="#4a2a1a" />
    </mesh>
  )
}

export default function Landmarks() {
  return (
    <>
      <Spires />
      <Waterfall />
      <Lava />
      {/* Every static prop folded into one draw call */}
      <Baked>
        <TikiFace />
        <VentRim />
        {HUTS.map((h, i) => (
          <Hut key={i} {...h} />
        ))}
        <Tower />
        <Totem />
      </Baked>
      <Palisade />
      <TrailPath />
    </>
  )
}
