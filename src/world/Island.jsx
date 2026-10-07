import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { ISLAND, heightAt, slopeAt } from './terrain'
import { track } from './track'

const PALETTE = {
  sandWet: new Color('#d9b468'),
  sand: new Color('#f3d27a'),
  grass: new Color('#5cbf4a'),
  grassDeep: new Color('#3d9a3f'),
  rock: new Color('#a08a72'),
  summit: new Color('#d8cfbd'),
  dirt: new Color('#d69a5c'),
}

// Cheap deterministic per-vertex jitter so flat-shaded faces don't look uniform.
const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(ISLAND.size, ISLAND.size, 120, 120)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const trail = track.getSpacedPoints(320)
    const c = new Color()

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const y = heightAt(x, z)
      pos.setY(i, y)

      let trailDist = Infinity
      for (const p of trail) {
        const d = (p.x - x) ** 2 + (p.z - z) ** 2
        if (d < trailDist) trailDist = d
      }
      trailDist = Math.sqrt(trailDist)

      if (y < -0.3) c.copy(PALETTE.sandWet)
      else if (y < 0.9) c.copy(PALETTE.sand)
      else if (y < 11) c.copy(PALETTE.grass)
      else if (y < 18) c.copy(PALETTE.grassDeep)
      else c.copy(PALETTE.summit)

      if (y > 0.5 && slopeAt(x, z) > 1.1) c.copy(PALETTE.rock)
      if (y > 0.5 && trailDist < 1.9) c.lerp(PALETTE.dirt, trailDist < 1.2 ? 1 : 0.5)

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
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  )
}

function Ocean() {
  const uniforms = useRef({ uTime: { value: 0 } })

  useFrame((_, dt) => {
    uniforms.current.uTime.value += dt
  })

  const onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.current.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w = sin(position.x * 0.12 + uTime * 1.1) * 0.35
                + cos(position.y * 0.17 + uTime * 0.8) * 0.25;
        transformed.z += w;`,
      )
  }

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={ISLAND.waterLevel}>
      <planeGeometry args={[700, 700, 140, 140]} />
      <meshStandardMaterial
        color="#25b4d6"
        flatShading
        roughness={0.75}
        metalness={0}
        transparent
        opacity={0.92}
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
