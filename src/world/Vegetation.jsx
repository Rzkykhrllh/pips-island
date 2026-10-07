import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { heightAt } from './terrain'
import { track } from './track'

// Seeded RNG so the island looks the same on every load.
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GEO = {
  trunk: new CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0),
  palmCrown: new ConeGeometry(1.5, 0.55, 7).translate(0, -0.1, 0),
  roundCrown: new IcosahedronGeometry(1, 0),
  pineCone: new ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  rock: new DodecahedronGeometry(1, 0),
}

// Builds world matrices for each part of each tree type.
function useForest() {
  return useMemo(() => {
    const rand = mulberry32(7)
    const trail = track.getSpacedPoints(260)
    const parts = { trunk: [], palmCrown: [], roundCrown: [], pineCone: [], rock: [] }
    const root = new Matrix4()
    const local = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()

    const push = (key, rootM, pos, scale, color) => {
      local.compose(pos, new Quaternion(), scale)
      parts[key].push({ matrix: rootM.clone().multiply(local), color })
    }

    const greens = ['#4fb848', '#3fa64a', '#62c454', '#2f8f46'].map((c) => new Color(c))
    const trunkColor = new Color('#8a5a32')

    let placed = 0
    for (let tries = 0; tries < 4000 && placed < 190; tries++) {
      const x = (rand() - 0.5) * 120
      const z = (rand() - 0.5) * 120
      const y = heightAt(x, z)
      if (y < 0.7 || y > 19) continue
      if (Math.abs(z + 13) < 4.5) continue // keep the canyon clear
      let near = Infinity
      for (const p of trail) near = Math.min(near, (p.x - x) ** 2 + (p.z - z) ** 2)
      if (near < 3.4 ** 2) continue

      const s = 0.75 + rand() * 0.6
      const green = greens[Math.floor(rand() * greens.length)]
      const isPalm = y < 2.4
      const isPine = !isPalm && (y > 9 || rand() < 0.35)

      if (isPalm) {
        e.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
        q.setFromEuler(e)
        root.compose(new Vector3(x, y - 0.1, z), q, new Vector3(s, s, s))
        push('trunk', root, new Vector3(0, 0, 0), new Vector3(0.8, 3, 0.8), trunkColor)
        push('palmCrown', root, new Vector3(0, 3, 0), new Vector3(1, 1, 1), green)
      } else if (isPine) {
        q.setFromEuler(e.set(0, rand() * Math.PI * 2, 0))
        root.compose(new Vector3(x, y - 0.1, z), q, new Vector3(s, s, s))
        push('trunk', root, new Vector3(0, 0, 0), new Vector3(1, 0.9, 1), trunkColor)
        push('pineCone', root, new Vector3(0, 0.7, 0), new Vector3(1.1, 1.9, 1.1), green)
        push('pineCone', root, new Vector3(0, 1.9, 0), new Vector3(0.75, 1.4, 0.75), green)
      } else {
        q.setFromEuler(e.set(0, rand() * Math.PI * 2, 0))
        root.compose(new Vector3(x, y - 0.1, z), q, new Vector3(s, s, s))
        push('trunk', root, new Vector3(0, 0, 0), new Vector3(1, 1.5, 1), trunkColor)
        push('roundCrown', root, new Vector3(0, 2.1, 0), new Vector3(1.15, 1, 1.15), green)
      }
      placed++
    }

    const stone = new Color('#9b9488')
    for (let i = 0; i < 45; i++) {
      const x = (rand() - 0.5) * 110
      const z = (rand() - 0.5) * 110
      const y = heightAt(x, z)
      if (y < 0.3) continue
      let near = Infinity
      for (const p of trail) near = Math.min(near, (p.x - x) ** 2 + (p.z - z) ** 2)
      if (near < 2.2 ** 2) continue
      const s = 0.3 + rand() * 0.8
      q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3))
      root.compose(new Vector3(x, y, z), q, new Vector3(s, s * 0.7, s))
      parts.rock.push({ matrix: root.clone(), color: stone })
    }
    return parts
  }, [])
}

function Instanced({ geometry, items }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const mesh = ref.current
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.matrix)
      mesh.setColorAt(i, it.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items])

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial flatShading roughness={0.9} />
    </instancedMesh>
  )
}

export default function Vegetation() {
  const parts = useForest()
  return (
    <>
      {Object.entries(parts).map(([key, items]) =>
        items.length ? <Instanced key={key} geometry={GEO[key]} items={items} /> : null,
      )}
    </>
  )
}
