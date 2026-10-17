/** Builds an offline owner review using the exact Three.js scene used by Remotion. */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const labelIndex = process.argv.indexOf('--label');
const label = labelIndex >= 0 ? process.argv[labelIndex + 1]! : 'TK-01';
if (!/^TK-[0-9]{2}$/.test(label)) throw new Error('Use --label TK-01, TK-02, etc.');
const out = path.resolve(root, outIndex >= 0 ? process.argv[outIndex + 1]! : 'out/review/tokyo-future');
const [model, signs, preset] = await Promise.all([
  readFile(path.join(root, 'public/tokyo/tokyo-city.glb')),
  readFile(path.join(root, 'public/tokyo/tokyo-signs.json'), 'utf8'),
  readFile(path.join(root, 'presets/tokyo-after-rain.json'), 'utf8'),
]);
const script = await build({
  stdin: {
    resolveDir: root, loader: 'ts',
    contents: `
      import {createTokyoScene} from './src/backgrounds/tokyo/scene';
      const props = ${preset};
      const bytes = Uint8Array.from(atob('${model.toString('base64')}'), c => c.charCodeAt(0));
      const modelUrl = URL.createObjectURL(new Blob([bytes], {type:'model/gltf-binary'}));
      const signsUrl = URL.createObjectURL(new Blob([${JSON.stringify(signs)}], {type:'application/json'}));
      const canvas = document.querySelector('canvas');
      const play = document.querySelector('#play');
      const progress = document.querySelector('#progress');
      const time = document.querySelector('#time');
      let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      let frame = 0;
      let previous = 0;
      let remainder = 0;
      let lastDrawn = -1;
      const duration = 720;
      createTokyoScene({canvas,width:1920,height:1080,modelUrl,signsUrl,seed:props.seed}).then(scene => {
        URL.revokeObjectURL(modelUrl); URL.revokeObjectURL(signsUrl);
        document.querySelector('#loading').hidden = true;
        play.disabled = false;
        play.textContent = playing ? 'Pause' : 'Play';
        const draw = () => {
          scene.draw(frame, duration, props);
          progress.value = String(frame);
          time.textContent = (frame / 60).toFixed(1).padStart(4,'0') + ' / 12.0 s';
          lastDrawn = frame;
        };
        draw();
        play.onclick = () => {playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; previous = 0;};
        progress.oninput = () => {playing = false;play.textContent = 'Play';frame = Number(progress.value);draw();};
        document.querySelector('#fullscreen').onclick = () => canvas.requestFullscreen();
        document.addEventListener('visibilitychange', () => {previous = 0;});
        const tick = now => {
          if (playing && !document.hidden) {
            if (previous) {
              remainder += Math.min(now - previous, 100) * 60 / 1000;
              const advance = Math.floor(remainder);
              remainder -= advance;
              frame = (frame + advance) % duration;
            }
            previous = now;
            if (frame !== lastDrawn) draw();
          } else previous = 0;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        window.addEventListener('pagehide', () => scene.dispose(), {once:true});
      }).catch(error => {document.querySelector('#loading').textContent = error.message;});
    `,
  },
  bundle: true, minify: true, write: false, format: 'iife', target: 'es2022',
});
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tokyo After Rain · TK-01</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#080e14;color:#dbe8ed;font:15px system-ui,sans-serif}main{max-width:1680px;margin:auto;padding:32px 32px 64px}header{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:24px}.eyebrow{color:#79b3bf;font:11px ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}h1{font-size:clamp(24px,3vw,44px);font-weight:400;letter-spacing:-.04em;margin:8px 0 0}header p{color:#78939f;font:12px ui-monospace,monospace;margin:0}.scene{position:relative;background:#0c1821;border:1px solid #203540;border-radius:5px;overflow:hidden}canvas{display:block;width:100%;height:auto;aspect-ratio:16/9}canvas:fullscreen{width:100vw;height:100vh;object-fit:contain;background:#000}#loading{position:absolute;inset:0;display:grid;place-items:center;background:#0c1821;font:13px ui-monospace,monospace}#loading[hidden]{display:none}.controls{display:flex;align-items:center;gap:18px;padding:15px 0}button{border:1px solid #31505b;border-radius:3px;background:#13242c;color:#dcecf0;padding:9px 18px;cursor:pointer;font:12px ui-monospace,monospace}button:focus-visible{outline:2px solid #6ee0e5;outline-offset:3px}input{flex:1;accent-color:#7fc9d1}#time{font:12px ui-monospace,monospace;color:#82a1ae;min-width:100px}.notes{border-top:1px solid #24343e;padding-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:44px;color:#93aab5;font-size:14px;line-height:1.7}.notes strong{color:#d0e1e7;font-weight:500}a{color:#81c9d2}figure{margin:32px 0 0}figure img{max-width:100%;border-radius:4px}figcaption{margin-top:10px;color:#8fa7b4;font:12px ui-monospace,monospace}footer{margin-top:28px;color:#657f8b;font-size:12px;line-height:1.7}@media(max-width:700px){main{padding:20px 14px}.notes{grid-template-columns:1fr;gap:4px}header p{display:none}.controls{gap:10px}#time{display:none}}
</style>
<main><header><div><div class="eyebrow">Environment study / 2089</div><h1>Tokyo, after rain.</h1></div><p>TK-01 · 1920 × 1080 · 12 s · 60 fps</p></header>
<section class="scene" aria-label="TK-01 animated empty futuristic Tokyo street"><canvas width="1920" height="1080" aria-label="Animated Tokyo city, no people"></canvas><div id="loading" role="status">Loading the city…</div></section>
<div class="controls"><button id="play" disabled>Loading</button><input id="progress" type="range" min="0" max="719" value="0" aria-label="Frame"><span id="time">00.0 / 12.0 s</span><button id="fullscreen">Full screen</button></div>
<div class="notes"><p><strong>TK-01 · Neon avenue</strong><br>An empty street beneath rain-stained concrete, worn metal and scratched signs. Irregular pools break up the wet asphalt, while low fog settles between the facades and beneath the skybridge.</p><p><strong>Motion study</strong><br>Fine rain, layered fog, drifting steam and gently breathing neon. Cool shadows, warm highlights and restrained film grain give the street a cinematic finish. The scene repeats every 12 seconds. Use the timeline to inspect any frame.</p></div>
<figure><img src="TK-01.png" alt="TK-01 still of the Tokyo city" loading="lazy"><figcaption>TK-01 · Scene study · frame 000 / 720</figcaption></figure>
<footer>Original procedural geometry authored in Blender; animation and reflections in Three.js. No people or imported art assets.<br>Visual research: <a href="https://unsplash.com/photos/tokyo-crosswalk-i0Hh5-BPzy0">Shai Pal / Shinjuku</a> and <a href="https://unsplash.com/it/foto/persone-che-camminano-per-strada-durante-la-notte-995jo39qpI0">Pema G. Lama / Tokyo at night</a>. References informed density and lighting only.<br>Offline animated review</footer></main>
<script>${script.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script></html>`;
await mkdir(out, {recursive: true});
await writeFile(path.join(out, 'index.html'), html.replaceAll('TK-01', label));
console.log(`Tokyo animated review: ${path.join(out, 'index.html')}`);
