import * as THREE from 'three';

/** Static, code-authored surface ageing in metres; no UVs, textures or clock. */
export type TokyoWeathering = {
  setAmount: (amount: number) => void;
  dispose: () => void;
};

// Explicit architectural profiles keep shop lettering and neon untouched.
// Window emission shares its dirt mask with the glass, including warm panes.
const PROFILES: Readonly<Record<string, readonly [kind: number, strength: number]>> = {
  concrete: [0, 1],
  concrete_light: [0, 0.9],
  concrete_dark: [0, 0.65],
  metal: [1, 1],
  trim: [1, 0.55],
  shutter: [1, 0.85],
  street_detail: [1, 0.7],
  paint: [2, 1],
  tactile: [2, 0.6],
  enamel_cream: [1, 0.7],
  enamel_red: [1, 0.7],
  enamel_green: [1, 0.7],
  enamel_ochre: [1, 0.7],
  wood: [0, 0.65],
  cloth: [2, 0.35],
  cloth_red: [2, 0.35],
  glass: [3, 1],
  glass_lit: [3, 1],
  glass_warm: [3, 1],
  window_blind: [2, 0.55],
  window_board: [0, 0.8],
};

const VARYINGS = /* glsl */ `
varying vec3 vTokyoWeatherPosition;
varying vec3 vTokyoWeatherNormal;
`;

