import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { ISLAND, TERRAIN_SEGMENTS, heightAt, slopeAt, smoothstep } from './terrain'
import { trailDistance2 } from './track'
import { TOON_RAMP } from './toon'
import { world } from '../store'

const PALETTE = {
  sandWet: new Color('#d9b06a'),
  sand: new Color('#f2cf86'),
  grass: new Color('#58b947'),
  grassDeep: new Color('#3a9441'),
  rock: new Color('#9a6a46'),
  rockLight: new Color('#b98a5e'),
  dirt: new Color('#e3a868'),
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
      const y = heightAt(x, z)
      pos.setY(i, y)

      if (y < -0.3) c.copy(PALETTE.sandWet)
      else if (y < 0.9) c.copy(PALETTE.sand)
      else c.copy(PALETTE.grass).lerp(PALETTE.grassDeep, smoothstep(3, 7, y))

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
      <meshToonMaterial vertexColors flatShading gradientMap={TOON_RAMP} />
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
      const depth = ISLAND.waterLevel - heightAt(x, z)
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
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aDepth;\nvarying float vDepth;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDepth = aDepth;')
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
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vDepth;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float edge = 0.32 + 0.12 * sin(uTime * 1.3);
        float foam = 1.0 - smoothstep(edge - 0.1, edge, vDepth);
        float roll = fract(uTime * 0.18 + vDepth * 0.9); // rolls toward the shore
        foam = max(foam, (1.0 - smoothstep(0.0, 0.06, abs(roll - 0.5))) * (1.0 - smoothstep(0.4, 1.4, vDepth)) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.98, 0.95), foam * step(0.0, vDepth));`,
      )
  }

  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={ISLAND.waterLevel}>
      <meshToonMaterial
        vertexColors
        flatShading
        gradientMap={TOON_RAMP}
        transparent
        opacity={0.93}
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
