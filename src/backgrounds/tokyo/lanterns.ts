import * as THREE from 'three';
import {createSeededRandom} from '../../loop';

type PaperFinish = 'cream' | 'vermilion' | 'amber';
type Lantern = {
  side: -1 | 1;
  z: number;
  y: number;
  radius: number;
  height: number;
  finish: PaperFinish;
  light?: number;
};

const TAU = Math.PI * 2;
const RIB_COUNT = 16;
const COLLAR_HEIGHT = 0.055;
const COLLAR_OVERLAP = 0.0075;
const BRACKET_Y = 3.97;
const serif = '"Hiragino Mincho ProN", "YuMincho", "Noto Serif CJK JP", serif';

const lanterns: readonly Lantern[] = [
  {side: -1, z: -2.5, y: 2.74, radius: 0.29, height: 0.91, finish: 'cream', light: 6},
  {side: -1, z: -5.9, y: 2.66, radius: 0.25, height: 0.8, finish: 'vermilion'},
  {side: -1, z: -8.4, y: 2.79, radius: 0.27, height: 0.84, finish: 'amber'},
  {side: 1, z: -4.5, y: 2.73, radius: 0.28, height: 0.89, finish: 'vermilion', light: 5},
  {side: 1, z: -7.1, y: 2.68, radius: 0.24, height: 0.77, finish: 'cream'},
  {side: -1, z: -23, y: 2.76, radius: 0.235, height: 0.73, finish: 'vermilion'},
  {side: 1, z: -27, y: 2.7, radius: 0.23, height: 0.75, finish: 'amber'},
];

/** The neck stays open until its dark collar overlaps the paper at either end. */
const paperRadius = (t: number) => 0.42 + 0.58 * Math.pow(Math.sin(Math.PI * t), 0.7);

