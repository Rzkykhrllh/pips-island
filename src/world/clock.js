// One shared clock for shader animation (wind, cloud shadows), as a uniform
// object every patched material points at. Vegetation.jsx ticks it, and it
// stands still with reduced motion.
export const SCENE_TIME = { value: 0 }
