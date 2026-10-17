import * as THREE from 'three';
import {createTokyoRain, getTokyoDropState} from './motion';

/** Soft, metre-sized streaks: distant rain gets thinner instead of staying one pixel wide. */
export const createTokyoRainField = (scene: THREE.Scene, seed: number, height: number) => {
  const drops = createTokyoRain(seed);
  const centers = new Float32Array(drops.length * 3);
  const tails = new Float32Array(drops.length * 2);
  const alphas = new Float32Array(drops.length);
  const impacts = new Float32Array(drops.length * 3);
  const impactAlphas = new Float32Array(drops.length);
  const radii = new Float32Array(drops.length);

  const quad = () => {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.instanceCount = drops.length;
    return geometry;
  };
  const geometry = quad();
  geometry.setAttribute('dropCenter', new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('dropTail', new THREE.InstancedBufferAttribute(tails, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('dropAlpha', new THREE.InstancedBufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('dropWidth', new THREE.InstancedBufferAttribute(new Float32Array(drops.map((drop) => drop.width)), 1));

  // Rain is seen mostly where the street lighting catches it. No luminous white overlay.
  const light = /* glsl */ `
    vec3 rainLight(vec3 p) {
      float cyan = exp(-distance(p, vec3(-7.8, 4.8, 0.0)) * 0.12);
      float coral = exp(-distance(p, vec3(7.8, 4.8, -4.0)) * 0.12);
      float amber = exp(-distance(p, vec3(-7.8, 4.8, -27.0)) * 0.15);
      return vec3(0.16, 0.22, 0.28) + cyan * vec3(0.08, 0.38, 0.48)
        + coral * vec3(0.44, 0.17, 0.10) + amber * vec3(0.32, 0.23, 0.12);
    }
  `;
  const material = new THREE.ShaderMaterial({
    uniforms: {amount: {value: 0.55}, viewportHeight: {value: height}, fogDensity: {value: 0.011}},
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 dropCenter;
      attribute vec2 dropTail;
      attribute float dropWidth, dropAlpha;
      uniform float viewportHeight, fogDensity;
      varying vec2 streakUv;
      varying float visibility;
      varying vec3 tint;
      ${light}
      void main() {
        vec4 head = modelViewMatrix * vec4(dropCenter, 1.0);
        vec3 trail = (modelViewMatrix * vec4(dropTail, 0.0, 0.0)).xyz;
        vec2 across = normalize(vec2(trail.y, -trail.x));
        float depth = max(0.1, -head.z);
        float pixelSize = 2.0 * depth / (projectionMatrix[1][1] * viewportHeight);
        float defocus = 1.0 + (1.0 - smoothstep(7.0, 17.0, depth)) * 0.8;
        float width = max(dropWidth * defocus, pixelSize * 0.8);
        // Widen the raster footprint but conserve coverage for subpixel drops.
        visibility = dropAlpha * min(1.0, dropWidth / width)
          * exp(-fogDensity * fogDensity * depth * depth);
        vec3 point = head.xyz + trail * uv.y;
        point.xy += across * position.x * width;
        gl_Position = projectionMatrix * vec4(point, 1.0);
        streakUv = uv;
        tint = rainLight(dropCenter);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float amount;
      varying vec2 streakUv;
      varying float visibility;
      varying vec3 tint;
      void main() {
        float across = streakUv.x * 2.0 - 1.0;
        float core = exp(-across * across * 5.0);
        float taper = smoothstep(0.0, 0.12, streakUv.y)
          * (1.0 - smoothstep(0.42, 1.0, streakUv.y));
        gl_FragColor = vec4(tint, core * taper * visibility * amount);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const streaks = new THREE.Mesh(geometry, material);
  streaks.frustumCulled = false;
  scene.add(streaks);

  const impactGeometry = quad();
  impactGeometry.setAttribute('impactCenter', new THREE.InstancedBufferAttribute(impacts, 3).setUsage(THREE.DynamicDrawUsage));
  impactGeometry.setAttribute('impactRadius', new THREE.InstancedBufferAttribute(radii, 1).setUsage(THREE.DynamicDrawUsage));
  impactGeometry.setAttribute('impactAlpha', new THREE.InstancedBufferAttribute(impactAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  const impactMaterial = new THREE.ShaderMaterial({
    uniforms: {amount: {value: 0.55}},
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 impactCenter;
      attribute float impactRadius, impactAlpha;
      varying vec2 rippleUv;
      varying float visibility;
      varying vec3 tint;
      ${light}
      void main() {
        rippleUv = uv * 2.0 - 1.0;
        vec3 p = impactCenter + vec3(rippleUv.x, 0.0, rippleUv.y) * impactRadius;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        visibility = impactAlpha;
        tint = rainLight(p) * 0.8;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float amount;
      varying vec2 rippleUv;
      varying float visibility;
      varying vec3 tint;
      void main() {
        float r = length(rippleUv);
        float aa = max(fwidth(r), 0.018);
        float ring = (1.0 - smoothstep(0.0, aa * 1.5, abs(r - 0.72)))
          * min(1.0, 0.035 / aa);
        gl_FragColor = vec4(tint, ring * visibility * amount);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const splashes = new THREE.Mesh(impactGeometry, impactMaterial);
  splashes.frustumCulled = false;
  scene.add(splashes);

  return {
    draw(phase: number, amount: number, atmosphere: number) {
      material.uniforms.amount!.value = amount;
      material.uniforms.fogDensity!.value = atmosphere * 0.012;
      impactMaterial.uniforms.amount!.value = amount;
      for (let i = 0; i < drops.length; i++) {
        const state = getTokyoDropState(drops[i]!, phase);
        centers.set([state.x, state.y, state.z], i * 3);
        tails.set([state.tailX, state.tailY], i * 2);
        alphas[i] = state.opacity;
        impacts.set([state.impactX, 0.045, state.impactZ], i * 3);
        const age = Math.min(1, state.impactAge / 0.32);
        radii[i] = 0.025 + Math.sqrt(age) * 0.19;
        // Only the open roadway receives visible rings, never roofs or hidden indoor floors.
        const roadway = Math.abs(state.impactX) < 5.8 && state.impactZ > -62 && state.impactZ < 11;
        impactAlphas[i] = roadway ? Math.min(1, age * 12) * (1 - age) ** 2 * 0.28 : 0;
      }
      for (const name of ['dropCenter', 'dropTail', 'dropAlpha']) geometry.attributes[name]!.needsUpdate = true;
      for (const name of ['impactCenter', 'impactRadius', 'impactAlpha']) impactGeometry.attributes[name]!.needsUpdate = true;
    },
  };
};
