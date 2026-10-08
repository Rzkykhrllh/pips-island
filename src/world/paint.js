import { BufferAttribute, Color } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Merge several shapes into one geometry with each shape's colour baked into
// vertex colours: a little figure (a villager, a crab, a boat) becomes a
// single mesh, and many of them one InstancedMesh, one draw call.
//   painted([[geometry, '#hex'], ...])
export function painted(parts) {
  const c = new Color()
  return mergeGeometries(
    parts.map(([geo, color]) => {
      const g = geo.index ? geo.toNonIndexed() : geo
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
      c.set(color)
      const n = g.attributes.position.count
      const colors = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new BufferAttribute(colors, 3))
      if (!g.attributes.normal) g.computeVertexNormals()
      return g
    }),
  )
}