const paperTexture = (finish: PaperFinish): THREE.CanvasTexture => {
  const style = {
    cream: {edge: '#a88c61', middle: '#d8be91', ink: '#39291f', seal: '#8d3d2a', label: '茶房', seed: 2317},
    vermilion: {edge: '#7b342b', middle: '#b95d3f', ink: '#ead3a4', seal: '#e2b679', label: '麺処', seed: 3469},
    amber: {edge: '#946b3d', middle: '#c8a367', ink: '#402a20', seal: '#8b3a2a', label: '珈琲', seed: 4783},
  }[finish];
  const random = createSeededRandom(style.seed);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  // Seeded CPU paper grain keeps the same uploaded pixels for every render order.
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) throw new Error('Tokyo paper lanterns need a 2D canvas.');
  const {width: w, height: h} = canvas;
  const warmth = ctx.createLinearGradient(0, 0, 0, h);
  warmth.addColorStop(0, style.edge);
  warmth.addColorStop(0.22, style.middle);
  warmth.addColorStop(0.67, style.middle);
  warmth.addColorStop(1, style.edge);
  ctx.fillStyle = warmth;
  ctx.fillRect(0, 0, w, h);

  // Quiet pulp flecks and fibres, with no isolated bright pixels or painted halo.
  for (let i = 0; i < 1100; i++) {
    const x = random() * w, y = random() * h;
    ctx.strokeStyle = i % 3 ? '#4a352413' : '#eadab51b';
    ctx.lineWidth = 0.45 + random() * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1 + random() * 5, y + (random() - 0.5) * 3);
    ctx.stroke();
  }
  for (let i = 1; i < RIB_COUNT; i++) {
    const y = h * i / RIB_COUNT;
    ctx.fillStyle = '#3d2a1914';
    ctx.fillRect(0, y - 2.1, w, 4.2);
    ctx.fillStyle = '#f2d8aa0d';
    ctx.fillRect(0, y + 2.1, w, 1.2);
  }

  // Three original vertical shop labels wrap around the envelope, away from its seam.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letters = Array.from(style.label);
  for (let column = 0; column < 3; column++) {
    const x = w * (column + 0.5) / 3;
    ctx.fillStyle = style.ink;
    ctx.font = `700 ${h * 0.205}px ${serif}`;
    letters.forEach((letter, index) => {
      ctx.save();
      ctx.translate(x + (random() - 0.5) * 3, h * (0.38 + index * 0.235));
      ctx.rotate((random() - 0.5) * 0.035);
      ctx.fillText(letter, 0, 0, w * 0.105);
      ctx.restore();
    });
    const seal = h * 0.038;
    ctx.strokeStyle = style.seal;
    ctx.lineWidth = 2.3;
    ctx.strokeRect(x - seal / 2, h * 0.788, seal, seal);
    ctx.beginPath();
    ctx.moveTo(x - seal * 0.27, h * 0.788 + seal * 0.35);
    ctx.lineTo(x + seal * 0.27, h * 0.788 + seal * 0.35);
    ctx.moveTo(x, h * 0.788 + seal * 0.18);
    ctx.lineTo(x, h * 0.788 + seal * 0.8);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `tokyo-lantern-${finish}-paper`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/** Static lanterns hang outside the awning edge; every support meets its attachment. */
export const addTokyoPaperLanterns = (scene: THREE.Scene): void => {
  const group = new THREE.Group();
  group.name = 'tokyo-paper-lanterns';
  const points = Array.from({length: 129}, (_, i) => {
    const t = i / 128;
    const fold = 0.007 * (1 - Math.cos(t * TAU * RIB_COUNT));
    return new THREE.Vector2(paperRadius(t) + fold, t - 0.5);
  });
  const paperGeometry = new THREE.LatheGeometry(points, 48);
  const ribGeometry = new THREE.TorusGeometry(1, 0.013, 5, 48);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 24);
  const rodGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const iron = new THREE.MeshStandardMaterial({color: '#293b3a', roughness: 0.82, metalness: 0.32});
  const ribs = new THREE.MeshStandardMaterial({color: '#614733', roughness: 0.96});
  const collars = new THREE.MeshStandardMaterial({color: '#352a24', roughness: 0.83, metalness: 0.08});
  const cord = new THREE.MeshStandardMaterial({color: '#4b4031', roughness: 1});
  const finishes = {} as Record<PaperFinish, THREE.MeshStandardMaterial>;
  for (const finish of ['cream', 'vermilion', 'amber'] as const) {
    const map = paperTexture(finish);
    finishes[finish] = new THREE.MeshStandardMaterial({
      map, color: '#d1c5ac', roughness: 0.98, metalness: 0,
      // The printed texture also gates emission, so ink remains legible under bloom.
      emissive: '#dca05a', emissiveMap: map, emissiveIntensity: 0.24,
    });
  }

  const rod = (name: string, from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(rodGeometry, material);
    mesh.name = name;
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    const direction = to.clone().sub(from);
    mesh.scale.set(radius, direction.length(), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(mesh);
  };

  lanterns.forEach((lantern, index) => {
    const {side, z, y, radius, height, finish} = lantern;
    const x = side * 8.28;
    const wallX = side * 9.985;
    const prefix = `tokyo-lantern-${index + 1}`;
    const plate = new THREE.Mesh(boxGeometry, iron);
    plate.name = `${prefix}-wall-plate`;
    plate.position.set(wallX, 4.16, z);
    plate.scale.set(0.07, 0.56, 0.17);
    group.add(plate);

    rod(`${prefix}-bracket`, new THREE.Vector3(wallX, BRACKET_Y, z), new THREE.Vector3(x, BRACKET_Y, z), 0.028, iron);
    // This upper brace never runs through the sloping canopy below the bracket.
    rod(`${prefix}-brace`, new THREE.Vector3(wallX, 4.37, z), new THREE.Vector3(x + side * 0.2, BRACKET_Y, z), 0.022, iron);
    for (const boltY of [3.98, 4.35]) {
      const bolt = new THREE.Mesh(cylinderGeometry, collars);
      bolt.name = `${prefix}-mount-bolt`;
      bolt.position.set(wallX - side * 0.04, boltY, z);
      bolt.rotation.z = Math.PI / 2;
      bolt.scale.set(0.026, 0.022, 0.026);
      group.add(bolt);
    }

    const paper = new THREE.Mesh(paperGeometry, finishes[finish]);
    paper.name = `${prefix}-${finish}-paper`;
    paper.position.set(x, y, z);
    paper.scale.set(radius, height, radius);
    // Face the first printed column toward the initial camera; no per-frame state.
    paper.rotation.y = Math.atan2(1.3 - x, 19 - z) - TAU / 6;
    group.add(paper);

    for (let i = 1; i < RIB_COUNT; i++) {
      const t = i / RIB_COUNT;
      const rib = new THREE.Mesh(ribGeometry, ribs);
      rib.name = `${prefix}-rib-${i}`;
      rib.rotation.x = Math.PI / 2;
      rib.position.set(x, y + height * (t - 0.5), z);
      rib.scale.setScalar(radius * paperRadius(t) + 0.001);
      group.add(rib);
    }
    const collarOffset = height / 2 + COLLAR_HEIGHT / 2 - COLLAR_OVERLAP;
    for (const end of [-1, 1]) {
      const collar = new THREE.Mesh(cylinderGeometry, collars);
      collar.name = `${prefix}-${end < 0 ? 'bottom' : 'top'}-collar`;
      collar.position.set(x, y + end * collarOffset, z);
      collar.scale.set(radius * 0.445, COLLAR_HEIGHT, radius * 0.445);
      group.add(collar);
    }
    rod(`${prefix}-cord`, new THREE.Vector3(x, y + collarOffset, z), new THREE.Vector3(x, BRACKET_Y, z), 0.009, cord);

    if (lantern.light !== undefined) {
      const light = new THREE.PointLight('#ffc17d', lantern.light, 3.6, 2);
      light.name = `${prefix}-warm-spill`;
      light.position.set(x, y, z);
      group.add(light);
    }
  });
  scene.add(group);
};
