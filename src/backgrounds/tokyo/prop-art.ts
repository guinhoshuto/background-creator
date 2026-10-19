import * as THREE from 'three';
import {createSeededRandom} from '../../loop';

export type TokyoPropSurface = {
  kind: 'drinks' | 'coffee' | 'locker' | 'poster' | 'menu' | 'awning';
  position: [number, number, number];
  width: number;
  height: number;
  rotationY?: number;
  variant: number;
};

type Ink = CanvasRenderingContext2D;
type Random = () => number;
const sans = '"Hiragino Sans", "Noto Sans CJK JP", sans-serif';
const serif = '"Hiragino Mincho ProN", "YuMincho", serif';
const TAU = Math.PI * 2;
const seeds: Record<TokyoPropSurface['kind'], number> = {
  drinks: 1129, coffee: 2633, locker: 3547, poster: 4931, menu: 6379, awning: 7451,
};

const box = (ctx: Ink, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

const label = (ctx: Ink, value: string, x: number, y: number, size: number,
  color: string, maxWidth: number, family = sans, weight = '600') => {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y, maxWidth);
};

const line = (ctx: Ink, color: string, width: number, points: readonly (readonly [number, number])[]) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();
};

/** Worn print stays subordinate to the large color blocks at street-view scale. */
const weather = (ctx: Ink, w: number, h: number, random: Random, paper = false) => {
  ctx.save();
  for (let i = 0; i < 65; i++) {
    const x = random() * w;
    const edge = i % 3 === 0;
    const y = edge ? (i % 2 ? h * random() * 0.08 : h * (0.92 + random() * 0.08)) : random() * h;
    box(ctx, i % 4 ? '#07181c16' : '#c3b99420', x, y,
      w * (0.001 + random() * 0.008), h * (0.003 + random() * (paper ? 0.012 : 0.035)));
  }
  for (let i = 0; i < 8; i++) {
    const x = random() * w;
    const length = h * (0.04 + random() * 0.16);
    line(ctx, '#31261d23', w * (0.0015 + random() * 0.002), [[x, 0], [x - w * 0.008, length]]);
  }
  const shade = ctx.createLinearGradient(0, 0, w, h);
  shade.addColorStop(0, '#07151b20');
  shade.addColorStop(0.35, '#07151b00');
  shade.addColorStop(1, '#07151b3b');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};

const bottle = (ctx: Ink, x: number, bottom: number, w: number, h: number, kind: number, color: string) => {
  ctx.save();
  ctx.translate(x, bottom);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 0) {
    ctx.roundRect(-w * 0.43, -h * 0.8, w * 0.86, h * 0.8, w * 0.12);
  } else if (kind === 1) {
    ctx.moveTo(-w * 0.34, 0); ctx.lineTo(-w * 0.43, -h * 0.59);
    ctx.lineTo(-w * 0.2, -h * 0.82); ctx.lineTo(-w * 0.2, -h);
    ctx.lineTo(w * 0.2, -h); ctx.lineTo(w * 0.2, -h * 0.82);
    ctx.lineTo(w * 0.43, -h * 0.59); ctx.lineTo(w * 0.34, 0); ctx.closePath();
  } else {
    ctx.roundRect(-w * 0.36, -h * 0.91, w * 0.72, h * 0.91, w * 0.18);
  }
  ctx.fill();
  box(ctx, '#c5b991', -w * 0.33, -h * 0.55, w * 0.66, h * 0.25);
  box(ctx, '#253b3a', -w * 0.19, -h * 0.49, w * 0.38, h * 0.06);
  box(ctx, '#c2c1a6', -w * 0.23, -h * (kind === 0 ? 0.83 : 1), w * 0.46, h * 0.045);
  box(ctx, '#d6d2ab39', -w * 0.24, -h * 0.73, w * 0.07, h * 0.61);
  ctx.restore();
};

