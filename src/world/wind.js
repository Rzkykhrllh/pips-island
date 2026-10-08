// Wind for anything that grows: a sway added in world space after each
// instance is placed, so every part of one plant leans the same way and
// neighbouring plants move a little out of step. One shared clock drives it
// (Vegetation.jsx ticks WIND_TIME).
//
// windSway({ base, perHeight, flutter }) returns props for a material on an
// InstancedMesh: { onBeforeCompile, customProgramCacheKey }.
// How far a vertex moves = base + perHeight * (its height above its
// instance's origin): trunks bend from the ground up (base 0), crowns and
// fronds ride along at the top of the trunk (a fixed base).

export const WIND_TIME = { value: 0 }

export function windSway({ base = 0, perHeight = 0, flutter = 0 }) {
  // The tuning goes in as uniforms, not baked into the source, so every
  // swaying material shares one compiled program
  const onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND_TIME
    shader.uniforms.uWind = { value: [base, perHeight, flutter] }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform vec3 uWind;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 windOrigin = instanceMatrix[3].xyz;
        #else
          vec3 windOrigin = vec3(0.0);
        #endif
        float windAmount = uWind.x + uWind.y * max(0.0, mvPosition.y - windOrigin.y);
        float windPhase = uWindTime * 1.6 + windOrigin.x * 0.15 + windOrigin.z * 0.11;
        // A steady lean plus gusts, mostly along one direction
        float gust = sin(windPhase) * 0.7 + sin(windPhase * 2.3 + 1.7) * 0.3;
        mvPosition.x += (0.35 + gust) * windAmount;
        mvPosition.z += (0.15 + gust * 0.5) * windAmount;
        mvPosition.y += sin(uWindTime * 7.0 + windOrigin.x + position.z * 2.0) * uWind.z;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      )
  }
  return { onBeforeCompile, customProgramCacheKey: () => 'wind' }
}
