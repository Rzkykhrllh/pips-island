import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three'
import { heightAt } from './terrain'
import { trailDistance2 } from './track'
import { isClear, mulberry32 } from './layout'
import { TOON_RAMP } from './toon'

// Palms with drooping fronds on the beaches and lowlands, broadleaf trees and
// bushes in the jungle, pink spiky plants for colour, rocks scattered about.
// Every part is one instanced mesh, so the whole forest is a handful of draw calls.

// A frond: a flat cone lying along +z with its base at the origin
const frond = new ConeGeometry(0.42, 2.6, 4, 1)
frond.rotateX(Math.PI / 2)
frond.translate(0, 0, 1.3)
frond.scale(1, 0.22, 1)

const GEO = {
  trunk: new CylinderGeometry(0.13, 0.22, 1, 6).translate(0, 0.5, 0),
  frond,
  coconut: new IcosahedronGeometry(0.2, 0),
  crown: new IcosahedronGeometry(1, 0),
  bush: new IcosahedronGeometry(1, 0),
  spike: new ConeGeometry(0.16, 1.1, 4).translate(0, 0.55, 0),
  rock: new DodecahedronGeometry(1, 0),
}

function useForest() {
  return useMemo(() => {
    const rand = mulberry32(7)
    const parts = Object.fromEntries(Object.keys(GEO).map((k) => [k, []]))
    const root = new Matrix4()
    const local = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const one = new Vector3(1, 1, 1)

    const push = (key, rootM, localM, color) => parts[key].push({ matrix: rootM.clone().multiply(localM), color })
    const at = (pos, scale = one, rot = null) => local.compose(pos, rot ? q.setFromEuler(rot).clone() : new Quaternion(), scale)

    const greens = ['#4fb848', '#3fa64a', '#62c454', '#2f8f46'].map((c) => new Color(c))
    const fronds = ['#4cbf3e', '#3aa53c', '#62cf4a'].map((c) => new Color(c))
    const trunkColor = new Color('#8a5a32')
    const nut = new Color('#6b4a1e')

    const palm = (x, y, z, s) => {
      const lean = new Euler((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
      root.compose(new Vector3(x, y - 0.1, z), new Quaternion().setFromEuler(lean), new Vector3(s, s, s))
      const h = 3.2 + rand() * 0.8
      push('trunk', root, at(new Vector3(0, 0, 0), new Vector3(0.8, h, 0.8)), trunkColor)
      const green = fronds[Math.floor(rand() * fronds.length)]
      const count = 7
      for (let i = 0; i < count; i++) {
        const yaw = (i / count) * Math.PI * 2 + rand() * 0.3
        const droop = 0.35 + rand() * 0.35
        push('frond', root, at(new Vector3(0, h, 0), one, e.set(droop, yaw, 0, 'YXZ')), green)
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        push('coconut', root, at(new Vector3(Math.cos(a) * 0.2, h - 0.2, Math.sin(a) * 0.2)), nut)
      }
    }

    let placed = 0
    for (let tries = 0; tries < 5000 && placed < 230; tries++) {
      const x = (rand() - 0.5) * 150
      const z = (rand() - 0.5) * 150
      const y = heightAt(x, z)
      if (y < 0.5 || y > 8.5) continue
      if (Math.abs(z + 13) < 4.5) continue // keep the gorge clear
      if (trailDistance2(x, z) < 3.2 ** 2) continue
      if (!isClear(x, z, 1.2)) continue

      const s = 0.75 + rand() * 0.55
      const isPalm = y < 3 || rand() < 0.3
      if (isPalm) {
        palm(x, y, z, s)
      } else {
        q.setFromEuler(e.set(0, rand() * Math.PI * 2, 0))
        root.compose(new Vector3(x, y - 0.1, z), q, new Vector3(s, s, s))
        const green = greens[Math.floor(rand() * greens.length)]
        push('trunk', root, at(new Vector3(0, 0, 0), new Vector3(1.1, 1.6, 1.1)), trunkColor)
        push('crown', root, at(new Vector3(0, 2.2, 0), new Vector3(1.25, 1.05, 1.25)), green)
        push('crown', root, at(new Vector3(0.5, 2.9, 0.2), new Vector3(0.8, 0.75, 0.8)), green)
      }
      placed++
    }

    // Undergrowth: bushes and pink spiky plants, allowed closer to the trail
    const pinks = ['#d6407f', '#e85a9a', '#b8306c'].map((c) => new Color(c))
    for (let i = 0, tries = 0; i < 170 && tries < 4000; tries++) {
      const x = (rand() - 0.5) * 150
      const z = (rand() - 0.5) * 150
      const y = heightAt(x, z)
      if (y < 0.7 || y > 11) continue
      if (trailDistance2(x, z) < 2 ** 2) continue
      if (!isClear(x, z, 0.4)) continue
      const s = 0.4 + rand() * 0.5
      q.setFromEuler(e.set(0, rand() * Math.PI * 2, 0))
      root.compose(new Vector3(x, y, z), q, new Vector3(s, s, s))
      if (rand() < 0.4) {
        const pink = pinks[Math.floor(rand() * pinks.length)]
        for (let k = 0; k < 5; k++) {
          const yaw = (k / 5) * Math.PI * 2
          push('spike', root, at(new Vector3(0, 0, 0), one, e.set(0.45 + rand() * 0.25, yaw, 0, 'YXZ')), pink)
        }
      } else {
        push('bush', root, at(new Vector3(0, 0.35, 0), new Vector3(1.2, 0.8, 1.2)), greens[Math.floor(rand() * greens.length)])
      }
      i++
    }

    const stone = new Color('#9b9488')
    for (let i = 0; i < 50; i++) {
      const x = (rand() - 0.5) * 120
      const z = (rand() - 0.5) * 120
      const y = heightAt(x, z)
      if (y < 0.3) continue
      if (trailDistance2(x, z) < 2.2 ** 2) continue
      if (!isClear(x, z, 0.5)) continue
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
    mesh.computeBoundingSphere()
  }, [items])

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} castShadow receiveShadow>
      <meshToonMaterial flatShading gradientMap={TOON_RAMP} />
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
