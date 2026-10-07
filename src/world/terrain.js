// Pure height function for the island. Everything (terrain mesh, trees, Pip's feet)
// samples this, so tweaking the island shape here keeps the whole scene in sync.

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export const ISLAND = {
  size: 170, // terrain plane width/depth
  shore: { inner: 40, outer: 62 }, // land fades into the sea between these radii
  peak: { x: 0, z: -42, height: 22, sigma: 13 },
  gorge: { z: -13, depth: 8, width: 2.5 }, // the river canyon the rope bridge crosses
  waterLevel: -0.2,
}

export function heightAt(x, z) {
  const { shore, peak, gorge } = ISLAND
  const d = Math.hypot(x, z)
  const base = (1 - smoothstep(shore.inner, shore.outer, d)) * 5 - 2

  const dx = x - peak.x
  const dz = z - peak.z
  const mountain = peak.height * Math.exp(-(dx * dx + dz * dz) / (2 * peak.sigma ** 2))

  const g = z - gorge.z
  const canyon = gorge.depth * Math.exp(-(g * g) / (2 * gorge.width ** 2))

  const hills = 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.25) + 0.3 * Math.sin(x * 0.7 + z * 0.5)

  return base + mountain - canyon + hills * (base > 0 ? 1 : 0.3)
}

// Rough steepness, used to paint cliffs and canyon walls as rock.
export function slopeAt(x, z) {
  const e = 0.6
  const hx = heightAt(x + e, z) - heightAt(x - e, z)
  const hz = heightAt(x, z + e) - heightAt(x, z - e)
  return Math.hypot(hx, hz) / (2 * e)
}

export { smoothstep }
