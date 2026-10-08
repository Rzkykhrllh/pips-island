import { useLayoutEffect, useRef, useState } from 'react'
import { BufferAttribute, Color, Matrix4 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TOON_RAMP } from './toon'

// Renders its (static) children once, then folds every mesh in them into a
// single flat-shaded mesh with the material colours baked into vertex colours.
// Write props as ordinary JSX, pay for one draw call instead of dozens.
// Only for things that never move and use plain coloured materials.
export default function Baked({ children, castShadow = true, receiveShadow = true }) {
  const group = useRef()
  const [geometry, setGeometry] = useState(null)

  useLayoutEffect(() => {
    const root = group.current
    root.updateWorldMatrix(true, true)
    const toLocal = new Matrix4().copy(root.matrixWorld).invert()
    const m = new Matrix4()
    const c = new Color()
    const parts = []
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      for (const name of Object.keys(src.attributes)) if (name !== 'position') src.deleteAttribute(name)
      src.applyMatrix4(m.multiplyMatrices(toLocal, o.matrixWorld))
      c.copy(o.material.color ?? c.set('#ffffff'))
      const n = src.attributes.position.count
      const colors = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3)
      src.setAttribute('color', new BufferAttribute(colors, 3))
      parts.push(src)
    })
    const merged = mergeGeometries(parts)
    merged.computeVertexNormals()
    merged.computeBoundingSphere()
    setGeometry(merged)
    return () => merged.dispose()
  }, [])

  if (geometry) {
    return (
      <mesh geometry={geometry} castShadow={castShadow} receiveShadow={receiveShadow}>
        <meshToonMaterial vertexColors flatShading gradientMap={TOON_RAMP} />
      </mesh>
    )
  }
  return <group ref={group}>{children}</group>
}
