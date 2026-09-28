import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  BorderFrame, CORNER_STYLES, borderCatalogEntry, borderLoopSchema, getBorderGeometry, getBorderLayout, getBorderMask,
  getBorderMaskElement, getBorderMotion, getBorderScene, getBorderSceneParts, secondLineOptions, TRACK_MAIN, TRACK_SECOND,
  type BorderLoopProps, type CornerElement,
} from '../src/overlays/border';
import {
  STROKE_MOTIONS, filletPath, getStrokeMotion, minBleedFor, perimeterLength, rectContains, rectPath as rectPathOf, roundRectPath, roundRectSdf,
  samplePerimeter,
  type RoundRect, type SegmentElement, type StrokeElement,
} from '../src/overlays/shared';
import type {CatalogEntry} from '../src/catalog';
import {getCompositionMetadata} from '../src/settings';
import {getSize, matchNamedSize, sizeProps, sizesForKind} from '../src/sizes';
import {
  assertDeterministic, assertPeriodic, assertSeamVelocity, assertValidElements, type Sampler, type Scene, type SceneInput,
} from './helpers/scene-scans';
import {OVERLAY_THEMES} from './helpers/themes';

const parse = (input: object): BorderLoopProps => borderLoopSchema.parse(input);
const BORDER_SIZES = sizesForKind('border');
const THEMES = OVERLAY_THEMES;
const presetOf = (theme: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../presets/border-${theme}.json`, import.meta.url), 'utf8'));

/** The literal Root.tsx registers: the composition's defaults, spelled out. */
const ROOT_DEFAULT_PROPS = {
  durationSeconds: 8, seed: 1, transparent: true, backgroundColor: '#0B0620', outputFormat: 'webm', width: 640, height: 360,
  bleed: 48, guides: false, fit: 'window', shape: 'rectangle', mask: false, radius: 16, thickness: 10, fill: 'solid', fillColors: ['#120A38'], fillOpacity: 0.9,
  fillScale: 12, fillSpeed: 24, fillAngle: 45, fillRise: false, fillLight: 0, strokeMotion: 'comets',
  strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'], strokeWidth: 4, dashLength: 18, gapLength: 12, cometSpacing: 640, cometTail: 320, gradientLength: 480,
  strokeSpeed: 160, strokePulses: 1, strokeCore: 0.9, trackOpacity: 0.45, glow: 16, glowPulses: 0, glowStrength: 2.6, halo: 0, haloColor: '#A78BFA',
  rimLight: 0, lines: 2, lineGap: 4, outerLineWidth: 2,
  corners: 'brackets', cornerSize: 28, cornerGap: 6, gemSize: 14, cornerPulses: 1,
  ornaments: 'none', ornamentColors: ['#CFC6E4', '#F6EFD8', '#E8963C'], ornamentSize: 48, ornamentScale: 1, lightning: 0,
};

// ── Schema, sizes and registration ─────────────────────────────────────────────────────────

test('Borda: padrões = visual neon no tamanho webcam-16x9, iguais ao literal do Root', () => {
  const defaults = parse({});
  // The integrator spreads this entry into assetCatalog: it must fit the catalog's contract.
  const entry: CatalogEntry = borderCatalogEntry;
  assert.equal(entry.getLayout, getBorderLayout);
  assert.deepEqual(defaults, ROOT_DEFAULT_PROPS);
  assert.deepEqual(borderLoopSchema.parse(ROOT_DEFAULT_PROPS), defaults);
  assert.deepEqual(borderCatalogEntry.defaultProps, defaults);
  assert.equal(borderCatalogEntry.id, 'BorderLoop');
  assert.equal(borderCatalogEntry.kind, 'border');
  assert.equal(matchNamedSize('border', defaults)?.id, 'webcam-16x9');
  assert.deepEqual(borderCatalogEntry.getLayout(defaults), getBorderLayout(defaults));
  assert.equal(defaults.transparent, true);
  assert.equal(defaults.outputFormat, 'webm');
});

test('Borda: layout de cada tamanho nomeado (arquivo, janela, buraco, bleed respeitado)', () => {
  for (const size of BORDER_SIZES) {
    for (const radius of [0, 16, 200]) {
      for (const corners of CORNER_STYLES) {
        const props = parse({...sizeProps(size), radius, corners});
        const layout = getBorderLayout(props);
        assert.deepEqual(layout.canvas, {width: size.width + 2 * size.bleed, height: size.height + 2 * size.bleed}, size.id);
        assert.deepEqual(layout.box, {x: size.bleed, y: size.bleed, width: size.width, height: size.height});
        assert.ok(layout.hole && rectContains(layout.box, layout.hole), `${size.id}: buraco dentro da caixa`);
        assert.ok(layout.hole.width >= 1 && layout.hole.height >= 1);
        for (const value of [layout.box.x, layout.box.y, layout.box.width, layout.box.height, layout.hole.x, layout.hole.y]) {
          assert.ok(Number.isInteger(value), `${size.id}: px inteiros`);
        }
        assert.ok(layout.outset <= size.bleed, `${size.id} ${corners}: nada passa do bleed`);
        if (size.props?.fit === 'screen') assert.equal(layout.outset, 0);
        else assert.deepEqual(layout.content, layout.box, 'a câmera ocupa a caixa');
        const meta = getCompositionMetadata(props, layout.canvas);
        assert.equal(meta.width % 2, 0);
        assert.equal(meta.height % 2, 0);
      }
    }
  }
});

test('Borda: a seed nunca move o layout, a janela nem os cantos', () => {
  for (const corners of CORNER_STYLES) {
    const a = getBorderGeometry(parse({corners, seed: 1}));
    const b = getBorderGeometry(parse({corners, seed: 999}));
    assert.deepEqual(a, b, corners);
  }
});

test('Borda: presets parseiam estritos em todos os tamanhos e não fixam tamanho', () => {
  for (const theme of THEMES) {
    const preset = presetOf(theme);
    for (const key of ['width', 'height', 'bleed', 'fit', 'guides']) {
      assert.ok(!(key in preset), `border-${theme}: não fixe ${key} (o tamanho nomeado decide)`);
    }
    assert.equal(borderLoopSchema.strict().safeParse(preset).success, true, theme);
    for (const size of BORDER_SIZES) {
      const result = borderLoopSchema.strict().safeParse({...preset, ...sizeProps(size)});
      assert.equal(result.success, true, `border-${theme} em ${size.id}: ${result.error?.issues.map((issue) => issue.message).join(' | ')}`);
    }
  }
});

test('Borda: recusas com a saída em inglês', () => {
  const message = (input: object) => {
    const result = borderLoopSchema.safeParse(input);
    assert.equal(result.success, false, JSON.stringify(input));
    return result.error!.issues.map((issue) => issue.message).join(' | ');
  };
  assert.match(message({width: 641}), /width must be even/);
  assert.match(message({bleed: 47}), /bleed must be even/);
  assert.match(message({width: 3840, height: 2160}), /above the \d+×\d+ limit/);
  assert.match(message({strokeWidth: 12, thickness: 10}), /use strokeWidth ≤ 10 or increase thickness/);
  assert.match(message({lines: 3}), /.+/);
  assert.match(message({corners: 'estrelas'}), /.+/);

  // The band and its glow: the shared message, naming the even bleed that is accepted.
  for (const corners of CORNER_STYLES) {
    const input = {corners, glow: 40};
    const text = message({...input, bleed: 32});
    const wanted = Number(/bleed ≥ (\d+)/.exec(text)![1]);
    assert.match(text, /^The glow goes past the margin: use bleed ≥ \d+ or reduce the glow\.$/);
    assert.equal(wanted, minBleedFor(getBorderGeometry(parse({...input, bleed: 256})).layout.outset));
    assert.equal(borderLoopSchema.safeParse({...input, bleed: wanted}).success, true, `${corners}: bleed ${wanted}`);
    assert.equal(borderLoopSchema.safeParse({...input, bleed: wanted - 2}).success, false);
  }
  // The corners alone reach past the bleed: their own message, same rule.
  for (const [input, pattern] of [
    [{corners: 'brackets', cornerGap: 40}, /^The brackets go past the margin: use bleed ≥ (\d+)/],
    [{corners: 'jewels', gemSize: 80}, /^The gems go past the margin: use bleed ≥ (\d+)/],
  ] as const) {
    const wanted = Number(pattern.exec(message(input))![1]);
    assert.equal(borderLoopSchema.safeParse({...input, bleed: wanted}).success, true);
    assert.equal(borderLoopSchema.safeParse({...input, bleed: wanted - 2}).success, false);
  }

  // Full screen: nothing leaves the file; the corners must stay between the hole and the edge.
  const screen = sizeProps(getSize('fullscreen'));
  assert.match(message({...screen, thickness: 256, glow: 128, width: 400, height: 400}), /leaves no window/);
  const bracketText = message({...screen, corners: 'brackets', cornerGap: 60, glow: 0, lines: 1});
  const maxGap = Number(/cornerGap ≤ (\d+)/.exec(bracketText)![1]);
  assert.match(bracketText, /The brackets would enter the window/);
  assert.equal(borderLoopSchema.safeParse({...screen, corners: 'brackets', cornerGap: maxGap, glow: 0, lines: 1}).success, true);
  assert.match(message({...screen, corners: 'jewels', gemSize: 128, glow: 0, lines: 1, radius: 0}), /The gems do not fit/);

  // Aliasing: refused with the highest usable speed, which is accepted.
  const fast = {strokeMotion: 'dashes', strokeColors: ['#FFFFFF'], dashLength: 2, gapLength: 2, strokeSpeed: 4000};
  const aliasText = message(fast);
  const maxSpeed = Number(/Use strokeSpeed up to ([\d.]+) px\/s/.exec(aliasText)![1]);
  assert.match(aliasText, /Speed too high for the dashes/);
  assert.equal(borderLoopSchema.safeParse({...fast, strokeSpeed: maxSpeed}).success, true);
  const dots = {fill: 'dots', fillScale: 8, fillSpeed: 480, durationSeconds: 1};
  assert.match(message(dots), /Speed too high for the dots/);
});

test('Borda: o gradiente nas duas linhas é recusado uma vez só, com uma velocidade que resolve', () => {
  // The second line is longer than the main one, so it never aliases first; a second refusal
  // would only name a speed the main line still refuses.
  const input = {
    width: 16, height: 16, bleed: 48, strokeMotion: 'gradient', strokeColors: ['#F00', '#0F0'], lines: 2, corners: 'none',
    strokeSpeed: 4000, durationSeconds: 8,
  };
  const issues = borderLoopSchema.safeParse(input).error!.issues;
  assert.equal(issues.length, 1, issues.map((issue) => issue.message).join(' | '));
  const limit = Number(/Use strokeSpeed up to ([\d.]+) px\/s/.exec(issues[0]!.message)![1]);
  assert.equal(borderLoopSchema.safeParse({...input, strokeSpeed: limit}).success, true);
  assert.equal(borderLoopSchema.safeParse({...input, strokeSpeed: limit + 1}).success, false);
});

test('Borda: no gradiente as duas linhas andam juntas, com as mesmas voltas da paleta, em todo tamanho', () => {
  // Where the palette's first colour starts on a line, as a share of its colour period: the
  // first slot's mix is half a slot, so a period holds 0.5 / mix of the line's segments.
  const phaseOf = (segments: SegmentElement[], track: RoundRect) => {
    const first = Math.min(...segments.map((segment) => segment.mix));
    const start = segments.find((segment) => segment.mix === first)!;
    const period = (perimeterLength(track) * 0.5) / first / segments.length;
    return (start.s / period) % 1;
  };
  for (const size of BORDER_SIZES) {
    for (const strokeSpeed of [60, 120, 160]) {
      const props = parse({...sizeProps(size), strokeMotion: 'gradient', lines: 2, strokeSpeed});
      const geometry = getBorderGeometry(props);
      const tracks = [geometry.tracks[TRACK_MAIN]!, geometry.tracks[TRACK_SECOND]!];
      const [mainTrack, secondTrack] = tracks as [RoundRect, RoundRect];
      const label = `${size.id} a ${strokeSpeed} px/s`;
      const main = getStrokeMotion(props, mainTrack);
      const second = getStrokeMotion(props, secondTrack, secondLineOptions(props, geometry));
      assert.ok(main.laps >= 1, label);
      assert.equal(second.count, main.count, label);
      assert.equal(second.laps, main.laps, label);
      if (strokeSpeed !== 160) continue;
      // The drawn lines: over one cycle each palette travels exactly `laps` of its own periods,
      // never more than 0.4 of one per frame, so the unwrapped phases can be summed.
      const travelled = [0, 0];
      let previous: number[] | null = null;
      for (let frame = 0; frame <= 480; frame++) {
        const segments = getBorderSceneParts(props, frame, 480).stroke.filter((element): element is SegmentElement => element.type === 'segment');
        const phases = [TRACK_MAIN, TRACK_SECOND].map((track, index) => phaseOf(segments.filter((segment) => segment.track === track), tracks[index]!));
        if (previous) {
          phases.forEach((phase, index) => {
            const step = phase - previous![index]!;
            travelled[index]! += step - Math.round(step);
          });
        }
        previous = phases;
      }
      for (const total of travelled) assert.ok(Math.abs(Math.abs(total) - main.laps) < 1e-6, `${label}: ${travelled.join(' / ')}`);
      assert.ok(Math.abs(travelled[0]! - travelled[1]!) < 1e-6, `${label}: ${travelled.join(' / ')}`);
    }
  }
});

test('Borda: em tela a caixa é o arquivo, então bleed diferente de 0 é recusado', () => {
  const issues = borderLoopSchema.safeParse({fit: 'screen', width: 1920, height: 1080}).error!.issues;
  assert.deepEqual(issues.map((issue) => [issue.path, issue.message]), [
    [['bleed'], 'On a screen frame the box is the whole file: use bleed 0 (or --size fullscreen / fullscreen-vertical).'],
  ]);
  const screen = parse({fit: 'screen', width: 1920, height: 1080, bleed: 0});
  assert.deepEqual(getBorderLayout(screen).canvas, {width: 1920, height: 1080});
  assert.equal(matchNamedSize('border', screen)?.id, 'fullscreen');
});

// ── The hole stays empty ───────────────────────────────────────────────────────────────────

/** Points along everything a stroke element paints, and its half width. */
const strokeSamples = (element: StrokeElement, track: RoundRect) => {
  switch (element.type) {
    case 'outline':
      return samplePerimeter(track, 0, perimeterLength(track), 4);
    case 'dash':
    case 'segment':
      return samplePerimeter(track, element.s, element.s + element.length, 4);
    case 'comet':
      return samplePerimeter(track, element.s - element.tail - 0.5, element.s, 4);
  }
};

type Painted = {x: number; y: number; reach: number; what: string};

/** Every painted point of a scene with how far paint reaches around it (half a width, a gem's tip). */
const paintedPoints = (props: BorderLoopProps, frame: number): Painted[] => {
  const {geometry, stroke, corners} = getBorderSceneParts(props, frame, 480);
  const points: Painted[] = [];
  for (const element of stroke) {
    for (const point of strokeSamples(element, geometry.tracks[element.track]!)) {
      points.push({...point, reach: element.width / 2, what: `${element.type}@${element.track}`});
    }
  }
  for (const element of corners as CornerElement[]) {
    if (element.type === 'bracket') {
      const track = geometry.tracks[element.track]!;
      for (const point of samplePerimeter(track, element.s, element.s + element.length, 2)) {
        points.push({...point, reach: element.width / 2, what: 'colchete'});
      }
    } else {
      points.push({x: element.x, y: element.y, reach: element.size / 2, what: 'joia'});
    }
  }
  return points;
};

test('Borda: nada entra no buraco e nada sai do bleed, em todo tamanho nomeado e todo movimento', () => {
  for (const size of BORDER_SIZES) {
    for (const radius of [0, 24, 200]) {
      for (const lines of [1, 2]) {
        for (const strokeMotion of STROKE_MOTIONS) {
          const corners = CORNER_STYLES[(STROKE_MOTIONS.indexOf(strokeMotion) + lines) % CORNER_STYLES.length]!;
          const props = parse({...sizeProps(size), radius, lines, strokeMotion, corners, strokePulses: 2, cornerPulses: 2});
          const {layout} = getBorderGeometry(props);
          for (const frame of [0, 173]) {
            for (const point of paintedPoints(props, frame)) {
              const label = `${size.id} r${radius} ${lines} linha(s) ${strokeMotion} ${point.what} (${point.x}, ${point.y})`;
              const clearance = roundRectSdf(layout.holeShape, point.x, point.y);
              assert.ok(clearance >= point.reach - 1e-6, `${label}: a ${clearance} px do buraco`);
              if (layout.fit === 'window') {
                // The glow spreads `glow` px beyond the paint; all of it must stay in the file.
                const margin = point.reach + props.glow - 1e-6;
                assert.ok(point.x - margin >= 0 && point.y - margin >= 0
                  && point.x + margin <= layout.canvas.width && point.y + margin <= layout.canvas.height, `${label}: dentro do arquivo`);
              } else {
                const box = layout.box;
                assert.ok(point.x - point.reach >= box.x - 1e-6 && point.y - point.reach >= box.y - 1e-6
                  && point.x + point.reach <= box.x + box.width + 1e-6
                  && point.y + point.reach <= box.y + box.height + 1e-6, `${label}: dentro da tela`);
              }
            }
          }
        }
      }
    }
  }
});

test('Borda: webcam-square com raio 200 vira redonda, com joias e colchetes fora do círculo', () => {
  for (const corners of ['brackets', 'jewels'] as const) {
    const props = parse({...sizeProps(getSize('webcam-square')), radius: 200, corners});
    const {layout, tracks} = getBorderGeometry(props);
    assert.equal(layout.window.radius, 200);
    assert.equal(tracks[0].radius, 205);
    for (const frame of [0, 97, 311]) {
      const {corners: elements} = getBorderSceneParts(props, frame, 480);
      assert.equal(elements.length, 4);
      for (const point of paintedPoints(props, frame)) {
        assert.ok(roundRectSdf(layout.holeShape, point.x, point.y) >= point.reach - 1e-6, `${corners} ${point.what}`);
      }
    }
  }
  // Four quarter arcs would close into a ring: the brackets leave gaps between them.
  const round = getBorderGeometry(parse({...sizeProps(getSize('webcam-square')), radius: 200, corners: 'brackets'}));
  const spacing = perimeterLength(round.tracks[2]) / 4;
  for (const bracket of round.brackets) assert.ok(2 * bracket.half <= 0.7 * spacing + 1e-9);
});

// ── Rendering ──────────────────────────────────────────────────────────────────────────────

const render = (props: BorderLoopProps, frame = 0) =>
  renderToStaticMarkup(createElement(BorderFrame, {props, frame, durationInFrames: 480}));

/** Index just past the `</g>` closing the `<g` that opens at `start`. */
const closingOf = (markup: string, start: number) => {
  const tags = /<g[\s>]|<\/g>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(markup); match; match = tags.exec(markup)) {
    depth += match[0] === '</g>' ? -1 : 1;
    if (depth === 0) return match.index + 4;
  }
  throw new Error('grupo sem fechamento');
};

test('Borda: a máscara do buraco cobre tudo o que é desenhado, em todo tamanho e movimento', () => {
  for (const size of BORDER_SIZES) {
    for (const strokeMotion of STROKE_MOTIONS) {
      for (const radius of [0, 200]) {
        // With a halo too: it spreads outwards, still inside the masked group.
        const props = parse({...sizeProps(size), strokeMotion, radius, fill: 'sparkles', corners: radius ? 'jewels' : 'brackets', halo: 16});
        const {layout, band} = getBorderGeometry(props);
        const markup = render(props, 211);
        const svg = /<svg width="(\d+)" height="(\d+)" viewBox="0 0 \d+ \d+"[^>]*>([\s\S]*)<\/svg>/.exec(markup);
        assert.ok(svg, 'um SVG do tamanho do arquivo');
        assert.deepEqual([Number(svg[1]), Number(svg[2])], [layout.canvas.width, layout.canvas.height], size.id);
        const inner = svg[3]!;
        assert.doesNotMatch(markup, /mix-blend-mode|NaN|Infinity|undefined|data-guides/);
        // The hole is black in the mask, and the masked group holds everything up to the end.
        assert.ok(inner.includes(`d="${roundRectPath(layout.holeShape)}" fill="#000000"`), 'o buraco é preto na máscara');
        assert.ok(inner.startsWith('<g><defs><mask id="border-frame-hole" maskUnits="userSpaceOnUse" x="0" y="0"'));
        const masked = inner.indexOf('<g mask="url(#border-frame-hole)">');
        assert.ok(masked > 0);
        const outerClose = closingOf(inner, 0);
        assert.equal(outerClose, inner.length, `${size.id}: nada é desenhado fora do grupo da moldura`);
        const tail = inner.slice(closingOf(inner, masked));
        assert.equal(tail, layout.fit === 'screen' ? '</g></g>' : '</g>', `${size.id}: nada depois do grupo mascarado`);
        assert.equal(inner.includes('clip-path="url(#border-frame-box)"'), layout.fit === 'screen');
        // The fill is clipped to the band without the window and, on a screen, to the file's corners.
        assert.ok(inner.includes(`d="${roundRectPath(band)}${roundRectPath(layout.window)}" clip-rule="evenodd"`));
        assert.equal(inner.includes(`d="${filletPath(layout)}" clip-rule="evenodd"`), layout.fit === 'screen');
        assert.match(inner, /filterUnits="userSpaceOnUse" x="0" y="0"/);
      }
    }
  }
  // Transparent by default on the alpha formats; MP4 composites over backgroundColor.
  assert.match(render(parse({})), /background-color:transparent/);
  assert.match(render(parse({outputFormat: 'mp4', backgroundColor: '#123456'})), /background-color:#123456/);
  assert.match(render(parse({guides: true})), /data-guides/);
});

test('Borda: em volta de uma janela os cantos da caixa são foscos, para a câmera ficar arredondada', () => {
  for (const theme of THEMES) {
    for (const size of BORDER_SIZES) {
      const props = parse({...presetOf(theme), ...sizeProps(size)});
      const {layout} = getBorderGeometry(props);
      const markup = render(props);
      const matte = new RegExp(`<path d="${filletPath(layout).replace(/[.]/g, '\\.')}" fill-rule="evenodd" fill="${props.fillColors[0]}" data-matte="true"></path>`);
      if (layout.fit === 'window' && props.shape === 'circle') {
        // A round webcam: the band never reaches the box's corners, so the mask rounds the camera
        // and the band keeps the fill's own translucency all the way round.
        assert.doesNotMatch(markup, /data-matte/, `${theme} ${size.id}: o anel redondo fica translúcido`);
      } else if (layout.fit === 'window') {
        // Opaque: no opacity on the path, and no group around it but the band's clip.
        assert.match(markup, matte, `${theme} ${size.id}`);
        assert.match(markup, /<g clip-path="url\(#border-band-clip\)"><path [^>]*data-matte="true"><\/path>/, `${theme} ${size.id}`);
      } else {
        assert.doesNotMatch(markup, /data-matte/, `${theme} ${size.id}: numa tela não há câmera nos cantos`);
      }
    }
  }
});

test('Borda: a moldura nunca passa do próprio contorno; até raio (1 + √2)·espessura ela cobre os cantos da câmera', () => {
  const bandClip = (markup: string) => /<clipPath id="border-band-clip"[^>]*>([\s\S]*?)<\/clipPath>/.exec(markup)![1]!;
  for (const theme of THEMES) {
    for (const size of BORDER_SIZES.filter((entry) => entry.props?.fit !== 'screen')) {
      const thickness = Number(presetOf(theme).thickness);
      const limit = (1 + Math.SQRT2) * thickness;
      for (const radius of [0, 16, Math.floor(limit), Math.ceil(limit) + 1, 200]) {
        const props = parse({...presetOf(theme), ...sizeProps(size), radius});
        const {layout, band} = getBorderGeometry(props);
        const label = `${theme} ${size.id} r${radius}`;
        // The matte and the fill share one clip, and it is the band ring alone: nothing of the
        // frame is ever painted outside the band's outer edge.
        assert.equal(bandClip(render(props)), `<path d="${roundRectPath(band)}${roundRectPath(layout.window)}" clip-rule="evenodd"></path>`, label);
        // A camera as big as the box has its corners under the band exactly up to that radius.
        const corners = [[layout.box.x, layout.box.y], [layout.box.x + layout.box.width, layout.box.y + layout.box.height]] as const;
        const covered = corners.every(([x, y]) => roundRectSdf(band, x, y) <= 1e-9);
        assert.equal(covered, layout.window.radius <= limit + 1e-9, label);
        // The matte is drawn exactly while it rounds the camera off.
        assert.equal(/data-matte/.test(render(props)), covered, `${label}: fosco só enquanto cobre os cantos`);
      }
    }
  }
  // The round webcam: the box's corner (where a cream square used to show) is outside the band.
  const round = parse({...presetOf('pastel'), ...sizeProps(getSize('webcam-square')), radius: 200});
  const {layout, band} = getBorderGeometry(round);
  assert.ok(roundRectSdf(band, layout.box.x, layout.box.y) > 40);
});

// ── The OBS mask ───────────────────────────────────────────────────────────────────────────

const maskOf = (input: object) => parse(getBorderMask(parse(input))!);

test('Máscara: cada tamanho de janela tem a sua, do tamanho da câmera, com a janela branca e opaca', () => {
  assert.equal(parse({}).mask, false);
  for (const size of BORDER_SIZES) {
    for (const radius of [0, 16, 200, 999]) {
      const frame = parse({...sizeProps(size), radius});
      const maskProps = getBorderMask(frame);
      if (size.props?.fit === 'screen') {
        assert.equal(maskProps, null, `${size.id}: a tela não precisa de máscara`);
        continue;
      }
      const props = parse(maskProps!);
      const window = getBorderGeometry(frame).layout.window;
      assert.deepEqual(maskProps, {
        width: size.width, height: size.height, shape: size.props?.shape, radius: window.radius, fit: 'window', mask: true, bleed: 0,
        outputFormat: 'png', transparent: true,
      });
      assert.equal(borderLoopSchema.strict().safeParse(maskProps).success, true);
      const layout = getBorderLayout(props);
      assert.deepEqual(layout, {
        canvas: {width: size.width, height: size.height}, box: {x: 0, y: 0, width: size.width, height: size.height},
        content: {x: 0, y: 0, width: size.width, height: size.height}, outset: 0,
      });
      assert.equal(getBorderMask(props), null, 'uma máscara não tem máscara');
      const markup = render(props);
      const svg = /<svg width="(\d+)" height="(\d+)"[^>]*>([\s\S]*)<\/svg>/.exec(markup)!;
      assert.deepEqual([Number(svg[1]), Number(svg[2])], [size.width, size.height]);
      // One shape, the window at (0, 0) with the frame's clamped radius, opaque white on transparency.
      assert.equal(svg[3], `<path d="${roundRectPath({x: 0, y: 0, width: size.width, height: size.height, radius: window.radius})}" fill="#FFFFFF" data-mask="true"></path>`);
      assert.match(markup, /background-color:transparent/);
      assert.equal(matchNamedSize('border', props)?.id, size.id);
    }
  }
  // A round webcam's mask is a circle.
  const circle = maskOf({...sizeProps(getSize('webcam-square')), radius: 200});
  assert.deepEqual(getBorderMaskElement(circle), {
    type: 'mask-window', x: 0, y: 0, width: 400, height: 400, corner: 200, color: '#FFFFFF', opacity: 1,
  });
});

test('Máscara: a mesma em todos os temas para o mesmo tamanho e raio', () => {
  for (const size of BORDER_SIZES.filter((entry) => entry.props?.fit !== 'screen')) {
    const masks = THEMES.map((theme) => getBorderMask(parse({...presetOf(theme), ...sizeProps(size), radius: 20})));
    for (const mask of masks) assert.deepEqual(mask, masks[0], size.id);
    const renders = THEMES.map((theme) => render(maskOf({...presetOf(theme), ...sizeProps(size), radius: 20})));
    for (const markup of renders) assert.equal(markup, renders[0], size.id);
  }
});

test('Máscara: só janela, sem bleed, em PNG e transparente; recusas com a saída em inglês', () => {
  const mask = {...sizeProps(getSize('webcam-16x9')), mask: true, bleed: 0, outputFormat: 'png'};
  assert.equal(borderLoopSchema.safeParse(mask).success, true);
  const messages = (input: object) => borderLoopSchema.safeParse(input).error!.issues.map((issue) => [issue.path.join('.'), issue.message]);
  assert.deepEqual(messages({...mask, bleed: 48}), [
    ['bleed', 'In the mask the file is the window itself, the size of the camera: use bleed 0 (with --size, add --bleed 0).'],
  ]);
  assert.deepEqual(messages({...mask, outputFormat: 'webm'}), [['outputFormat', 'The mask is a still image: export it as PNG (--format png).']]);
  assert.deepEqual(messages({...mask, transparent: false}), [['transparent', 'The mask needs a transparent background: use transparent true.']]);
  assert.deepEqual(messages({...sizeProps(getSize('fullscreen')), mask: true, outputFormat: 'png'}), [
    ['fit', 'The mask only applies to fit window: in a screen frame the window fills the whole screen and needs no mask.'],
  ]);
  // The frame's own refusals do not apply: nothing of it is drawn (a glow far past the missing bleed).
  assert.equal(borderLoopSchema.safeParse({...mask, glow: 128, corners: 'brackets', cornerGap: 128}).success, true);
});

// A mask is one still PNG: nothing moves, so the generic scans run with `moving: false` (frame N is
// frame 0 and no frame differs) and without the seed check, instead of faking a motion.
{
  const sample: Sampler = (scene: SceneInput, frame: number, length: number): Scene =>
    getBorderScene(parse({
      ...getBorderMask(parse(presetOf('neon')))!, seed: scene.seed ?? 1,
      ...(scene.durationSeconds === undefined ? {} : {durationSeconds: scene.durationSeconds}),
    }), frame, length);
  const label = 'BorderLoop máscara';
  test(`${label}: a seed não muda nada e a cena é sempre a mesma`, () => {
    assertDeterministic(label, sample, {seeded: false});
    assert.deepEqual(sample({seed: 7}, 0, 480), sample({seed: 8}, 311, 480));
  });
  test(`${label}: o ciclo fecha em N (imagem parada)`, () => assertPeriodic(label, sample, {moving: false}));
  test(`${label}: velocidade contínua na emenda`, () => assertSeamVelocity(label, sample));
  test(`${label}: dimensões e opacidades válidas`, () => assertValidElements(label, sample));
  test(`${label}: sem velocidade para relatar`, () => {
    assert.deepEqual(getBorderMotion(maskOf(presetOf('neon'))), {strokeSpeed: 0, fillSpeed: 0});
  });
}

test('Borda: o vão entre a faixa e a segunda linha fica vazio, na janela e na tela', () => {
  for (const size of [getSize('webcam-16x9'), getSize('fullscreen')]) {
    for (const radius of [0, 24]) {
      const props = parse({...sizeProps(size), radius, lines: 2, lineGap: 8, fill: 'solid'});
      const {layout, band} = getBorderGeometry(props);
      // The fill's clip is the band ring (plus filletPath on a screen): a point in the middle of the gap is in neither.
      const gap = {x: layout.box.x + layout.box.width / 2, y: layout.window.y - props.thickness - props.lineGap / 2};
      const inRing = roundRectSdf(band, gap.x, gap.y) <= 0 && roundRectSdf(layout.window, gap.x, gap.y) > 0;
      const cornerShape = layout.fit === 'window' ? layout.window : layout.outer;
      const inCorners = gap.x >= layout.box.x && gap.x <= layout.box.x + layout.box.width
        && gap.y >= layout.box.y && gap.y <= layout.box.y + layout.box.height && roundRectSdf(cornerShape, gap.x, gap.y) > 0;
      assert.equal(inRing || inCorners, false, `${size.id} r${radius}`);
      assert.equal(filletPath(layout), `${rectPathOf(layout.box)}${roundRectPath(cornerShape)}`);
      assert.equal(render(props).includes(`d="${filletPath(layout)}" clip-rule="evenodd"`), layout.fit === 'screen');
    }
  }
});

test('Borda: os brilhos cobrem a faixa com a mesma densidade em todo tamanho', () => {
  for (const theme of ['pastel', 'halloween']) {
    // Embers come and go at their own places, so their count on the band is averaged over the cycle.
    const FRAMES = [0, 60, 120, 180, 240, 300, 360, 420];
    const perSpark = (sizeId: string) => {
      const props = parse({...presetOf(theme), ...sizeProps(getSize(sizeId))});
      let onFrame = 0;
      for (const frame of FRAMES) {
        const {geometry, fill} = getBorderSceneParts(props, frame, 480);
        const {band, layout} = geometry;
        const sparks = fill.filter((element) => element.type === 'spark');
        onFrame += sparks.filter(({x, y}) => roundRectSdf(layout.window, x, y) >= 0
          // The band itself: around a window the fill is clipped to it (a round window's box corners
          // lie beyond it), and a screen's corners outside it are too small to count.
          && roundRectSdf(band, x, y) <= 0).length;
        if (!props.fillRise) {
          // Sparkles in place that could never reach the frame are not even listed: kept by their
          // resting place, a disc within its reach plus one orbit, so the centre, one orbit off it,
          // lies within the reach plus two orbits.
          const reach = 2.5 * 0.2 * props.fillScale + 2 * 0.15 * props.fillScale;
          for (const {x, y} of sparks) assert.ok(roundRectSdf(layout.window, x, y) >= -reach - 1e-6, `${theme} ${sizeId}: brilho na janela`);
        }
      }
      return (perimeterLength(getBorderGeometry(props).tracks[0]) * FRAMES.length) / onFrame;
    };
    const reference = perSpark('webcam-16x9');
    for (const size of BORDER_SIZES) {
      const spacing = perSpark(size.id);
      assert.ok(spacing > 0.75 * reference && spacing < 1.33 * reference, `${theme} ${size.id}: um brilho a cada ${spacing} px (webcam: ${reference})`);
    }
  }
});

// ── Generic scans ──────────────────────────────────────────────────────────────────────────

type Case = {id: string; input: object; moving?: boolean; seeded?: boolean};

const CASES: Case[] = [
  {id: 'padrão (neon)', input: {}},
  ...THEMES.map((theme) => ({id: `preset ${theme}`, input: presetOf(theme)})),
  ...THEMES.map((theme) => ({id: `preset ${theme} em fullscreen`, input: {...presetOf(theme), ...sizeProps(getSize('fullscreen'))}})),
  {id: 'webcam-square redonda com joias', input: {...sizeProps(getSize('webcam-square')), radius: 200, corners: 'jewels'}},
  {id: 'fullscreen-vertical com colchetes', input: {...sizeProps(getSize('fullscreen-vertical')), corners: 'brackets', lines: 2}},
  ...STROKE_MOTIONS.map((strokeMotion) => ({id: `movimento ${strokeMotion}`, input: {strokeMotion, lines: 2, strokePulses: 3}})),
  {id: 'formigas de 3 cores, sem cantos', input: {strokeMotion: 'dashes', corners: 'none', lines: 1, strokeSpeed: 300}},
  {id: 'gradiente nas duas linhas', input: {strokeMotion: 'gradient', corners: 'none', lines: 2, glowPulses: 2}},
  {id: 'listras na faixa grossa', input: {fill: 'stripes', fillColors: ['#0B0620', '#22D3EE'], thickness: 24, glow: 8}},
  {
    id: 'parada',
    input: {strokeMotion: 'still', strokeColors: ['#22D3EE'], corners: 'none', lines: 1, glowPulses: 0},
    moving: false,
    seeded: false,
  },
];

for (const {id, input, moving, seeded} of CASES) {
  const sample: Sampler = (scene: SceneInput, frame: number, length: number): Scene =>
    getBorderScene(parse({...input, ...scene}), frame, length);
  const label = `BorderLoop ${id}`;
  test(`${label}: seed e frame determinam a cena`, () => assertDeterministic(label, sample, {seeded: seeded ?? true}));
  test(`${label}: o ciclo fecha em N para 50/60 fps e durações quebradas`, () => assertPeriodic(label, sample, {moving: moving ?? true}));
  test(`${label}: velocidade contínua na emenda`, () => assertSeamVelocity(label, sample));
  test(`${label}: dimensões e opacidades válidas`, () => assertValidElements(label, sample));
}

test('Borda: a cena padrão passa na mesma varredura do registro genérico (frame 137 ≠ 180)', () => {
  const sample = (seed: number, frame: number) => getBorderScene(parse({seed}), frame, 480);
  assert.notDeepEqual(sample(42, 180), sample(42, 137));
  assert.notDeepEqual(sample(43, 137), sample(42, 137));
});

test('Borda: o halo sai da borda externa para o bleed, só em volta de uma janela', () => {
  const size = getSize('webcam-16x9');
  const props = parse({...sizeProps(size), corners: 'none', halo: 24});
  const {layout, totalThickness} = getBorderGeometry(props);
  assert.equal(layout.outset, totalThickness + 24);
  const markup = render(props, 60);
  // Blurred from the frame's outer edge and masked out of it, so nothing of it lands on the band or the window.
  assert.ok(markup.includes(`d="${roundRectPath(layout.outer)}" fill="#000000"`), 'o halo é mascarado fora da moldura');
  assert.equal(getBorderSceneParts(props, 60, 480).halo.length, 1);
  // Beyond the bleed it is refused with the bleed that holds it, which is accepted.
  const wide = {...sizeProps(size), corners: 'none', halo: 40};
  const issues = borderLoopSchema.safeParse(wide).error!.issues;
  assert.deepEqual(issues.map((issue) => issue.message), [`The glow goes past the margin: use bleed ≥ ${totalThickness + 40} or reduce the glow.`]);
  assert.equal(borderLoopSchema.safeParse({...wide, bleed: totalThickness + 40}).success, true);
  // A screen frame has no bleed to spread into: no halo, nothing outside the box.
  const screen = parse({...sizeProps(getSize('fullscreen')), halo: 24});
  assert.deepEqual(getBorderSceneParts(screen, 60, 480).halo, []);
  assert.equal(getBorderLayout(screen).outset, 0);
  // Every preset's halo fits every window size (the presets test parses them all).
  for (const theme of THEMES) {
    const themed = parse({...presetOf(theme), ...sizeProps(size)});
    assert.ok(getBorderLayout(themed).outset <= size.bleed, theme);
  }
});
