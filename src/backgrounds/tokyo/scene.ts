import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {z} from 'zod';
import type {TokyoFutureLoopProps} from '../TokyoFutureLoop';
import {createTokyoRain, getTokyoMotion, rainHeight} from './motion';
import {createTokyoFilmPass, createTokyoFog, wetRoadShader} from './effects';
import {ageTokyoSign, addTokyoStreetDebris} from './details';
import {applyTokyoWeathering} from './weathering';

const signSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  width: z.number().positive(), height: z.number().positive(),
  text: z.string(), color: z.string(), vertical: z.boolean(),
  rotationY: z.number().optional(),
});
type Sign = z.infer<typeof signSchema>;

const signTexture = (sign: Sign, index: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = sign.vertical ? 256 : 1024;
  canvas.height = sign.vertical ? 1024 : 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The city signs need a 2D canvas.');
  const {width: w, height: h} = canvas;
  ctx.fillStyle = '#071519'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = sign.color; ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = sign.color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const font = '"Hiragino Sans", "Noto Sans CJK JP", sans-serif';
  if (sign.vertical) {
    const letters = Array.from(sign.text);
    const size = Math.min(154, 740 / letters.length);
    ctx.font = `600 ${size}px ${font}`;
    letters.forEach((letter, i) => ctx.fillText(letter, w / 2, 150 + i * 720 / letters.length));
    ctx.font = '500 28px sans-serif'; ctx.fillText(`SECTOR ${String(index + 1).padStart(2, '0')}`, w / 2, h - 66);
  } else {
    ctx.font = `600 ${Math.min(155, 820 / sign.text.length)}px ${font}`;
    ctx.fillText(sign.text, w / 2, h * 0.42);
    ctx.font = '500 27px sans-serif';
    ctx.fillText(['NIGHT MARKET', 'TOKYO ELECTRIC', 'OPEN ALL NIGHT', 'LOWER CITY', 'AFTER HOURS'][index % 5]!, w / 2, h * 0.81);
  }
  ageTokyoSign(ctx, w, h, index);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const vaporTexture = () => {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, '#a4bbc480'); gradient.addColorStop(0.4, '#92adb432'); gradient.addColorStop(1, '#92adb400');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
};

export type TokyoScene = {
  draw: (frame: number, duration: number, props: Pick<TokyoFutureLoopProps, 'rain' | 'atmosphere' | 'glow' | 'cameraMotion' | 'backgroundColor' | 'weathering' | 'cinematic' | 'filmGrain'>) => void;
  dispose: () => void;
};

