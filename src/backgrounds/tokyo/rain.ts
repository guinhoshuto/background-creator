import * as THREE from 'three';
import {createTokyoRain, getTokyoDropState, getTokyoImpactState} from './motion';
import {tokyoPuddleMask, tokyoSurfaceNoise} from './effects';

/** Soft, metre-sized streaks: distant rain gets thinner instead of staying one pixel wide. */
export const createTokyoRainField = (scene: THREE.Scene, seed: number, height: number) => {
  const drops = createTokyoRain(seed);
  const centers = new Float32Array(drops.length * 3);
  const tails = new Float32Array(drops.length * 2);
  const alphas = new Float32Array(drops.length);
  const impacts = new Float32Array(drops.length * 3);
  const impactAlphas = new Float32Array(drops.length);
  const radii = new Float32Array(drops.length);
  const ages = new Float32Array(drops.length);

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
        float nearPresence = 1.0 - smoothstep(10.0, 32.0, depth);
        // A slightly longer exposure follows the same fall/wind vector in the sparse near field.
        trail *= 1.0 + nearPresence * 0.18;
        float pixelSize = 2.0 * depth / (projectionMatrix[1][1] * viewportHeight);
        float defocus = 1.0 + (1.0 - smoothstep(7.0, 17.0, depth)) * 0.8;
        float physicalWidth = dropWidth * (1.0 + nearPresence * 0.16);
        float width = max(physicalWidth * defocus, pixelSize * 0.8);
        // Widen the raster footprint but conserve coverage for subpixel drops.
        visibility = dropAlpha * (1.0 + nearPresence * 0.12) * min(1.0, physicalWidth / width)
          * exp(-fogDensity * fogDensity * depth * depth);
        vec3 point = head.xyz + trail * uv.y;
        point.xy += across * position.x * width;
        gl_Position = projectionMatrix * vec4(point, 1.0);
        streakUv = uv;
        tint = rainLight(dropCenter) * (1.0 + nearPresence * 0.08);
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
  impactGeometry.setAttribute('impactAge', new THREE.InstancedBufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage));
  const impactMaterial = new THREE.ShaderMaterial({
    uniforms: {amount: {value: 0.55}, fogDensity: {value: 0.011}},
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 impactCenter;
      attribute float impactRadius, impactAlpha, impactAge;
      uniform float fogDensity;
      varying vec2 rippleUv;
      varying vec2 waterPosition;
      varying float visibility, age;
      varying vec3 tint;
      ${light}
      void main() {
        rippleUv = uv * 2.0 - 1.0;
        vec3 p = impactCenter + vec3(rippleUv.x, 0.0, rippleUv.y) * impactRadius;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        waterPosition = p.xz;
        visibility = impactAlpha * exp(-fogDensity * fogDensity * view.z * view.z);
        age = impactAge;
        tint = rainLight(p);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float amount;
      varying vec2 rippleUv;
      varying vec2 waterPosition;
      varying float visibility, age;
      varying vec3 tint;
      ${tokyoSurfaceNoise}
      ${tokyoPuddleMask}
      void main() {
        float r = length(rippleUv);
        float aa = max(fwidth(r), 0.018);
        float ring = (1.0 - smoothstep(0.0, aa * 1.5, abs(r - 0.76)))
          * min(1.0, 0.066 / aa);
        float inner = (1.0 - smoothstep(0.0, aa * 1.5, abs(r - 0.43)))
          * min(1.0, 0.032 / aa) * smoothstep(0.12, 0.35, age) * 0.3;
        // Side lighting catches one rim more strongly; the water is not a uniformly luminous circle.
        float crestLight = 0.82 + 0.36 * smoothstep(-0.6, 0.6, rippleUv.x);
        // A short central dimple accompanies the first expanding wave.
        float dimple = exp(-r * r * 70.0) * (1.0 - smoothstep(0.0, 0.22, age)) * 0.55;
        float water = smoothstep(0.28, 0.76, tokyoPuddle(waterPosition));
        gl_FragColor = vec4(tint, ((ring + inner) * crestLight + dimple) * visibility * amount * water);
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
      impactMaterial.uniforms.fogDensity!.value = atmosphere * 0.012;
      for (let i = 0; i < drops.length; i++) {
        const state = getTokyoDropState(drops[i]!, phase);
        centers.set([state.x, state.y, state.z], i * 3);
        tails.set([state.tailX, state.tailY], i * 2);
        alphas[i] = state.opacity;
        const impact = getTokyoImpactState(drops[i]!, phase);
        impacts.set([impact.x, 0.025, impact.z], i * 3);
        radii[i] = impact.radius;
        impactAlphas[i] = impact.opacity;
        ages[i] = impact.age;
      }
      for (const name of ['dropCenter', 'dropTail', 'dropAlpha']) geometry.attributes[name]!.needsUpdate = true;
      for (const name of ['impactCenter', 'impactRadius', 'impactAlpha', 'impactAge']) impactGeometry.attributes[name]!.needsUpdate = true;
    },
  };
};
