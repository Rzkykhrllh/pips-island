import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { ZONES, groundAt, slopeAt, zoneWeight } from './terrain'
import { trailDistance2 } from './track'
import { BAMBOO, BONUS_CRATES, isClear, mulberry32 } from './layout'
import { TOON_RAMP } from './toon'
import { WIND_TIME, windSway } from './wind'
import { world } from '../store'

// Everything that grows (and a few things that wash up), by zone:
//  - beaches: palms, shells, starfish, driftwood
//  - the east meadow: open grass, tall tufts and flowers, the odd tree
//  - the west jungle: dense dark broadleaf, ferns and mushrooms underneath
//  - a bamboo grove, pink spiky plants and bushes in between
//  - the massif: boulders on its lower slopes
// Every part is one instanced mesh (a couple of dozen draw calls for the lot),
// and everything leafy sways in the wind (wind.js).

// A frond: a flat cone lying along +z with its base at the origin
const leaf = (width, length) => {
  const g = new ConeGeometry(width, length, 4, 1)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, length / 2)
  g.scale(1, 0.22, 1)
  return g
}

// Parts: geometry, how they sway, and whether they cast shadows
const PARTS = {
  trunk: { geo: new CylinderGeometry(0.13, 0.22, 1, 6).translate(0, 0.5, 0), wind: { perHeight: 0.05 } },
  frond: { geo: leaf(0.42, 2.6), wind: { base: 0.2, flutter: 0.04 } },
  coconut: { geo: new IcosahedronGeometry(0.2, 0), wind: { base: 0.2 } },
  crown: { geo: new IcosahedronGeometry(1, 0), wind: { base: 0.1, perHeight: 0.03 } },
  bush: { geo: new IcosahedronGeometry(1, 0), wind: { perHeight: 0.06 } },
  spike: { geo: new ConeGeometry(0.16, 1.1, 4).translate(0, 0.55, 0), wind: { perHeight: 0.12 } },
  fern: { geo: leaf(0.2, 1.1), wind: { base: 0.03, flutter: 0.02 }, shadow: false },
  blade: { geo: new ConeGeometry(0.07, 0.8, 3).translate(0, 0.4, 0), wind: { perHeight: 0.35 }, shadow: false },
  stem: { geo: new CylinderGeometry(0.02, 0.02, 0.55, 3).translate(0, 0.275, 0), wind: { perHeight: 0.3 }, shadow: false },
  bloom: { geo: new IcosahedronGeometry(0.12, 0).translate(0, 0.58, 0), wind: { perHeight: 0.3 }, shadow: false },
  bamboo: { geo: new CylinderGeometry(0.11, 0.13, 1, 6).translate(0, 0.5, 0), wind: { perHeight: 0.04 } },
  bambooLeaf: { geo: leaf(0.12, 0.9), wind: { base: 0.25, flutter: 0.03 }, shadow: false },
  capStem: { geo: new CylinderGeometry(0.05, 0.07, 0.25, 5).translate(0, 0.125, 0), shadow: false },
  cap: { geo: new SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.22, 0), shadow: false },
  rock: { geo: new DodecahedronGeometry(1, 0) },
  shell: { geo: new ConeGeometry(0.12, 0.16, 6).translate(0, 0.05, 0), shadow: false },
  starfish: { geo: new OctahedronGeometry(0.16, 0).scale(1, 0.25, 1), shadow: false },
  log: { geo: new CylinderGeometry(0.14, 0.17, 1, 6).rotateZ(Math.PI / 2) },
}

const hex = (list) => list.map((c) => new Color(c))
const pick = (rand, list) => list[Math.floor(rand() * list.length)]