const SURFACE_FUNCTIONS = /* glsl */ `
uniform float uTokyoWeatherAmount;
uniform vec2 uTokyoWeatherProfile;
${VARYINGS}

// Integer PCG avoids the driver-dependent fract(sin(...)) hash. Lattice positions
// are signed before conversion to uint, so the two sides of the avenue differ.
uint twPcg(uint value) {
  uint state = value * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float twHash(ivec3 cell) {
  uvec3 p = uvec3(cell);
  uint h = twPcg(p.x * 1597334677u ^ p.y * 3812015801u ^ p.z * 958282347u ^ 1847u);
  return float(h >> 8u) * (1.0 / 16777216.0);
}

float twNoise(vec3 p) {
  ivec3 cell = ivec3(floor(p));
  vec3 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(twHash(cell), twHash(cell + ivec3(1, 0, 0)), f.x),
        mix(twHash(cell + ivec3(0, 1, 0)), twHash(cell + ivec3(1, 1, 0)), f.x), f.y),
    mix(mix(twHash(cell + ivec3(0, 0, 1)), twHash(cell + ivec3(1, 0, 1)), f.x),
        mix(twHash(cell + ivec3(0, 1, 1)), twHash(cell + ivec3(1, 1, 1)), f.x), f.y), f.z);
}

// Noise converges to its mean below the pixel footprint. Distant grain must not
// turn into moving glitter when the camera drifts or the reflection is rendered.
float twFilteredNoise(vec3 p) {
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  float resolved = 1.0 - smoothstep(0.22, 0.85, footprint);
  return mix(0.5, twNoise(p), resolved);
}

float twPanelJoint(vec2 p, vec2 size) {
  vec2 distanceToEdge = (0.5 - abs(fract(p / size) - 0.5)) * size;
  vec2 footprint = max(fwidth(p), vec2(0.001));
  vec2 coverage = (1.0 - smoothstep(vec2(0.008), vec2(0.008) + footprint, distanceToEdge))
    * min(vec2(1.0), vec2(0.016) / footprint);
  return max(coverage.x, coverage.y);
}

// Surface gradients perturb the existing view-space normal without requiring a
// UV tangent basis. The relief is millimetres, and vanishes exactly at amount 0.
vec3 twReliefNormal(vec3 position, vec3 surfaceNormal, float height) {
  vec3 dx = dFdx(position);
  vec3 dy = dFdy(position);
  vec3 r1 = cross(dy, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, dx);
  float determinant = dot(dx, r1);
  vec3 gradient = dFdx(height) * r1 + dFdy(height) * r2;
  return normalize(surfaceNormal - sign(determinant) * gradient / max(abs(determinant), 0.0000001));
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
float twHeight = 0.0;
float twGlassTransmission = 1.0;
if (uTokyoWeatherAmount > 0.0) {
  float amount = uTokyoWeatherAmount * uTokyoWeatherProfile.y;
  vec3 p = vTokyoWeatherPosition;
  vec3 surfaceAxis = abs(normalize(vTokyoWeatherNormal));
  float wall = 1.0 - smoothstep(0.15, 0.8, surfaceAxis.y);

  // Metre-scale wash, decimetre irregularity and millimetre aggregate use
  // independent offsets; nothing wraps at the edge of a texture tile.
  float wash = twFilteredNoise(p * vec3(0.36, 0.23, 0.31) + vec3(13.2, 4.8, 31.7));
  float mottling = twFilteredNoise(p * 2.7 + vec3(43.1, 19.6, 8.2));
  float grain = twFilteredNoise(p * 24.0 + vec3(5.9, 81.3, 2.8));
  vec3 streakDomain = p * vec3(5.8, 0.16, 5.8);
  streakDomain.xz += vec2(wash - 0.5, mottling - 0.5) * 0.35;
  float runoff = smoothstep(0.49, 0.77, twFilteredNoise(streakDomain + vec3(72.3, 1.1, 25.6)));
  runoff *= wall * (0.35 + 0.65 * wash);
  float dampBase = (1.0 - smoothstep(0.15, 2.8, p.y)) * (0.25 + 0.75 * wash);
  float grime = clamp(runoff * 0.62 + dampBase * 0.4 + smoothstep(0.59, 0.83, wash) * 0.27, 0.0, 1.0);
  vec3 originalColor = diffuseColor.rgb;

  if (uTokyoWeatherProfile.x < 0.5) {
    // Concrete formwork lines follow the face axes. Hash-shifted panel rows and
    // broken coverage keep the structural seams from becoming a wallpaper grid.
    vec3 weights = pow(surfaceAxis, vec3(8.0));
    weights /= max(dot(weights, vec3(1.0)), 0.0001);
    float rowShift = twHash(ivec3(int(floor(p.y / 2.55)), 23, 91)) * 1.2;
    float joints = twPanelJoint(p.zy + vec2(rowShift, 0.0), vec2(2.9, 2.55)) * weights.x
      + twPanelJoint(p.xz, vec2(1.8, 1.3)) * weights.y
      + twPanelJoint(p.xy + vec2(rowShift, 0.0), vec2(2.9, 2.55)) * weights.z;
    joints *= smoothstep(0.20, 0.50, mottling) * 0.65;
    // Old render exposes aggregate in irregular patches; pale mineral edges
    // and darker repairs read at street scale, before the fine grain resolves.
    float plaster = twFilteredNoise(p * 1.16 + vec3(9.4, 56.2, 13.1));
    float erosionField = plaster * 0.66 + mottling * 0.24 + grain * 0.10;
    float erosion = smoothstep(0.56, 0.70, erosionField);
    float flakeEdge = smoothstep(0.51, 0.57, erosionField) * (1.0 - erosion);
    float mineral = smoothstep(0.53, 0.72, wash) * (1.0 - grime);
    // Sparse, broken hairlines follow the wall; fwidth prevents distant shimmer.
    float fractureField = twFilteredNoise(p * vec3(1.7, 0.65, 1.7) + mottling * 0.42);
    float crackWidth = max(fwidth(fractureField), 0.002);
    float cracks = (1.0 - smoothstep(0.003, 0.003 + crackWidth, abs(fractureField - 0.53)))
      * smoothstep(0.58, 0.72, plaster) * wall;
    // Y=4n are the actual horizontal ledges in the Blender geometry.
    float belowLedge = 4.0 - mod(p.y, 4.0);
    float ledgeRunoff = exp(-belowLedge * 1.8) * runoff * wall;
    vec3 aged = originalColor * (0.68 + 0.58 * wash + (grain - 0.5) * 0.25);
    aged *= 1.0 - grime * 0.59 - joints * 0.32 - ledgeRunoff * 0.34 - cracks * 0.44;
    aged = mix(aged, originalColor * vec3(0.51, 0.48, 0.43), erosion * 0.62);
    aged += vec3(0.031, 0.030, 0.024) * (mineral * 0.35 + flakeEdge * 0.40);
    diffuseColor.rgb = mix(originalColor, aged, amount);
    roughnessFactor = clamp(roughnessFactor + amount * (0.08 * grime + (grain - 0.5) * 0.16), 0.45, 1.0);
    twHeight = ((mottling - 0.5) * 0.012 + (grain - 0.5) * 0.004
      - joints * 0.008 - erosion * 0.013 - cracks * 0.004) * amount;
  } else if (uTokyoWeatherProfile.x < 1.5) {
    // Oxidation sits in irregular islands with a smaller chipped edge. The
    // underlying metal stays visible; rust loses metalness and gains roughness.
    float patches = twFilteredNoise(p * 1.45 + vec3(17.7, 9.2, 64.8));
    float edge = twFilteredNoise(p * 14.0 + vec3(21.3, 43.6, 7.8));
    float corrosion = smoothstep(0.59, 0.76, patches * 0.78 + edge * 0.22 + dampBase * 0.06);
    float chipped = smoothstep(0.55, 0.68, patches) * smoothstep(0.57, 0.76, edge);
    vec3 rust = mix(vec3(0.068, 0.025, 0.012), vec3(0.19, 0.074, 0.028), mottling);
    vec3 aged = originalColor * (0.86 + 0.26 * wash - grime * 0.31);
    aged = mix(aged, originalColor * 1.38 + vec3(0.008), chipped * 0.35);
    aged = mix(aged, rust, corrosion * 0.8);
    diffuseColor.rgb = mix(originalColor, aged, amount);
    roughnessFactor = clamp(roughnessFactor + amount * (corrosion * 0.35 + grime * 0.12 + (grain - 0.5) * 0.09), 0.25, 1.0);
    metalnessFactor *= 1.0 - corrosion * amount * 0.9;
    twHeight = ((grain - 0.5) * 0.0008 + corrosion * 0.002 - chipped * 0.001) * amount;
  } else if (uTokyoWeatherProfile.x < 2.5) {
    // Road paint and tactile strips retain their shape and alpha: dark chips
    // expose a substrate colour rather than opening holes in the mesh.
    float chipField = twFilteredNoise(p * 11.5 + vec3(5.4, 72.6, 91.7));
    float chips = smoothstep(0.58, 0.74, chipField * 0.7 + wash * 0.3);
    vec3 aged = originalColor * (0.74 + 0.29 * mottling - grime * 0.16);
    aged = mix(aged, vec3(0.025, 0.035, 0.041), chips * 0.75);
    diffuseColor.rgb = mix(originalColor, aged, amount);
    roughnessFactor = mix(roughnessFactor, 0.95, amount * 0.45);
    twHeight = -chips * 0.001 * amount;
  } else {
    // The pane itself remains opaque, as authored. Static water trails, dust and
    // uneven interior light replace the uniform cyan/amber rectangles without
    // adding transparent sorting artifacts or a second reflective surface.
    float trails = twFilteredNoise(p * vec3(19.0, 0.85, 19.0) + vec3(81.4, 4.9, 17.2));
    float residue = smoothstep(0.45, 0.72, trails) * (0.35 + 0.65 * wash);
    float haze = twFilteredNoise(p * vec3(2.8, 1.8, 2.8) + vec3(31.2, 12.9, 43.7));
    float roomShade = twFilteredNoise(p * vec3(1.2, 0.55, 1.2) + vec3(2.7, 8.1, 5.3));
    vec3 aged = originalColor * (0.49 + roomShade * 0.56);
    aged = mix(aged, originalColor * vec3(0.58, 0.65, 0.60), residue * 0.50);
    aged += vec3(0.010, 0.012, 0.011) * smoothstep(0.56, 0.78, haze);
    diffuseColor.rgb = mix(originalColor, aged, amount);
    roughnessFactor = clamp(roughnessFactor + amount * (residue * 0.30 + haze * 0.13), 0.16, 0.75);
    twGlassTransmission = mix(1.0, 0.36 + roomShade * 0.53 - residue * 0.14, amount);
    twHeight = (trails - 0.5) * 0.0005 * amount;
  }
}
`;