const drinks = (ctx: Ink, w: number, h: number, variant: number) => {
  box(ctx, '#b7aa83', 0, 0, w, h);
  box(ctx, '#853c32', 0, h * 0.025, w, h * 0.177);
  label(ctx, variant % 2 ? '夕凪ソーダ' : '路地サイダー', w * 0.5, h * 0.098, w * 0.115, '#d0bc92', w * 0.88, serif, '700');
  label(ctx, 'ROJI  •  REFRESHMENTS', w * 0.5, h * 0.163, w * 0.035, '#c7b28c', w * 0.8);
  // Three calm shelves read as products, with no second set of hardware controls.
  box(ctx, '#192e31', w * 0.067, h * 0.228, w * 0.866, h * 0.465);
  const colors = ['#a16e3e', '#457e73', '#9a4938', '#637f86'];
  for (let row = 0; row < 3; row++) {
    const bottom = h * (0.345 + row * 0.145);
    for (let col = 0; col < 4; col++) {
      const product = (row * 4 + col + variant) % 4;
      const x = w * (0.18 + col * 0.213);
      bottle(ctx, x, bottom, w * (product === 0 ? 0.1 : 0.085), h * (product === 0 ? 0.084 : 0.097), product % 3, colors[product]!);
      label(ctx, row === 2 ? '150' : '120', x, bottom + h * 0.023, w * 0.029, '#b8b399', w * 0.14, sans);
    }
    box(ctx, '#66756c', w * 0.085, bottom + h * 0.043, w * 0.83, h * 0.005);
    box(ctx, '#0c1e24', w * 0.085, bottom + h * 0.048, w * 0.83, h * 0.009);
  }
  box(ctx, '#4a7773', w * 0.067, h * 0.72, w * 0.52, h * 0.055);
  label(ctx, 'つめたい', w * 0.327, h * 0.748, w * 0.058, '#d0c6a5', w * 0.45);
  label(ctx, '¥120〜', w * 0.77, h * 0.748, w * 0.059, '#613c2c', w * 0.27);
  box(ctx, '#853c32', 0, h * 0.818, w, h * 0.018);
  label(ctx, '空き缶は回収箱へ', w * 0.5, h * 0.882, w * 0.042, '#5c5f4d', w * 0.8);
  label(ctx, `RJ-${String(21 + variant).padStart(3, '0')}   24 HOURS`, w * 0.5, h * 0.944, w * 0.031, '#555a4b', w * 0.8, 'monospace');
};

/** An original ceramic cup silhouette, reused as a shop mark and menu illustration. */
const cup = (ctx: Ink, x: number, y: number, size: number, ink: string) => {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = ink; ctx.lineWidth = size * 0.065;
  ctx.beginPath(); ctx.ellipse(size * 0.36, -size * 0.07, size * 0.19, size * 0.17, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.moveTo(-size * 0.4, -size * 0.31); ctx.lineTo(size * 0.38, -size * 0.31);
  ctx.quadraticCurveTo(size * 0.34, size * 0.26, 0, size * 0.27);
  ctx.quadraticCurveTo(-size * 0.34, size * 0.26, -size * 0.4, -size * 0.31); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, size * 0.31, size * 0.48, size * 0.055, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 2; i++) {
    const sx = size * (i * 0.26 - 0.17);
    ctx.beginPath(); ctx.moveTo(sx, -size * 0.43);
    ctx.bezierCurveTo(sx - size * 0.15, -size * 0.59, sx + size * 0.15, -size * 0.61, sx, -size * 0.8); ctx.stroke();
  }
  ctx.restore();
};

const coffee = (ctx: Ink, w: number, h: number, variant: number) => {
  box(ctx, '#284a42', 0, 0, w, h);
  box(ctx, '#9b906a', w * 0.045, h * 0.04, w * 0.91, h * 0.008);
  label(ctx, '月灯珈琲', w * 0.5, h * 0.107, w * 0.14, '#c6b98c', w * 0.84, serif, '700');
  label(ctx, 'TSUKIAKARI  •  COFFEE', w * 0.5, h * 0.176, w * 0.034, '#9fa98b', w * 0.85, serif);
  cup(ctx, w * 0.42, h * 0.328, w * 0.34, '#b4aa7e');
  ctx.fillStyle = '#8b4836';
  ctx.beginPath(); ctx.arc(w * 0.79, h * 0.29, w * 0.105, 0, TAU); ctx.fill();
  label(ctx, 'HOT', w * 0.79, h * 0.29, w * 0.043, '#cfb58a', w * 0.18, serif);
  label(ctx, '一杯ずつ、ゆっくり。', w * 0.5, h * 0.424, w * 0.047, '#b6ad87', w * 0.84, serif);
  const names = ['珈琲', 'ミルク', '紅茶', 'ココア'];
  for (let i = 0; i < 4; i++) {
    const x = w * (0.075 + (i % 2) * 0.445), y = h * (0.483 + Math.floor(i / 2) * 0.154);
    box(ctx, i === (variant % 4) ? '#947c51' : '#7f8769', x, y, w * 0.405, h * 0.135);
    cup(ctx, x + w * 0.092, y + h * 0.064, w * 0.112, '#29443d');
    label(ctx, names[i]!, x + w * 0.265, y + h * 0.046, w * 0.059, '#293d33', w * 0.22, serif);
    label(ctx, i === 0 ? '¥150' : '¥180', x + w * 0.265, y + h * 0.095, w * 0.039, '#3d4434', w * 0.22, sans);
  }
  box(ctx, '#a59b73', w * 0.1, h * 0.822, w * 0.8, h * 0.069);
  label(ctx, 'あたたかい飲みもの', w * 0.5, h * 0.856, w * 0.05, '#35473c', w * 0.72, serif);
  label(ctx, 'EST. 1978   /   BLEND No. 03', w * 0.5, h * 0.94, w * 0.032, '#9c9f7f', w * 0.83, 'monospace');
};

