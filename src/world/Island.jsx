import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { ISLAND, TERRAIN_SEGMENTS, ZONES, groundAt, slopeAt, smoothstep, zoneWeight } from './terrain'
import { trailDistance2 } from './track'
import { TOON_RAMP } from './toon'
import { addCloudShade, cloudShaded } from './cloudShade'
import { world } from '../store'

const PALETTE = {
  sandWet: new Color('#d9b06a'),
  sand: new Color('#f2cf86'),
  grass: new Color('#58b947'),
  grassDeep: new Color('#3a9441'),
  rock: new Color('#9a6a46'),
  rockLight: new Color('#b98a5e'),
  dirt: new Color('#e3a868'),
  meadow: new Color('#86cf55'),
  meadowLight: new Color('#a7dc62'),
  jungleFloor: new Color('#2f7d3a'),
  mud: new Color('#7a6a3a'),
  bare: new Color('#b8925a'),
  shallow: new Color('#4fd2cf'),
  deep: new Color('#167c96'),
}

// Cheap deterministic per-vertex jitter so flat-shaded faces don't look uniform.
const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(ISLAND.size, ISLAND.size, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const c = new Color()

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const y = groundAt(x, z)
      pos.setY(i, y)

      if (y < -0.3) c.copy(PALETTE.sandWet)
      else if (y < 0.9) c.copy(PALETTE.sand)
      else {
        c.copy(PALETTE.grass).lerp(PALETTE.grassDeep, smoothstep(3, 7, y))
        // Zones: a sunny meadow with lighter patches, a dark jungle floor
        const meadow = zoneWeight(ZONES.meadow, x, z)
        const patch = Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.38) + Math.sin((x + z) * 0.21) * 0.6
        if (meadow > 0) c.lerp(patch > 0.4 ? PALETTE.meadowLight : PALETTE.meadow, meadow * 0.85)
        c.lerp(PALETTE.jungleFloor, zoneWeight(ZONES.jungle, x, z) * 0.7)
        // Bare earth here and there, and mud round the pond
        const bare = Math.sin(x * 0.9 + z * 0.3) * Math.sin(z * 0.7 - x * 0.2)
        if (bare > 0.82 && y < 6) c.lerp(PALETTE.bare, 0.5)
        const pd = Math.hypot(x - ISLAND.pond.x, z - ISLAND.pond.z) / ISLAND.pond.radius
        if (pd < 1.35) c.lerp(PALETTE.mud, 1 - smoothstep(1.05, 1.35, pd))
      }

      // The massif turns to bare rock as it climbs, lighter toward the top
      const rocky = Math.max(smoothstep(6, 9, y), y > 0.5 && slopeAt(x, z) > 1.1 ? 1 : 0)
      if (rocky > 0) c.lerp(PALETTE.rock.clone().lerp(PALETTE.rockLight, smoothstep(10, 18, y)), rocky)

      if (y > 0.5) {
        const near = Math.sqrt(trailDistance2(x, z))
        if (near < 1.9) c.lerp(PALETTE.dirt, near < 1.2 ? 1 : 0.5)
      }

      const j = 0.92 + hash(x, z) * 0.14
      colors[i * 3] = c.r * j
      colors[i * 3 + 1] = c.g * j
      colors[i * 3 + 2] = c.b * j
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshToonMaterial vertexColors flatShading gradientMap={TOON_RAMP} {...cloudShaded} />
    </mesh>
  )
}

function Ocean() {
  const uniforms = useRef({ uTime: { value: 0 } })

  // Shallow turquoise over the sand shelf, deep blue further out, baked into
  // vertex colours once. The water depth goes along too, for the foam that
  // laps at the shore in the shader below.
  const geometry = useMemo(() => {
    // Dense near the island (for the shore colours and waves), sparse far out:
    // a grid squeezed toward the middle, about 40% of the triangles of an even one
    const geo = new PlaneGeometry(2, 2, 140, 140)
    const pos = geo.attributes.position
    const spread = (t) => 210 * (0.42 * t + 0.58 * t * t * t)
    for (let i = 0; i < pos.count; i++) pos.setXY(i, spread(pos.getX(i)), spread(pos.getY(i)))
    const colors = new Float32Array(pos.count * 3)
    const depths = new Float32Array(pos.count)
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      // The plane is rotated -90° about x, so local y is world -z
      const x = pos.getX(i)
      const z = -pos.getY(i)
      const depth = ISLAND.waterLevel - groundAt(x, z)
      c.copy(PALETTE.shallow).lerp(PALETTE.deep, smoothstep(0.4, 2.2, depth))
      colors.set([c.r, c.g, c.b], i * 3)
      depths[i] = depth
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.setAttribute('aDepth', new BufferAttribute(depths, 1))
    return geo
  }, [])

  useFrame((_, dt) => {
    if (!world.reducedMotion) uniforms.current.uTime.value += dt
  })

  const onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.current.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aDepth;\nvarying float vDepth;\nvarying vec2 vSeaXZ;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDepth = aDepth;\nvSeaXZ = vec2(position.x, -position.y);')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w = sin(position.x * 0.12 + uTime * 1.1) * 0.3
                + cos(position.y * 0.17 + uTime * 0.8) * 0.2;
        transformed.z += w;`,
      )
    // Foam: a pale band at the waterline that swells and ebbs, with a second,
    // fainter line rolling in from a little further out
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vDepth;\nvarying vec2 vSeaXZ;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float edge = 0.32 + 0.12 * sin(uTime * 1.3);
        float foam = 1.0 - smoothstep(edge - 0.1, edge, vDepth);
        float roll = fract(uTime * 0.18 + vDepth * 0.9); // rolls toward the shore
        foam = max(foam, (1.0 - smoothstep(0.0, 0.06, abs(roll - 0.5))) * (1.0 - smoothstep(0.4, 1.4, vDepth)) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.98, 0.95), foam * step(0.0, vDepth));
        // Sun glints twinkling on open water
        float glint = sin(vSeaXZ.x * 2.3 + uTime * 1.7) * sin(vSeaXZ.y * 2.9 - uTime * 1.3) * sin((vSeaXZ.x - vSeaXZ.y) * 1.7 + uTime * 0.9);
        glint = smoothstep(0.8, 0.95, glint) * smoothstep(0.8, 2.5, vDepth);
        diffuseColor.rgb += vec3(1.0, 0.97, 0.85) * glint * 0.8;`,
      )
    addCloudShade(shader)
  }

  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={ISLAND.waterLevel}>
      <meshToonMaterial
        vertexColors
        flatShading
        gradientMap={TOON_RAMP}
        onBeforeCompile={onBeforeCompile}
      />
    </mesh>
  )
}

export default function Island() {
  return (
    <>
      <Terrain />
      <Ocean />
    </>
  )
}
