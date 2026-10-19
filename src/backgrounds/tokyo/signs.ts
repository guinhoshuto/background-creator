import * as THREE from 'three';
import {createSeededRandom} from '../../loop';
import {ageTokyoSign} from './details';

type SignFace = {text: string; color: string; vertical: boolean; width: number; height: number};
type Finish = 'paint' | 'neon' | 'lightbox' | 'tiles' | 'wayfinding';
const sans = '"Hiragino Sans", "Noto Sans CJK JP", sans-serif';
const serif = '"Hiragino Mincho ProN", "YuMincho", serif';
const captions: Record<string, string> = {
  東京: 'TOKYO', 電子: 'ELECTRONICS', 夜市: 'NIGHT MARKET', 未来: 'MIRAI',
  地下鉄: 'METRO', ホテル: 'HOTEL', 光: 'HIKARI', 珈琲: 'COFFEE',
  喫茶: 'COFFEE', 食堂: 'DINING', 電波: 'RADIO REPAIR', 音楽: 'RECORDS',
};

/** Independent shop identities on the existing mounted panels, with their true aspect ratios. */
export const createTokyoSignFace = (sign: SignFace, index: number) => {
  const random = createSeededRandom(index * 53 + 1709);
  const finish: Finish = /珈琲|喫茶|食堂|東京/.test(sign.text) ? 'paint'
    : sign.text === '地下鉄' ? 'wayfinding'
    : /電子|電波|光/.test(sign.text) ? 'neon'
    : sign.text === '未来' ? 'tiles' : 'lightbox';
  const canvas = document.createElement('canvas');
  canvas.width = sign.vertical ? 256 : 1024;
  canvas.height = Math.round(canvas.width * sign.height / sign.width);
  // Rasterize static lettering on the CPU before uploading it to the scene texture.
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) throw new Error('The city signs need a 2D canvas.');
  const {width: w, height: h} = canvas;
  const short = Math.min(w, h);
  const paintedRed = sign.text === '食堂' || (sign.text === '喫茶' && index % 2 === 1);
  const background = finish === 'paint' ? (paintedRed ? '#572e29' : '#163d38')
    : finish === 'wayfinding' ? '#152e32' : '#081318';
  const ink = finish === 'lightbox' ? '#352820' : finish === 'paint' ? '#dbcfac' : sign.color;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const pad = short * 0.075;
  if (finish === 'lightbox') {
    const backlight = ctx.createLinearGradient(0, 0, w, h);
    backlight.addColorStop(0, '#b9a77d'); backlight.addColorStop(0.5, '#d5bf92'); backlight.addColorStop(1, '#8d795c');
    ctx.fillStyle = backlight;
    ctx.beginPath(); ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, short * 0.075); ctx.fill();
    ctx.fillStyle = '#6a3029';
    ctx.fillRect(pad * 1.6, pad * 1.6, sign.vertical ? w - pad * 3.2 : w * 0.13, short * 0.13);
  } else if (finish === 'paint') {
    // Old enamel has a quiet inset keyline, never the same luminous frame as neon.
    ctx.strokeStyle = '#b5aa7f85'; ctx.lineWidth = short * 0.009;
    ctx.beginPath(); ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, short * 0.16); ctx.stroke();
    ctx.fillStyle = '#c8b98c';
    ctx.beginPath(); ctx.arc(w * (sign.vertical ? 0.5 : 0.12), h * (sign.vertical ? 0.12 : 0.5), short * 0.065, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = background;
    ctx.beginPath(); ctx.arc(w * (sign.vertical ? 0.5 : 0.12), h * (sign.vertical ? 0.12 : 0.5), short * 0.044, 0, Math.PI * 2); ctx.fill();
  } else if (finish === 'neon') {
    // Separate tube runs leave dark gaps; no enclosing, equally bright rectangle.
    ctx.strokeStyle = sign.color; ctx.lineWidth = short * 0.012;
    ctx.globalAlpha = 0.52;
    ctx.beginPath();
    if (sign.vertical) {
      ctx.moveTo(w * 0.13, h * 0.13); ctx.lineTo(w * 0.13, h * 0.72);
      ctx.moveTo(w * 0.87, h * 0.33); ctx.lineTo(w * 0.87, h * 0.87);
    } else {
      ctx.moveTo(w * 0.12, h * 0.82); ctx.lineTo(w * 0.62, h * 0.82);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  } else if (finish === 'wayfinding') {
    ctx.fillStyle = '#588f83';
    ctx.fillRect(pad, pad, sign.vertical ? w - pad * 2 : w * 0.07, sign.vertical ? h * 0.12 : h - pad * 2);
    ctx.fillStyle = '#c7d6b9';
    const x = w * (sign.vertical ? 0.5 : 0.87), y = h * (sign.vertical ? 0.85 : 0.5), s = short * 0.11;
    ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.25); ctx.lineTo(x, y - s * 0.25);
    ctx.lineTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s);
    ctx.lineTo(x, y + s * 0.25); ctx.lineTo(x - s, y + s * 0.25); ctx.closePath(); ctx.fill();
  }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letters = Array.from(sign.text);
  const family = finish === 'paint' || sign.text === 'ホテル' ? serif : sans;
  const size = sign.vertical ? w * (finish === 'neon' ? 0.59 : 0.65) : h * 0.49;
  ctx.font = `${finish === 'neon' ? 400 : finish === 'paint' ? 700 : 600} ${size}px ${family}`;
  const drawLettering = (text: string, x: number, y: number, maximum: number) => {
    ctx.save(); ctx.translate(x, y);
    if (finish === 'paint') ctx.rotate((random() - 0.5) * 0.025);
    ctx.fillStyle = ink;
    if (finish === 'neon') {
      ctx.globalAlpha = 0.72 + random() * 0.25;
      ctx.strokeStyle = sign.color; ctx.lineWidth = short * 0.007;
      ctx.shadowColor = sign.color; ctx.shadowBlur = short * 0.025;
      ctx.strokeText(text, 0, 0, maximum);
      ctx.shadowBlur = 0;
    } else ctx.fillText(text, 0, 0, maximum);
    ctx.restore();
  };
  if (sign.vertical) {
    const top = h * 0.23, span = h * 0.54;
    letters.forEach((letter, i) => {
      const y = top + ((i + 0.5) / letters.length) * span;
      if (finish === 'tiles') {
        ctx.fillStyle = i % 2 ? '#29494c' : '#31423e';
        ctx.fillRect(w * 0.14 + (i % 2) * 3, y - span / letters.length * 0.44, w * 0.72, span / letters.length * 0.86);
      }
      drawLettering(letter, w * 0.5 + (random() - 0.5) * (finish === 'paint' ? 4 : 1.5), y, w * 0.76);
    });
  } else drawLettering(sign.text, w * (finish === 'wayfinding' ? 0.43 : 0.5), h * 0.43, w * 0.68);

  // The secondary type belongs to the shop; it is not a repeated sector label.
  ctx.fillStyle = finish === 'lightbox' ? '#503a2d' : finish === 'wayfinding' ? '#c0cbb5' : '#adbaaa';
  ctx.font = `${finish === 'paint' ? 'italic' : '500'} ${short * (sign.vertical ? 0.074 : 0.115)}px ${finish === 'paint' ? 'serif' : 'sans-serif'}`;
  const caption = captions[sign.text] ?? 'OPEN LATE';
  if (finish !== 'tiles') ctx.fillText(caption, w * 0.5, h * (sign.vertical ? (finish === 'wayfinding' ? 0.78 : 0.86) : 0.74), w * 0.74);
  if (finish === 'paint' && index % 2 === 0) {
    ctx.save(); ctx.translate(w * 0.72, h * 0.93); ctx.rotate(-0.06);
    ctx.fillStyle = '#b5ab85'; ctx.fillRect(-short * 0.13, -short * 0.055, short * 0.26, short * 0.11);
    ctx.fillStyle = '#32413a'; ctx.font = `600 ${short * 0.055}px monospace`; ctx.fillText('24H', 0, 0); ctx.restore();
  }
  ageTokyoSign(ctx, w, h, index);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const brightness = finish === 'neon' ? 1.6 : finish === 'lightbox' ? 0.85 : finish === 'paint' ? 0.85 : 1.05;
  return {texture, brightness};
};