const locker = (ctx: Ink, w: number, h: number, variant: number) => {
  box(ctx, '#4e5b55', 0, 0, w, h);
  box(ctx, '#a38a53', 0, 0, w, h * 0.13);
  label(ctx, 'コインロッカー', w * 0.41, h * 0.061, w * 0.077, '#253c3b', w * 0.75);
  label(ctx, '24H', w * 0.883, h * 0.065, w * 0.062, '#273e3b', w * 0.16);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    const x = w * (0.035 + col * 0.49), y = h * (0.156 + row * 0.246);
    box(ctx, (row + col + variant) % 3 === 0 ? '#998352' : '#89917d', x, y, w * 0.44, h * 0.222);
    label(ctx, String(11 + variant * 6 + row * 2 + col), x + w * 0.105, y + h * 0.053, w * 0.079, '#334c48', w * 0.16, 'monospace', '700');
    for (let i = 0; i < 5; i++) {
      box(ctx, '#4f6258', x + w * (0.042 + i * 0.023), y + h * 0.17, w * (i % 2 ? 0.006 : 0.012), h * 0.022);
    }
    label(ctx, '¥300', x + w * 0.33, y + h * 0.181, w * 0.031, '#455a4f', w * 0.13, sans);
    if (row === 1 && col === variant % 2) {
      ctx.save(); ctx.translate(x + w * 0.23, y + h * 0.092); ctx.rotate(-0.045);
      box(ctx, '#b4ab85', -w * 0.14, -h * 0.027, w * 0.28, h * 0.054);
      label(ctx, '点検済', 0, 0, w * 0.048, '#884f38', w * 0.25); ctx.restore();
    }
  }
  label(ctx, '鍵のお忘れにご注意', w * 0.5, h * 0.95, w * 0.046, '#a5b199', w * 0.87);
};

const poster = (ctx: Ink, w: number, h: number, variant: number, random: Random) => {
  box(ctx, '#4b5b52', 0, 0, w, h);
  box(ctx, '#84684d', w * 0.018, h * 0.018, w * 0.95, h * 0.955);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.045); ctx.lineTo(w * 0.953, h * 0.034);
  ctx.lineTo(w * 0.93, h * 0.91);
  for (let i = 9; i >= 0; i--) ctx.lineTo(w * (0.065 + i * 0.095), h * (0.88 + random() * 0.048));
  ctx.closePath(); ctx.clip();
  box(ctx, '#b6a47b', 0, 0, w, h);
  const record = variant % 2 === 0;
  label(ctx, record ? '夜の音' : '夜市', w * 0.5, h * 0.184, w * 0.19, '#6f4032', w * 0.78, serif, '700');
  label(ctx, record ? 'AFTER HOURS' : 'NIGHT MARKET', w * 0.5, h * 0.302, w * 0.045, '#445b50', w * 0.77, sans);
  if (record) {
    ctx.fillStyle = '#35524b'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.55, w * 0.29, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8d9475'; ctx.lineWidth = w * 0.006;
    for (const radius of [0.13, 0.2, 0.25]) {
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.55, w * radius, -Math.PI * 0.78, Math.PI * 0.6); ctx.stroke();
    }
    ctx.fillStyle = '#a15b40'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.55, w * 0.084, 0, TAU); ctx.fill();
    box(ctx, '#35524b', w * 0.49, h * 0.55 - w * 0.01, w * 0.02, w * 0.02);
  } else {
    for (let i = 0; i < 3; i++) {
      const x = w * (0.25 + i * 0.25), y = h * (0.51 + (i % 2) * 0.065);
      line(ctx, '#536053', w * 0.008, [[x, h * 0.36], [x, y]]);
      ctx.fillStyle = i === 1 ? '#8c4b37' : '#a16e45';
      ctx.beginPath(); ctx.ellipse(x, y, w * 0.1, w * 0.14, 0, 0, TAU); ctx.fill();
      for (const dy of [-0.09, 0, 0.09]) line(ctx, '#704c374b', w * 0.01, [[x - w * 0.08, y + w * dy], [x + w * 0.08, y + w * dy]]);
    }
  }
  label(ctx, record ? '土曜  20:00' : '毎月 第二土曜', w * 0.5, h * 0.77, w * 0.068, '#38534a', w * 0.77);
  label(ctx, record ? '地下の小さな演奏会' : '商店街  /  夕方から', w * 0.5, h * 0.839, w * 0.041, '#566451', w * 0.79);
  ctx.restore();
  for (const x of [0.15, 0.81]) {
    ctx.save(); ctx.translate(w * x, h * 0.055); ctx.rotate((random() - 0.5) * 0.23);
    box(ctx, '#a59f7e90', -w * 0.065, -h * 0.035, w * 0.13, h * 0.075); ctx.restore();
  }
};

