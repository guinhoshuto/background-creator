import * as THREE from 'three';
import {createSeededRandom} from '../../loop';

/** Printed acrylic signs collect scratches, rain trails and dirt around their fasteners. */
export const ageTokyoSign = (ctx: CanvasRenderingContext2D, width: number, height: number, seed: number) => {
  const random = createSeededRandom(seed + 8053);
  for (let i = 0; i < 150; i++) {
    const x = random() * width, y = random() * height;
    ctx.fillStyle = `rgba(2,9,13,${0.07 + random() * 0.19})`;
    ctx.fillRect(x, y, 1 + random() * 4, 3 + random() * height * 0.08);
  }
  for (let i = 0; i < 22; i++) {
    const x = random() * width, y = random() * height;
    ctx.strokeStyle = i % 3 ? '#020a1048' : '#b1c0b22c';
    ctx.lineWidth = 1 + random(); ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * width * 0.18, y + random() * 7); ctx.stroke();
  }
  const edge = Math.min(width, height) * 0.13;
  for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
    const grime = ctx.createRadialGradient(x!, y!, 0, x!, y!, edge * 2.7);
    grime.addColorStop(0, '#080907bf'); grime.addColorStop(1, '#08090700');
    ctx.fillStyle = grime; ctx.fillRect(0, 0, width, height);
  }
  for (const x of [22, width - 22]) for (const y of [22, height - 22]) {
    ctx.fillStyle = '#1b2627'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7c8780'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.stroke();
  }
};

/** A little accumulated paper and grit in the gutters, held against the ground. */
export const addTokyoStreetDebris = (scene: THREE.Scene, seed: number) => {
  const random = createSeededRandom(seed + 9091);
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const material = new THREE.MeshStandardMaterial({color: '#9c9784', roughness: 0.97, side: THREE.DoubleSide});
  const debris = new THREE.InstancedMesh(geometry, material, 76);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 76; i++) {
    const side = i % 2 ? -1 : 1;
    const paper = i % 5 === 0;
    dummy.position.set(side * (5.7 + random() * 1.05), 0.038 + random() * 0.008, 10 - random() * 80);
    dummy.rotation.set(-Math.PI / 2, 0, random() * Math.PI * 2);
    dummy.scale.set(paper ? 0.15 + random() * 0.18 : 0.03 + random() * 0.08, paper ? 0.21 + random() * 0.18 : 0.06 + random() * 0.10, 1);
    dummy.updateMatrix(); debris.setMatrixAt(i, dummy.matrix);
    debris.setColorAt(i, new THREE.Color(paper ? '#8a8974' : '#3a3025').multiplyScalar(0.7 + random() * 0.5));
  }
  scene.add(debris);
};
