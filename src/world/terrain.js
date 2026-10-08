// Pure height function for the island. Everything (terrain mesh, trees, the
// runner's feet, the water and lava ribbons) samples this, so tweaking the
// island shape here keeps the whole scene in sync.
//
// The look is a classic platformer world map: a ragged sandy rim, jungle
// lowlands, a river gorge, a village on the east point and a big rock massif
// at the back. The massif here is a smooth, walkable mound; the jagged spires
// on top of it are separate meshes (see Landmarks.jsx), so the trail never has
// to climb a spike.

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export const ISLAND = {
  size: 200, // terrain plane width/depth
  shore: { inner: 33, falloff: 17 }, // land fades into the sea over `falloff` past the (wobbly) shore radius
  mound: { x: 0, z: -34, height: 15, sigma: 11 },
  gorge: { z: -13, depth: 8, width: 2.5 }, // the river gorge the rope bridge crosses
  village: { x: 40, z: 5 },
  pond: { x: 21, z: 27, radius: 4.5, depth: 1.4 }, // a freshwater pond in the east meadow
  waterLevel: -0.2,
}

// Zones that change what grows and how the ground looks
export const ZONES = {
  meadow: { x: 22, z: 26, radius: 13 }, // open grass, flowers and the pond, east of the trail
  jungle: { x: -22, z: 22, radius: 20 }, // dense, dark jungle floor in the west
}
// 1 in the middle of a zone, fading to 0 over its outer third
export function zoneWeight(zone, x, z) {
  const d = Math.hypot(x - zone.x, z - zone.z) / zone.radius
  return 1 - smoothstep(0.65, 1, d)
}

// Ground-hugging flows, control points in x/z (Landmarks.jsx draws them).
// Each one carves a shallow channel so the water and lava sit in a groove.
export const WATERFALL = [
  [-5.5, -27.5],
  [-6, -23.5],
  [-6.6, -19.5],
  [-7, -15.6],
]
export const LAVA = [
  [-14, -38],
  [-19, -34.5],
  [-25, -31.5],
  [-32, -28],
  [-39, -25],
  [-47, -22.5],
]

// Distance squared from (x, z) to a polyline, Infinity outside its padded bounds
function polylineDist2(points, x, z, pad) {
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]
    const [bx, bz] = points[i + 1]
    if (x < Math.min(ax, bx) - pad || x > Math.max(ax, bx) + pad) continue
    if (z < Math.min(az, bz) - pad || z > Math.max(az, bz) + pad) continue
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    best = Math.min(best, (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2)
  }
  return best
}
const channel = (points, x, z, depth, width) => {
  const d2 = polylineDist2(points, x, z, width * 3)
  return d2 === Infinity ? 0 : depth * Math.exp(-d2 / (2 * width * width))
}

// Shortest signed difference between two angles
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const bump = (a, at, width, amount) => amount * Math.exp(-(angleDiff(a, at) ** 2) / (2 * width * width))

// Shore radius by direction: a ragged coastline with a beach tongue toward the
// camera (south, +z), the village point to the east and a lava shelf to the west.
export function shoreRadius(a) {
  return (
    ISLAND.shore.inner +
    3.5 * Math.sin(3 * a + 0.6) +
    2.2 * Math.sin(5 * a + 2.1) +
    1.3 * Math.sin(9 * a + 0.4) +
    bump(a, Math.PI / 2, 0.32, 13) + // beach tongue where the trail starts
    bump(a, 0.12, 0.3, 15) + // village point
    bump(a, Math.PI - 0.45, 0.35, 8) // lava shelf
  )
}

export function heightAt(x, z) {
  const { shore, mound, gorge } = ISLAND
  const d = Math.hypot(x, z)
  const r = shoreRadius(Math.atan2(z, x))
  const land = 1 - smoothstep(r, r + shore.falloff, d)
  const base = land * 5 - 2

  const dx = x - mound.x
  const dz = z - mound.z
  const massif = mound.height * Math.exp(-(dx * dx + dz * dz) / (2 * mound.sigma ** 2))

  const g = z - gorge.z
  const canyon = gorge.depth * Math.exp(-(g * g) / (2 * gorge.width ** 2))

  const hills = 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.25) + 0.3 * Math.sin(x * 0.7 + z * 0.5)

  const grooves = base > 0 ? channel(WATERFALL, x, z, 0.9, 0.9) + channel(LAVA, x, z, 0.6, 1) : 0

  // The pond: a bowl with a flat-ish bottom
  const { pond } = ISLAND
  const pd = Math.hypot(x - pond.x, z - pond.z) / pond.radius
  const bowl = pd < 1.6 ? pond.depth * (1 - smoothstep(0.55, 1.35, pd)) : 0

  return base + massif - canyon - grooves - bowl + hills * (base > 0 ? 1 : 0.3)
}

// The terrain mesh is a grid of flat triangles sampled from heightAt, so
// between grid points the drawn ground can sit above or below the formula.
// The grid heights are computed once and cached; groundAt gives the height of
// the surface as actually drawn: it finds the grid cell and the triangle
// within it (split the way PlaneGeometry splits it) and interpolates its
// corners. It's also far cheaper than heightAt, so placement code uses it.
export const TERRAIN_SEGMENTS = 140
const CELL = ISLAND.size / TERRAIN_SEGMENTS
const HALF = ISLAND.size / 2
const ROW = TERRAIN_SEGMENTS + 1
let grid = null
// Height at grid point (ix, iz); world x = ix * CELL - HALF, z = iz * CELL - HALF
export function gridHeight(ix, iz) {
  if (!grid) {
    grid = new Float32Array(ROW * ROW)
    for (let j = 0; j < ROW; j++) for (let i = 0; i < ROW; i++) grid[j * ROW + i] = heightAt(i * CELL - HALF, j * CELL - HALF)
  }
  return grid[iz * ROW + ix]
}
export function groundAt(x, z) {
  const gx = (x + HALF) / CELL
  const gz = (z + HALF) / CELL
  const ix = Math.floor(gx)
  const iz = Math.floor(gz)
  if (ix < 0 || iz < 0 || ix >= TERRAIN_SEGMENTS || iz >= TERRAIN_SEGMENTS) return heightAt(x, z)
  const u = gx - ix
  const v = gz - iz
  const hb = gridHeight(ix, iz + 1)
  const hd = gridHeight(ix + 1, iz)
  if (u + v <= 1) {
    const ha = gridHeight(ix, iz)
    return ha + (hd - ha) * u + (hb - ha) * v
  }
  const hc = gridHeight(ix + 1, iz + 1)
  return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v)
}

// Rough steepness, used to paint cliffs and canyon walls as rock.
export function slopeAt(x, z) {
  const e = 0.7
  const hx = groundAt(x + e, z) - groundAt(x - e, z)
  const hz = groundAt(x, z + e) - groundAt(x, z - e)
  return Math.hypot(hx, hz) / (2 * e)
}

export { smoothstep }