const menu = (ctx: Ink, w: number, h: number, variant: number) => {
  const cafe = variant % 2 === 1;
  box(ctx, '#233f3a', 0, 0, w, h);
  box(ctx, '#a89e77', w * 0.047, h * 0.038, w * 0.906, h * 0.924);
  box(ctx, '#7d4432', w * 0.085, h * 0.071, w * 0.83, h * 0.016);
  label(ctx, cafe ? '喫茶 月灯' : '本日の定食', w * 0.5, h * 0.158, w * 0.124, '#3c5143', w * 0.79, serif, '700');
  const entries = cafe ? [['珈琲', '350'], ['紅茶', '350'], ['トースト', '480']]
    : [['焼き魚', '780'], ['カレー', '650'], ['うどん', '550']];
  entries.forEach(([name, price], i) => {
    const y = h * (0.299 + i * 0.133);
    label(ctx, name!, w * 0.335, y, w * 0.082, '#3a5041', w * 0.45, serif);
    label(ctx, `¥${price}`, w * 0.775, y, w * 0.065, '#754b34', w * 0.22, serif);
    line(ctx, '#53644b47', w * 0.003, [[w * 0.135, y + h * 0.053], [w * 0.865, y + h * 0.053]]);
  });
  if (cafe) cup(ctx, w * 0.5, h * 0.765, w * 0.26, '#53654e');
  else {
    ctx.fillStyle = '#52644c'; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.754, w * 0.21, h * 0.069, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = '#74543b'; ctx.lineWidth = w * 0.009;
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.754, w * 0.21, h * 0.025, 0, 0, TAU); ctx.stroke();
    line(ctx, '#74543b', w * 0.012, [[w * 0.35, h * 0.703], [w * 0.75, h * 0.686]]);
  }
  label(ctx, cafe ? '22時まで営業' : 'ごはん・味噌汁付き', w * 0.5, h * 0.895, w * 0.054, '#4d604b', w * 0.8, serif);
};

const awning = (ctx: Ink, w: number, h: number, variant: number) => {
  box(ctx, variant % 2 ? '#2f5d53' : '#793f32', 0, 0, w, h);
  const folds = Math.max(4, Math.round(w / h * 4));
  for (let i = 0; i < folds; i++) {
    const x = i * w / folds;
    box(ctx, '#192f3436', x, 0, w / folds * 0.045, h);
    box(ctx, '#bea98225', x + w / folds * 0.05, 0, w / folds * 0.025, h);
  }
  line(ctx, '#b5a67f84', h * 0.014, [[0, h * 0.88], [w, h * 0.88]]);
  label(ctx, variant % 2 ? '喫茶  月灯' : 'お食事処', w * 0.5, h * 0.54, Math.min(h * 0.4, w * 0.15), '#b6aa80', w * 0.8, serif);
};

/** Static original artwork. Anchors are panel centers; local +Z is the printed side. */
export const addTokyoPropSurfaces = (scene: THREE.Scene, surfaces: readonly TokyoPropSurface[]): void => {
  for (const surface of surfaces) {
    const {kind, width, height, variant} = surface;
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
      throw new Error('Tokyo prop surfaces need finite, positive dimensions.');
    }
    const random = createSeededRandom(seeds[kind] + variant * 101);
    const canvas = document.createElement('canvas');
    const longest = Math.max(width, height);
    canvas.width = Math.max(1, Math.round(width / longest * 768));
    canvas.height = Math.max(1, Math.round(height / longest * 768));
    // CPU rasterization avoids render-order-dependent GPU canvas upload differences.
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw new Error('Tokyo prop artwork needs a 2D canvas.');
    const w = canvas.width, h = canvas.height;
    switch (kind) {
      case 'drinks': drinks(ctx, w, h, variant); break;
      case 'coffee': coffee(ctx, w, h, variant); break;
      case 'locker': locker(ctx, w, h, variant); break;
      case 'poster': poster(ctx, w, h, variant, random); break;
      case 'menu': menu(ctx, w, h, variant); break;
      case 'awning': awning(ctx, w, h, variant); break;
    }
    weather(ctx, w, h, random, kind === 'poster' || kind === 'menu');
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `tokyo-${kind}-${variant}-print`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const brightness = kind === 'drinks' || kind === 'coffee' ? 0.9 : 0.8;
    const material = new THREE.MeshBasicMaterial({
      map: texture, color: new THREE.Color().setScalar(brightness),
      fog: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    panel.name = `tokyo-${kind}-${variant}-surface`;
    panel.position.fromArray(surface.position);
    panel.rotation.y = surface.rotationY ?? 0;
    scene.add(panel);
  }
};