const replaceChunk = (source: string, chunk: string, replacement: string): string => {
  if (!source.includes(chunk) || source.indexOf(chunk) !== source.lastIndexOf(chunk)) {
    throw new Error(`Tokyo weathering requires exactly one ${chunk} shader chunk.`);
  }
  return source.replace(chunk, replacement);
};

/**
 * Apply once after GLTFLoader resolves, then call setAmount before each draw.
 * Coordinates are world metres (Y up), so adjacent material batches share stains
 * and the planar reflection sees exactly the same surface. This static GLB has
 * no skinning or instancing. dispose restores hooks; it never disposes the GLB.
 */
export const applyTokyoWeathering = (root: THREE.Object3D): TokyoWeathering => {
  const amount = {value: 1};
  const seen = new Set<THREE.MeshStandardMaterial>();
  const restore: (() => void)[] = [];
  let disposed = false;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) continue;
      seen.add(material);
      const profile = PROFILES[material.name];
      if (!profile || (profile[0] !== 3 && material.emissiveIntensity > 0 && material.emissive.getHex() !== 0)) continue;

      const previousCompile = material.onBeforeCompile;
      const previousCacheKey = material.customProgramCacheKey;
      const baseKey = previousCacheKey.call(material);
      const profileUniform = {value: new THREE.Vector2(...profile)};
      const compile: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.uniforms.uTokyoWeatherAmount = amount;
        shader.uniforms.uTokyoWeatherProfile = profileUniform;
        shader.vertexShader = replaceChunk(shader.vertexShader, '#include <common>', `#include <common>\n${VARYINGS}`);
        shader.vertexShader = replaceChunk(shader.vertexShader, '#include <project_vertex>', `#include <project_vertex>
          vTokyoWeatherPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTokyoWeatherNormal = inverseTransformDirection(transformedNormal, viewMatrix);`);
        shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <common>', `#include <common>\n${SURFACE_FUNCTIONS}`);
        shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${SURFACE_FRAGMENT}`);
        shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (uTokyoWeatherAmount > 0.0) normal = twReliefNormal(-vViewPosition, normal, twHeight);`);
        shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance *= twGlassTransmission;`);
      };
      const cacheKey = () => `${baseKey}|tokyo-weathering-v2`;
      material.onBeforeCompile = compile;
      material.customProgramCacheKey = cacheKey;
      material.needsUpdate = true;
      restore.push(() => {
        if (material.onBeforeCompile === compile) material.onBeforeCompile = previousCompile;
        if (material.customProgramCacheKey === cacheKey) material.customProgramCacheKey = previousCacheKey;
        material.needsUpdate = true;
      });
    }
  });

  return {
    setAmount(value) {
      if (!disposed) amount.value = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      restore.forEach((release) => release());
      restore.length = 0;
      seen.clear();
    },
  };
};