function useForest() {
  return useMemo(() => {
    const rand = mulberry32(7)
    const parts = Object.fromEntries(Object.keys(PARTS).map((k) => [k, []]))
    const root = new Matrix4()
    const local = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const one = new Vector3(1, 1, 1)
    const zero = new Vector3()

    const push = (key, rootM, localM, color) => parts[key].push({ matrix: rootM.clone().multiply(localM), color })
    const at = (pos, scale = one, rot = null) => local.compose(pos, rot ? q.setFromEuler(rot).clone() : new Quaternion(), scale)
    const place = (x, y, z, s, yaw = rand() * Math.PI * 2) =>
      root.compose(new Vector3(x, y, z), new Quaternion().setFromEuler(e.set(0, yaw, 0)), new Vector3(s, s, s))
    const scatter = (span) => [(rand() - 0.5) * span, (rand() - 0.5) * span]
    const meadowAt = (x, z) => zoneWeight(ZONES.meadow, x, z)
    const jungleAt = (x, z) => zoneWeight(ZONES.jungle, x, z)

    const greens = hex(['#4fb848', '#3fa64a', '#62c454', '#2f8f46'])
    const jungleGreens = hex(['#2f8a3c', '#277a3a', '#3a9a44', '#1f6e35'])
    const fronds = hex(['#4cbf3e', '#3aa53c', '#62cf4a'])
    const trunkColor = new Color('#8a5a32')
    const nut = new Color('#6b4a1e')

    const palm = (x, y, z, s) => {
      const lean = new Euler((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
      root.compose(new Vector3(x, y - 0.1, z), new Quaternion().setFromEuler(lean), new Vector3(s, s, s))
      const h = 3.2 + rand() * 0.8
      push('trunk', root, at(zero, new Vector3(0.8, h, 0.8)), trunkColor)
      const green = pick(rand, fronds)
      for (let i = 0; i < 7; i++) {
        const yaw = (i / 7) * Math.PI * 2 + rand() * 0.3
        push('frond', root, at(new Vector3(0, h, 0), one, e.set(0.35 + rand() * 0.35, yaw, 0, 'YXZ')), green)
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        push('coconut', root, at(new Vector3(Math.cos(a) * 0.2, h - 0.2, Math.sin(a) * 0.2)), nut)
      }
    }
    const broadleaf = (x, y, z, s, palette) => {
      place(x, y - 0.1, z, s)
      const green = pick(rand, palette)
      push('trunk', root, at(zero, new Vector3(1.1, 1.6, 1.1)), trunkColor)
      push('crown', root, at(new Vector3(0, 2.2, 0), new Vector3(1.25, 1.05, 1.25)), green)
      push('crown', root, at(new Vector3(0.5, 2.9, 0.2), new Vector3(0.8, 0.75, 0.8)), green)
    }

    // Trees: thin out over the meadow, thicken and darken in the jungle
    for (let tries = 0, placed = 0; tries < 7000 && placed < 260; tries++) {
      const [x, z] = scatter(150)
      const y = groundAt(x, z)
      if (y < 0.5 || y > 8.5) continue
      if (Math.abs(z + 13) < 4.5) continue // keep the gorge clear
      if (trailDistance2(x, z) < 3.2 ** 2) continue
      if (rand() < meadowAt(x, z) * 0.9) continue
      if (!isClear(x, z, 1.2)) continue
      const jungle = jungleAt(x, z)
      const s = 0.75 + rand() * 0.55 + jungle * 0.35
      if (jungle < 0.5 && (y < 3 || rand() < 0.3)) palm(x, y, z, s)
      else broadleaf(x, y, z, s, jungle > 0.5 ? jungleGreens : greens)
      placed++
    }

    // Undergrowth: bushes and pink spiky plants; ferns and mushrooms in the jungle
    const pinks = hex(['#d6407f', '#e85a9a', '#b8306c'])
    const fernGreens = hex(['#3aa246', '#2e8f3e', '#4cb552'])
    const caps = hex(['#d93a2f', '#e8a13a', '#f0e6d6'])
    const stemColor = new Color('#f2eadb')
    for (let i = 0, tries = 0; i < 420 && tries < 9000; tries++) {
      const [x, z] = scatter(150)
      const y = groundAt(x, z)
      if (y < 0.7 || y > 11) continue
      if (trailDistance2(x, z) < 2 ** 2) continue
      if (!isClear(x, z, 0.4)) continue
      const jungle = jungleAt(x, z)
      if (meadowAt(x, z) > 0.5) continue // the meadow gets its own grass and flowers
      const s = 0.4 + rand() * 0.5
      place(x, y, z, s)
      const r = rand()
      if (jungle > 0.3 && r < 0.45) {
        // A fern: a ring of arching leaves
        const green = pick(rand, fernGreens)
        for (let k = 0; k < 7; k++) {
          push('fern', root, at(zero, new Vector3(1.6, 1.6, 1.6), e.set(-0.5 - rand() * 0.4, (k / 7) * Math.PI * 2, 0, 'YXZ')), green)
        }
      } else if (jungle > 0.3 && r < 0.6) {
        // A little cluster of mushrooms
        const cap = pick(rand, caps)
        for (let k = 0; k < 3; k++) {
          const off = new Vector3((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8)
          const sc = new Vector3().setScalar(1.4 + rand() * 1.2)
          push('capStem', root, at(off, sc), stemColor)
          push('cap', root, at(off, sc), cap)
        }
      } else if (r < 0.8) {
        const pink = pick(rand, pinks)
        for (let k = 0; k < 5; k++) {
          push('spike', root, at(zero, one, e.set(0.45 + rand() * 0.25, (k / 5) * Math.PI * 2, 0, 'YXZ')), pink)
        }
      } else {
        push('bush', root, at(new Vector3(0, 0.35, 0), new Vector3(1.2, 0.8, 1.2)), pick(rand, jungle > 0.5 ? jungleGreens : greens))
      }
      i++
    }

    // Grass tufts: thick in the meadow, sparse elsewhere on the grass
    const bladeGreens = hex(['#6cc94e', '#82d65a', '#58b847', '#9ad864'])
    const tuft = (x, y, z, s) => {
      place(x, y - 0.05, z, s)
      const green = pick(rand, bladeGreens)
      for (let k = 0; k < 4; k++) {
        const lean = new Euler((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6)
        push('blade', root, at(new Vector3((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3), new Vector3(1, 0.7 + rand() * 0.6, 1), lean), green)
      }
    }
    // Flowers: a stem and a bloom
    const blooms = hex(['#ffd23f', '#ffffff', '#ff8fb1', '#b07cff', '#ff7a2f', '#5fb8ff'])
    const stemGreen = new Color('#4fae45')
    const flower = (x, y, z) => {
      place(x, y - 0.05, z, 0.9 + rand() * 0.5)
      push('stem', root, at(zero), stemGreen)
      push('bloom', root, at(zero), pick(rand, blooms))
    }
    for (let i = 0, tries = 0; i < 900 && tries < 12000; tries++) {
      const [x, z] = scatter(150)
      const y = groundAt(x, z)
      if (y < 0.9 || y > 7 || slopeAt(x, z) > 0.8) continue
      if (trailDistance2(x, z) < 1.4 ** 2) continue
      if (!isClear(x, z, 0.2)) continue
      const meadow = meadowAt(x, z)
      if (rand() > 0.12 + meadow * 0.88) continue
      if (rand() < 0.22 + meadow * 0.15) flower(x, y, z)
      else tuft(x, y, z, 0.8 + rand() * 0.6)
      i++
    }

    // Bamboo grove: tall jointed canes with leaves near the top
    const canes = hex(['#8fbf3c', '#a3c94a', '#7aaa36'])
    const bambooLeaf = new Color('#5cb84a')
    for (let i = 0; i < 38; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * BAMBOO.radius
      const x = BAMBOO.x + Math.cos(a) * r
      const z = BAMBOO.z + Math.sin(a) * r
      if (trailDistance2(x, z) < 2.5 ** 2) continue
      if (BONUS_CRATES.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < 1.3 ** 2)) continue
      const y = groundAt(x, z)
      const lean = new Euler((rand() - 0.5) * 0.15, rand() * Math.PI * 2, (rand() - 0.5) * 0.15)
      root.compose(new Vector3(x, y - 0.1, z), new Quaternion().setFromEuler(lean), one)
      const h = 4.5 + rand() * 3
      const cane = pick(rand, canes)
      // Joints: stacked segments with a sliver of gap between them
      for (let top = 0; top < h; ) {
        const seg = 0.9 + rand() * 0.3
        push('bamboo', root, at(new Vector3(0, top, 0), new Vector3(1, seg - 0.04, 1)), cane)
        top += seg
      }
      for (let k = 0; k < 5; k++) {
        push('bambooLeaf', root, at(new Vector3(0, h * (0.7 + rand() * 0.3), 0), one, e.set(0.5 + rand() * 0.6, rand() * Math.PI * 2, 0, 'YXZ')), bambooLeaf)
      }
    }

    // Beach finds: shells, starfish and driftwood on the sand
    const shells = hex(['#fbe3d0', '#f6c7b8', '#fff3e0', '#e8b8d8'])
    const stars = hex(['#ff7a5a', '#ff9a3d', '#f25f7a'])
    const drift = new Color('#c9b08a')
    for (let i = 0, tries = 0; i < 70 && tries < 6000; tries++) {
      const [x, z] = scatter(140)
      const y = groundAt(x, z)
      if (y < -0.15 || y > 0.8) continue
      if (!isClear(x, z, 0.5)) continue
      if (i < 10) {
        place(x, y + 0.1, z, 1)
        push('log', root, at(zero, new Vector3(1.6 + rand() * 1.4, 1, 1), e.set(0, 0, 0.05)), drift)
      } else if (i < 28) {
        place(x, y + 0.02, z, 0.9 + rand() * 0.6)
        push('starfish', root, at(zero), pick(rand, stars))
      } else {
        place(x, y, z, 0.8 + rand() * 0.8)
        push('shell', root, at(zero, one, e.set(0.4, 0, 0.2)), pick(rand, shells))
      }
      i++
    }

    // Rocks scattered about, and boulders on the lower slopes of the massif
    const stone = new Color('#9b9488')
    const boulderTones = hex(['#8f7a66', '#a08a72', '#7d6a58'])
    for (let i = 0, tries = 0; i < 80 && tries < 4000; tries++) {
      const [x, z] = scatter(120)
      const y = groundAt(x, z)
      if (y < 0.3) continue
      if (trailDistance2(x, z) < 2.4 ** 2) continue
      if (!isClear(x, z, 0.5)) continue
      const highland = y > 6
      if (!highland && i > 50) continue
      const s = highland ? 0.7 + rand() * 1.1 : 0.3 + rand() * 0.8
      q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3))
      root.compose(new Vector3(x, y - s * 0.2, z), q, new Vector3(s, s * 0.7, s))
      parts.rock.push({ matrix: root.clone(), color: highland ? pick(rand, boulderTones) : stone })
      i++
    }
    return parts
  }, [])
}

function Instanced({ part, items }) {
  const ref = useRef()
  const { geo, wind, shadow = true } = PARTS[part]
  const sway = useMemo(() => (wind ? windSway(wind) : null), [wind])
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
    <instancedMesh ref={ref} args={[geo, undefined, items.length]} castShadow={shadow} receiveShadow>
      <meshToonMaterial flatShading gradientMap={TOON_RAMP} {...sway} />
    </instancedMesh>
  )
}

export default function Vegetation() {
  const parts = useForest()
  useFrame((_, dt) => {
    if (!world.reducedMotion) WIND_TIME.value += Math.min(dt, 0.05)
  })
  return (
    <>
      {Object.entries(parts).map(([key, items]) => (items.length ? <Instanced key={key} part={key} items={items} /> : null))}
    </>
  )
}
