import * as THREE from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';

// Integer hashing keeps procedural detail stable on ANGLE and software WebGL.
export const tokyoSurfaceNoise = /* glsl */ `
uint tokyoHash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float tokyoRandom(vec2 p) {
  uvec2 q = uvec2(ivec2(p));
  return float(tokyoHash(q.x ^ tokyoHash(q.y + 1973u))) / 4294967295.0;
}
float tokyoNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tokyoRandom(cell), tokyoRandom(cell + vec2(1, 0)), f.x),
    mix(tokyoRandom(cell + vec2(0, 1)), tokyoRandom(cell + vec2(1, 1)), f.x), f.y);
}
float tokyoFbm(vec2 p) {
  return tokyoNoise(p) * 0.57 + tokyoNoise(p * 2.07 + 31.2) * 0.28
    + tokyoNoise(p * 4.13 + 73.1) * 0.15;
}
`;

// Both the reflection and rain contacts use the same world-space standing water.
export const tokyoPuddleMask = /* glsl */ `
float tokyoPuddle(vec2 p) {
  return smoothstep(0.35, 0.68, tokyoFbm(p * vec2(0.8, 0.38)));
}
`;
const noise = tokyoSurfaceNoise;

/** Standing water occupies irregular patches, with rough asphalt between them. */
export const wetRoadShader = {
  uniforms: {
    color: {value: new THREE.Color('#111A23')}, tDiffuse: {value: null},
    textureMatrix: {value: new THREE.Matrix4()}, phase: {value: 0}, weathering: {value: 0.85},
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 reflectionUv;
    varying vec3 worldPosition;
    void main() {
      reflectionUv = textureMatrix * vec4(position, 1.0);
      worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float phase;
    uniform float weathering;
    varying vec4 reflectionUv;
    varying vec3 worldPosition;
    ${noise}
    ${tokyoPuddleMask}
    void main() {
      vec2 p = worldPosition.xz;
      vec2 uv = reflectionUv.xy / reflectionUv.w;
      float ripple = sin(p.y * 17.0 + sin(p.x * 2.0) + phase * 4.0);
      float fine = sin(p.y * 44.0 - phase * 6.0) * sin(p.x * 31.0 + phase * 2.0);
      uv += vec2(ripple * 0.0008, fine * 0.00035);
      float pool = tokyoPuddle(p);
      vec2 blur = vec2(0.001, 0.0028) * mix(2.4, 0.65, pool);
      vec3 reflection = texture2D(tDiffuse, uv).rgb * 0.4;
      reflection += texture2D(tDiffuse, uv + blur).rgb * 0.3;
      reflection += texture2D(tDiffuse, uv - blur).rgb * 0.3;
      float stone = tokyoNoise(p * 73.0);
      float grit = (stone - 0.5) * (1.0 - smoothstep(0.3, 2.0, length(fwidth(p * 73.0))));
      float patches = tokyoFbm(p * 1.4);
      float fracture = 1.0 - smoothstep(0.013, 0.045, abs(tokyoFbm(p * 2.1) - 0.48));
      float track = exp(-pow((abs(p.x) - 2.4) * 2.8, 2.0));
      vec3 asphalt = vec3(0.018, 0.025, 0.031) * (0.6 + patches * 0.95);
      asphalt += grit * 0.012 * weathering;
      asphalt *= 1.0 - (fracture * 0.48 + track * 0.15) * weathering;
      float wetness = mix(0.44, 0.14 + pool * 0.53, weathering);
      gl_FragColor = vec4(mix(asphalt, reflection, wetness), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

/** Depth-tested sheets of low mist: buildings occlude it and near facades remain crisp. */
export const createTokyoFog = (scene: THREE.Scene) => {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const sheets = [-18, -37, -64, -96].map((z, index) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {phase: {value: 0}, amount: {value: 1}, layer: {value: index}},
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 fogUv;
        void main() {
          fogUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float phase, amount, layer;
        varying vec2 fogUv;
        ${noise}
        void main() {
          vec2 drift = vec2(cos(phase + layer), sin(phase + layer)) * 0.38;
          vec2 p = fogUv * vec2(5.8, 2.8) + vec2(layer * 11.3, layer * 3.7);
          float cloud = tokyoFbm(p + drift + tokyoFbm(p * 0.6));
          float vertical = smoothstep(0.0, 0.12, fogUv.y) * (1.0 - smoothstep(0.28, 1.0, fogUv.y));
          float sides = smoothstep(0.0, 0.13, fogUv.x) * (1.0 - smoothstep(0.87, 1.0, fogUv.x));
          float alpha = smoothstep(0.18, 0.8, cloud) * vertical * sides * amount * 0.34;
          vec3 tint = mix(vec3(0.13, 0.29, 0.34), vec3(0.38, 0.24, 0.21), fogUv.x * 0.55);
          gl_FragColor = vec4(tint, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 3.0 + index * 0.7, z);
    mesh.scale.set(27 + index * 4, 7 + index * 2, 1);
    scene.add(mesh);
    return mesh;
  });
  return {
    draw: (phase: number, amount: number) => {
      sheets.forEach(({material}) => {
        material.uniforms.phase!.value = phase;
        material.uniforms.amount!.value = amount;
      });
    },
  };
};

/** Output-referred film treatment, after tone mapping. Grain has no history or clock. */
export const createTokyoFilmPass = (width: number, height: number) => new ShaderPass({
  uniforms: {
    tDiffuse: {value: null}, resolution: {value: new THREE.Vector2(width, height)},
    phase: {value: 0}, amount: {value: 0.7}, grain: {value: 0.4},
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);}
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float phase, amount, grain;
    varying vec2 vUv;
    ${noise}
    // A small optical bleed from bright sources, with no temporal accumulation.
    vec3 highlightScatter(vec2 offset) {
      vec3 light = texture2D(tDiffuse, vUv + offset / resolution).rgb;
      return light * smoothstep(0.68, 0.98, max(light.r, max(light.g, light.b)));
    }
    void main() {
      vec2 centered = vUv - 0.5;
      float edge = dot(centered, centered) * 2.0;
      vec2 fringe = centered * edge * amount * 1.5 / resolution;
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      color.r = texture2D(tDiffuse, vUv + fringe).r;
      color.b = texture2D(tDiffuse, vUv - fringe).b;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec3 graded = mix(vec3(luma), color, 1.09);
      graded = (graded - 0.18) * 1.14 + 0.18;
      graded += vec3(-0.009, 0.008, 0.019) * (1.0 - smoothstep(0.05, 0.65, luma));
      graded += vec3(0.026, 0.008, -0.014) * smoothstep(0.35, 0.9, luma);
      color = mix(color, graded, amount);
      vec3 scatter = highlightScatter(vec2(3.5, 0.0)) + highlightScatter(vec2(-3.5, 0.0))
        + highlightScatter(vec2(0.0, 3.5)) + highlightScatter(vec2(0.0, -3.5));
      color += scatter * vec3(1.08, 0.91, 0.85) * 0.016 * amount * (1.0 - luma);
      color *= 1.0 - smoothstep(0.15, 0.76, length(centered)) * 0.28 * amount;
      vec2 pixel = floor(vUv * resolution);
      float a = tokyoRandom(pixel) - 0.5;
      float b = tokyoRandom(pixel + 419.0) - 0.5;
      float film = a * cos(phase * 12.0) + b * sin(phase * 12.0);
      color += film * grain * 0.047 * (0.65 + 0.35 * (1.0 - luma));
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
});
