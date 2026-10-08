import { useMemo } from 'react'
import { CatmullRomCurve3, Object3D, TubeGeometry, Vector3 } from 'three'
import { BRIDGE, bridgeDeckPoint } from './track'
import { TOON_RAMP } from './toon'
import Baked from './Baked'

const PLANKS = 20

export default function Bridge() {
  const { planks, ropes, posts } = useMemo(() => {
    const dummy = new Object3D()
    const planks = []
    for (let i = 0; i <= PLANKS; i++) {
      const t = i / PLANKS
      const p = bridgeDeckPoint(t)
      const next = bridgeDeckPoint(Math.min(1, t + 0.02))
      const prev = bridgeDeckPoint(Math.max(0, t - 0.02))
      dummy.position.copy(p).add(new Vector3(0, -0.07, 0))
      dummy.lookAt(dummy.position.clone().add(next.sub(prev)))
      dummy.rotateZ(((i * 37) % 7) * 0.012 - 0.03) // a little wobble
      planks.push({ position: dummy.position.clone(), rotation: dummy.rotation.clone() })
    }

    const ropes = [-1, 1].map((side) => {
      const pts = []
      for (let i = 0; i <= 16; i++) {
        const p = bridgeDeckPoint(i / 16)
        p.x += side * BRIDGE.width * 0.5
        p.y += 0.85 - Math.sin((Math.PI * i) / 16) * 0.25
        pts.push(p)
      }
      return new TubeGeometry(new CatmullRomCurve3(pts), 48, 0.045, 5)
    })

    const posts = []
    for (const t of [0, 1]) {
      for (const side of [-1, 1]) {
        const p = bridgeDeckPoint(t)
        posts.push(new Vector3(p.x + side * BRIDGE.width * 0.5, p.y + 0.35, p.z))
      }
    }
    return { planks, ropes, posts }
  }, [])

  return (
    <Baked>
      {planks.map((pl, i) => (
        <mesh key={i} position={pl.position} rotation={pl.rotation} castShadow receiveShadow>
          <boxGeometry args={[BRIDGE.width, 0.12, 0.38]} />
          <meshToonMaterial color={i % 3 ? '#b07a42' : '#9c6a37'} flatShading gradientMap={TOON_RAMP} />
        </mesh>
      ))}
      {ropes.map((geo, i) => (
        <mesh key={i} geometry={geo} castShadow>
          <meshToonMaterial color="#7a5230" gradientMap={TOON_RAMP} />
        </mesh>
      ))}
      {posts.map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <cylinderGeometry args={[0.1, 0.13, 1.6, 6]} />
          <meshToonMaterial color="#6e4526" flatShading gradientMap={TOON_RAMP} />
        </mesh>
      ))}
    </Baked>
  )
}
