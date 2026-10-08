import { SCENE_TIME } from './clock'

// Cloud shadows: soft dark patches drifting slowly over the land, the sea and
// everything growing on it. Pure shader work (a few sines per pixel), no extra
// geometry or draw calls. Runs on the shared scene clock (clock.js).

const CLOUD_GLSL = `
  uniform float uCloudTime;
  varying vec2 vCloudXZ;
  float cloudShade(vec2 p) {
    float t = uCloudTime;
    float n = sin(p.x * 0.07 + t * 0.12) * sin(p.y * 0.08 - t * 0.09)
            + 0.55 * sin((p.x + p.y) * 0.11 + t * 0.18)
            + 0.3 * sin(p.x * 0.19 - p.y * 0.16 - t * 0.23);
    return smoothstep(0.45, 0.85, n);
  }`

// Patch a material's shader. Call from onBeforeCompile, after any other
// patching of the same shader.
export function addCloudShade(shader) {
  shader.uniforms.uCloudTime = SCENE_TIME
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
    .replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
      #ifdef USE_INSTANCING
        vCloudXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
      #else
        vCloudXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
      #endif`,
    )
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${CLOUD_GLSL}`)
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.26 * cloudShade(vCloudXZ);')
}

// Props for a plain material that only needs the cloud shadows
export const cloudShaded = {
  onBeforeCompile: addCloudShade,
  customProgramCacheKey: () => 'cloud',
}