export const createTokyoScene = async ({canvas, width, height, modelUrl, signsUrl, seed}: {
  canvas: HTMLCanvasElement; width: number; height: number;
  modelUrl: string; signsUrl: string; seed: number;
}): Promise<TokyoScene> => {
  // Asset loading happens before GPU allocation, so a missing build cannot leak a renderer.
  const [gltf, signResponse] = await Promise.all([new GLTFLoader().loadAsync(modelUrl), fetch(signsUrl)]);
  if (!signResponse.ok) throw new Error(`Sign anchors returned HTTP ${signResponse.status}.`);
  const signs = z.array(signSchema).parse(await signResponse.json());
  await document.fonts.ready;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, preserveDrawingBuffer: true});
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  // Fail on compilation errors instead of silently exporting a black scene.
  renderer.debug.onShaderError = (gl, program) => {throw new Error(gl.getProgramInfoLog(program) || 'Tokyo shader compilation failed.');};
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#08131D');
  scene.fog = new THREE.FogExp2('#233B49', 0.011);
  const camera = new THREE.PerspectiveCamera(52, width / height, 0.15, 420);
  scene.add(gltf.scene);
  const weathering = applyTokyoWeathering(gltf.scene);
  addTokyoStreetDebris(scene, seed);
  const fog = createTokyoFog(scene);
  scene.add(new THREE.HemisphereLight('#8DAAC8', '#25303B', 1.8));
  const moonlight = new THREE.DirectionalLight('#85AACA', 2.4);
  moonlight.position.set(-30, 65, 25); scene.add(moonlight);
  const fill = new THREE.DirectionalLight('#5C919D', 0.8);
  fill.position.set(20, 16, -75); scene.add(fill);

  const emissives: {material: THREE.MeshStandardMaterial; value: number}[] = [];
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && !emissives.some((item) => item.material === material)) {
        material.roughness = Math.max(0.4, material.roughness);
        if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
          emissives.push({material, value: material.emissiveIntensity});
        }
      }
    }
  });

  signs.forEach((sign, i) => {
    const material = new THREE.MeshBasicMaterial({map: signTexture(sign, i), color: new THREE.Color().setScalar(1.45)});
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(sign.width, sign.height), material);
    panel.position.fromArray(sign.position); panel.rotation.y = sign.rotationY ?? 0;
    scene.add(panel);
  });
  for (const [x, z, color] of [[-7.8, 0, '#27B9DD'], [7.8, -4, '#FF6451'], [-7.8, -27, '#EFAD62'], [7.8, -48, '#28B5C2']] as const) {
    const light = new THREE.PointLight(color, 145, 26, 2);
    light.position.set(x, 4.8, z); scene.add(light);
  }

  const road = new Reflector(new THREE.PlaneGeometry(90, 310), {
    textureWidth: width, textureHeight: height, clipBias: 0.003, multisample: 4,
    shader: wetRoadShader,
  });
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.012, -100);
  scene.add(road);
  const roadMaterial = road.material as THREE.ShaderMaterial;

  const drops = createTokyoRain(seed);
  const vertices = new Float32Array(drops.length * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const rainMaterial = new THREE.LineBasicMaterial({color: '#B2CFDF', transparent: true, opacity: 0.19, depthWrite: false});
  const rain = new THREE.LineSegments(geometry, rainMaterial);
  rain.frustumCulled = false; scene.add(rain);

  const steamMap = vaporTexture();
  const steam = Array.from({length: 12}, (_, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: steamMap, color: i < 6 ? '#53A4AF' : '#C39A88', transparent: true, depthWrite: false}));
    scene.add(sprite); return sprite;
  });

  const target = new THREE.WebGLRenderTarget(width, height, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.62, 0.7, 1.0);
  const output = new OutputPass();
  const film = createTokyoFilmPass(width, height);
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output); composer.addPass(film);
  return {
    draw(frame, duration, props) {
      const motion = getTokyoMotion(frame, duration, props.cameraMotion);
      camera.position.set(motion.cameraX, motion.cameraY, motion.cameraZ);
      camera.lookAt(0, 10, -40);
      scene.background = new THREE.Color(props.backgroundColor);
      (scene.fog as THREE.FogExp2).density = props.atmosphere * 0.012;
      fog.draw(motion.phase, props.atmosphere);
      weathering.setAmount(props.weathering);
      roadMaterial.uniforms.weathering!.value = props.weathering;
      film.uniforms.phase!.value = motion.phase;
      film.uniforms.amount!.value = props.cinematic;
      film.uniforms.grain!.value = props.filmGrain;
      roadMaterial.uniforms.phase!.value = motion.phase;
      bloom.strength = props.glow;
      rainMaterial.opacity = props.rain * 0.33;
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i]!;
        const y = rainHeight(drop.offset, motion.phase);
        vertices.set([drop.x, y, drop.z, drop.x + 0.035, y + drop.length, drop.z], i * 6);
      }
      geometry.attributes.position!.needsUpdate = true;
      emissives.forEach(({material, value}) => {material.emissiveIntensity = value * motion.neon;});
      steam.forEach((sprite, i) => {
        const p = motion.phase + i * Math.PI / 3;
        const side = i < 6 ? -1 : 1;
        sprite.position.set(side * (6.7 + Math.sin(p) * 0.25), 0.65 + (i % 6) * 0.23 + Math.sin(p) * 0.18, (side < 0 ? -8 : -31) + Math.cos(p) * 0.6);
        sprite.scale.set(2.1 + Math.sin(p) * 0.15, 1.9 + (i % 3) * 0.3, 1);
        sprite.material.opacity = (0.19 + 0.05 * Math.cos(p)) * props.atmosphere;
      });
      // Fixed delta: there is no clock, accumulation, temporal blur or frame history.
      composer.render(0);
    },
    dispose() {
      const textures = new Set<THREE.Texture>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Sprite) {
          if ('geometry' in object) object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      textures.forEach((texture) => texture.dispose()); materials.forEach((material) => material.dispose());
      weathering.dispose(); road.dispose(); bloom.dispose(); output.dispose(); film.dispose(); composer.dispose(); renderer.dispose();
      renderer.forceContextLoss();
    },
  };
};
