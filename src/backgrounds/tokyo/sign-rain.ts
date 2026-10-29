import * as THREE from 'three';
import {createSeededRandom, TAU} from '../../loop';

type SignSurface = {width: number; height: number; color: string};
export type TokyoSignDrop = {
  x: number; y: number; bottom: number; radius: number;
  offset: number; turns: number; detaches: boolean;
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** Side margins keep the actual lettering clear, independent of sign aspect ratio. */
export const createTokyoSignDrops = (sign: SignSurface, seed: number): TokyoSignDrop[] => {
  const random = createSeededRandom(seed);
  return Array.from({length: 3}, (_, i) => ({
    x: (i % 2 ? -1 : 1) * sign.width * (0.425 + random() * 0.025),
    y: i === 2 ? -sign.height / 2 + 0.09 : sign.height * (0.28 - random() * 0.48),
    bottom: -sign.height / 2,
    radius: 0.009 + random() * 0.006,
    offset: random(),
    turns: i === 2 ? 1 : 2,
    detaches: i === 2,
  }));
};

/** Slow surface runoff transfers its velocity to gravity at the lower rim. */
export const getTokyoSignDropState = (drop: TokyoSignDrop, phase: number) => {
  const cycle = phase / TAU * drop.turns + drop.offset;
  const progress = cycle - Math.floor(cycle);
  const period = 12 / drop.turns;
  const time = progress * period;
  const release = period * 0.66;
  const distance = drop.y - drop.bottom;
  const releaseSpeed = 2 * distance / release;
  const falling = Math.max(0, time - release);
  const surfaceTime = Math.min(time, release);
  const y = drop.detaches
    ? drop.y - distance * (surfaceTime / release) ** 2 - releaseSpeed * falling - 4.905 * falling ** 2
    : drop.y - progress * 0.055;
  const speed = drop.detaches ? 2 * distance * surfaceTime / release ** 2 + 9.81 * falling : 0.055 / period;
  const opacity = drop.detaches
    ? smooth(time / 0.28) * (1 - smooth((falling - 0.26) / 0.18))
    : Math.sin(progress * Math.PI) ** 2 * 0.6;
  return {x: drop.x, y, z: 0.014, width: drop.radius, height: drop.radius * 1.35 + speed / 240, opacity};
};

/** Local XY quads inherit their panel's real anchor and yaw; scene depth still occludes them. */
export const createTokyoSignRain = (panel: THREE.Object3D, sign: SignSurface, seed: number) => {
  const drops = createTokyoSignDrops(sign, seed);
  const centers = new Float32Array(drops.length * 3);
  const sizes = new Float32Array(drops.length * 2);
  const alphas = new Float32Array(drops.length);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setAttribute('dropCenter', new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('dropSize', new THREE.InstancedBufferAttribute(sizes, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('dropAlpha', new THREE.InstancedBufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = drops.length;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      amount: {value: 0}, fogDensity: {value: 0.011},
      tint: {value: new THREE.Color(sign.color).lerp(new THREE.Color('#b4c2c6'), 0.75)},
    },
    transparent: true, depthTest: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 dropCenter;
      attribute vec2 dropSize;
      attribute float dropAlpha;
      uniform float fogDensity;
      varying vec2 beadUv;
      varying float visibility;
      void main() {
        beadUv = position.xy;
        vec3 p = dropCenter + vec3(position.xy * dropSize, 0.0);
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        visibility = dropAlpha * exp(-fogDensity * fogDensity * view.z * view.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float amount;
      uniform vec3 tint;
      varying vec2 beadUv;
      varying float visibility;
      void main() {
        float r = length(beadUv);
        float aa = max(fwidth(r), 0.04);
        float silhouette = 1.0 - smoothstep(0.78, 0.78 + aa, r);
        float glint = exp(-dot(beadUv - vec2(-0.25, 0.3), beadUv - vec2(-0.25, 0.3)) * 22.0);
        float rim = exp(-pow((r - 0.65) * 13.0, 2.0)) * (1.0 - smoothstep(-0.65, 0.2, beadUv.y));
        vec3 water = mix(vec3(0.05, 0.08, 0.09), tint, clamp(glint + rim * 0.65, 0.0, 1.0));
        gl_FragColor = vec4(water, silhouette * visibility * amount * (0.24 + glint * 0.5 + rim * 0.3));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sign-rain';
  mesh.frustumCulled = false;
  panel.add(mesh);
  return {
    draw(phase: number, amount: number, atmosphere: number) {
      material.uniforms.amount!.value = amount;
      material.uniforms.fogDensity!.value = atmosphere * 0.012;
      drops.forEach((drop, i) => {
        const state = getTokyoSignDropState(drop, phase);
        centers.set([state.x, state.y, state.z], i * 3);
        sizes.set([state.width, state.height], i * 2);
        alphas[i] = state.opacity;
      });
      for (const name of ['dropCenter', 'dropSize', 'dropAlpha']) geometry.attributes[name]!.needsUpdate = true;
    },
  };
};
