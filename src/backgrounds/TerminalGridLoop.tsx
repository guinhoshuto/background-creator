import {zColor} from '@remotion/zod-types';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';

/**
 * A sand-coloured terminal screen: a radial sand gradient lit a little above the centre, a 1 px
 * line grid that fades out towards the edges, scanlines, a fine grain, an inset vignette, dust
 * drifting up and, a few times per loop, a shake with a flash of corrupted bands. Drawn from the
 * measurements of the old sand-terminal HTML pack (v3, `nier3.css`); every value below that is
 * not a control is that pack's.
 *
 * The original stacked grain and scanlines with `mix-blend-mode: multiply`; here they are plain
 * dark alpha (no blend mode in a background: README, Known pitfalls). Its dust wrapped from the top
 * of the screen to the bottom at 2.4-15.6 px/s, which no loop can close: here each speck lives a
 * whole number of times per loop, fading in, drifting and fading out, and respawns while unseen.
 */

const terminalGridFields = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#9D9885'),
  colors: baseBackgroundSchema.shape.colors.default(['#C9C4B0', '#B8B3A0', '#9D9885']),
  inkColor: zColor().default('#45423A'),
  gridSize: z.number().finite().min(8).max(160)
    .describe('Grid cell, in pixels: the distance between neighbouring grid lines')
    .default(26),
  gridOpacity: z.number().finite().min(0).max(1)
    .describe('Opacity of the 1 px grid lines in the middle of the screen; they fade out towards the edges; 0 hides the grid')
    .default(0.11),
  scanlines: z.number().finite().min(0).max(1)
    .describe('Opacity of the dark 1 px scanlines, one every 4 pixels; 0 hides them')
    .default(0.026),
  grain: z.number().finite().min(0).max(1)
    .describe('Opacity of the fine grain over the whole screen; 0 hides it')
    .default(0.05),
  vignette: z.number().finite().min(0).max(2)
    .describe('Strength of the darkening along the edges (1 = the original); 0 turns it off')
    .default(1),
  dustCount: z.number().int().min(0).max(240)
    .describe('Dust specks drifting up across the screen')
    .default(60),
  glitches: z.number().int().min(0).max(6)
    .describe('Shakes per cycle, some with a flash of corrupted bands, at seeded moments away from the loop seam; 0 keeps the screen still')
    .default(3),
});

export const terminalGridLoopSchema = terminalGridFields;
export type TerminalGridLoopProps = z.infer<typeof terminalGridFields>;

export const WIDTH = 1920;
export const HEIGHT = 1080;

export type DustElement = {kind: 'dust'; x: number; y: number; size: number; opacity: number};
export type GlitchElement = {kind: 'glitch'; shakeX: number; shakeY: number; corruptX: number; corrupt: number; opacity: number};
export type TerminalGridElement = DustElement | GlitchElement;

/** Dust: side, peak alpha, rise and sideways drift (px/s), as the original's per-frame values at 60 Hz. */
const DUST = {size: [0.4, 2.1], alpha: [0.1, 0.5], rise: [2.4, 15.6], drift: 4.8} as const;
/** Lives per loop: a speck is seen 1 to 3 times per cycle. */
const DUST_LIVES = 3;
/** Where in its life a speck is at the seam: away from 0 and 1, so no respawn falls on it. */
const DUST_SEAM_PHASE = [0.15, 0.85] as const;

/** The shake's four poses (px) and the corrupt flash's three (opacity, x shift), each held for an equal share of the event. */
const SHAKE_POSES: readonly (readonly [number, number])[] = [[-4, 1], [3, -2], [-2, 2], [0, 0]];
const CORRUPT_POSES: readonly (readonly [number, number])[] = [[0.9, 8], [0.25, -6], [0, 0]];
const SHAKE_SECONDS = 0.3;
const CORRUPT_SECONDS = 0.34;
/** The share of glitches that also flash the corrupted bands. */
const CORRUPT_SHARE = 0.45;
/** Glitches start inside this share of the cycle, so none reaches the seam. */
const GLITCH_WINDOW = [0.08, 0.9] as const;
/** At most one glitch per this many seconds of cycle: a short loop shakes less. */
const GLITCH_SPACING = 2.5;

const fract = (value: number) => value - Math.floor(value);

/** The seconds at which each glitch starts and whether it flashes, from the seed (whole cycle, away from the seam). */
export const getGlitchStarts = (props: Pick<TerminalGridLoopProps, 'seed' | 'glitches' | 'durationSeconds'>) => {
  const count = Math.min(props.glitches, Math.floor(props.durationSeconds / GLITCH_SPACING));
  const random = createSeededRandom(props.seed + 307);
  const [from, to] = GLITCH_WINDOW;
  // One slot per glitch, each placed at random inside its slot: never two at once.
  return Array.from({length: count}, (_, index) => {
    const slot = (to - from) / count;
    const start = from + slot * index + randomBetween(random, 0.1, 0.6) * slot;
    const corrupt = random() < CORRUPT_SHARE;
    return {start: start * props.durationSeconds, corrupt};
  });
};

const poseAt = <T,>(poses: readonly T[], elapsed: number, seconds: number): T | null =>
  elapsed >= 0 && elapsed < seconds ? poses[Math.min(poses.length - 1, Math.floor((elapsed / seconds) * poses.length))]! : null;

/**
 * Every animated value: the dust, listed by speck, and one glitch element. A speck lives k times per
 * cycle (k from 1 to DUST_LIVES); each life starts at its own seeded spot, fades in and out along
 * sin(π·u) while drifting at a constant speed, so position and opacity are smooth everywhere but at
 * a respawn, and the seed keeps every respawn off the seam.
 */
export const getTerminalGridScene = (
  props: TerminalGridLoopProps,
  frame: number,
  durationInFrames: number,
): TerminalGridElement[] => {
  const cycle = loopPhase(frame, durationInFrames) / TAU;
  const random = createSeededRandom(props.seed + 61);
  const dust = Array.from({length: props.dustCount}, (): DustElement => {
    // Every speck draws all its values, lives included, so the count never shifts another's.
    const size = randomBetween(random, DUST.size[0], DUST.size[1]);
    const alpha = randomBetween(random, DUST.alpha[0], DUST.alpha[1]);
    const rise = randomBetween(random, DUST.rise[0], DUST.rise[1]);
    const drift = randomBetween(random, -DUST.drift, DUST.drift);
    const lives = 1 + Math.floor(random() * DUST_LIVES);
    const seam = randomBetween(random, DUST_SEAM_PHASE[0], DUST_SEAM_PHASE[1]);
    const spawns = Array.from({length: DUST_LIVES}, () => ({x: random() * WIDTH, y: random() * HEIGHT}));
    const along = lives * cycle + seam;
    const life = Math.floor(along) % lives;
    const u = fract(along);
    const seconds = (u * props.durationSeconds) / lives;
    const spawn = spawns[life]!;
    return {
      kind: 'dust',
      x: spawn.x + drift * seconds,
      y: spawn.y - rise * seconds,
      size,
      opacity: alpha * Math.sin(Math.PI * u),
    };
  });
  const time = cycle * props.durationSeconds;
  let glitch: GlitchElement = {kind: 'glitch', shakeX: 0, shakeY: 0, corruptX: 0, corrupt: 0, opacity: 1};
  for (const {start, corrupt} of getGlitchStarts(props)) {
    const shake = poseAt(SHAKE_POSES, time - start, SHAKE_SECONDS);
    const flash = corrupt ? poseAt(CORRUPT_POSES, time - start, CORRUPT_SECONDS) : null;
    if (shake || flash) {
      glitch = {...glitch, shakeX: shake?.[0] ?? 0, shakeY: shake?.[1] ?? 0, corrupt: flash?.[0] ?? 0, corruptX: flash?.[1] ?? 0};
    }
  }
  return [...dust, glitch];
};

/** The inset shadow's darkness at `distance` px from an edge, for a blur of `blur` px: a Gaussian edge (σ = blur / 2), half at the edge. */
const insetShadow = (distance: number, blur: number) => {
  // Abramowitz-Stegun erfc, accurate to 1e-7: plenty for an 8-bit gradient stop.
  const z = (2 * distance) / blur / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return erfc / 2;
};

/** The original vignette: inset 340 px at .48 and inset 80 px at .2, as one band profile from an edge inwards. */
const VIGNETTE = [{blur: 340, alpha: 0.48}, {blur: 80, alpha: 0.2}] as const;
const VIGNETTE_DEPTH = 360;
const VIGNETTE_STOPS = 13;
/** Its colour: the original's rgba(52, 50, 43). */
const VIGNETTE_COLOR = '#34322B';

/** The corrupted bands: dark 3 px every 9 px, light 4 px bars every 260 px from x 120. */
const CORRUPT = {dark: '#34322B', darkAlpha: 0.55, light: '#DCD8C4', lightAlpha: 0.35} as const;

const n = (value: number) => Number(value.toFixed(3));

export const TerminalGridLoop = (props: TerminalGridLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getTerminalGridScene(props, frame, durationInFrames);
  const glitch = scene[scene.length - 1] as GlitchElement;
  const dust = scene.slice(0, -1) as DustElement[];
  const opaque = !hasTransparentBackground(props);
  const [centre, middle = centre, edge = middle] = [props.colors[0]!, props.colors[1], props.colors[props.colors.length - 1]];
  const cell = props.gridSize;
  let grid = '';
  for (let x = 0; x <= WIDTH; x += cell) grid += `M${x + 0.5} 0V${HEIGHT}`;
  for (let y = 0; y <= HEIGHT; y += cell) grid += `M0 ${y + 0.5}H${WIDTH}`;
  const vignetteStops = Array.from({length: VIGNETTE_STOPS}, (_, index) => {
    const distance = (index / (VIGNETTE_STOPS - 1)) * VIGNETTE_DEPTH;
    const alpha = VIGNETTE.reduce((sum, layer) => sum + layer.alpha * insetShadow(distance, layer.blur), 0);
    return {offset: distance / VIGNETTE_DEPTH, alpha: Math.min(1, alpha * props.vignette)};
  });
  const bands: [string, number, number, number, number][] = [
    ['top', 0, 0, 0, 1], ['bottom', 0, 1, 0, 0], ['left', 0, 0, 1, 0], ['right', 1, 0, 0, 0],
  ];
  let darkBands = '';
  for (let y = 0; y < HEIGHT; y += 9) darkBands += `M0 ${y}h${WIDTH}v3h${-WIDTH}Z`;
  let lightBars = '';
  for (let x = 120; x < WIDTH; x += 260) lightBars += `M${x} 0h4v${HEIGHT}h-4Z`;

  return (
    <Canvas {...props}>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <defs>
          <radialGradient id="tg-sand" cx="0.5" cy="0.42" r="1.15">
            <stop offset="0" stopColor={centre} />
            <stop offset="0.55" stopColor={middle} />
            <stop offset="1" stopColor={edge} />
          </radialGradient>
          <radialGradient id="tg-grid-fade" cx="0.5" cy="0.5" r="1.15">
            <stop offset="0.18" stopColor="#FFFFFF" />
            <stop offset="0.78" stopColor="#000000" />
          </radialGradient>
          <mask id="tg-grid-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={WIDTH} height={HEIGHT}>
            <rect width={WIDTH} height={HEIGHT} fill="url(#tg-grid-fade)" />
          </mask>
          <pattern id="tg-scan" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="1" fill="#32302A" />
          </pattern>
          {/* The original's 160 px grain tile: fractal noise, grey, tiled seamlessly. */}
          <filter id="tg-grain-noise" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" seed={Math.abs(props.seed) % 1000} />
            <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" />
          </filter>
          <pattern id="tg-grain" width="160" height="160" patternUnits="userSpaceOnUse">
            <rect width="160" height="160" filter="url(#tg-grain-noise)" />
          </pattern>
          {bands.map(([side, x1, y1, x2, y2]) => (
            <linearGradient key={side} id={`tg-vignette-${side}`} x1={x1} y1={y1} x2={x2} y2={y2}>
              {vignetteStops.map((stop) => (
                <stop key={stop.offset} offset={n(stop.offset)} stopColor={VIGNETTE_COLOR} stopOpacity={n(stop.alpha)} />
              ))}
            </linearGradient>
          ))}
        </defs>
        <g transform={`translate(${glitch.shakeX} ${glitch.shakeY})`}>
          {/* Wider than the screen, so a shake never shows its edge. */}
          {opaque ? <rect x={-8} y={-8} width={WIDTH + 16} height={HEIGHT + 16} fill="url(#tg-sand)" /> : null}
          {props.gridOpacity > 0 ? (
            <g mask="url(#tg-grid-mask)">
              <path d={grid} fill="none" stroke={props.inkColor} strokeWidth={1} strokeOpacity={props.gridOpacity} />
            </g>
          ) : null}
          <g fill={props.inkColor}>
            {dust.map((speck, index) => (
              <rect key={index} x={n(speck.x - speck.size / 2)} y={n(speck.y - speck.size / 2)} width={n(speck.size)} height={n(speck.size)}
                opacity={n(speck.opacity)} />
            ))}
          </g>
        </g>
        {props.vignette > 0 ? (
          <g>
            <rect width={WIDTH} height={VIGNETTE_DEPTH} fill="url(#tg-vignette-top)" />
            <rect y={HEIGHT - VIGNETTE_DEPTH} width={WIDTH} height={VIGNETTE_DEPTH} fill="url(#tg-vignette-bottom)" />
            <rect width={VIGNETTE_DEPTH} height={HEIGHT} fill="url(#tg-vignette-left)" />
            <rect x={WIDTH - VIGNETTE_DEPTH} width={VIGNETTE_DEPTH} height={HEIGHT} fill="url(#tg-vignette-right)" />
          </g>
        ) : null}
        {props.scanlines > 0 ? <rect width={WIDTH} height={HEIGHT} fill="url(#tg-scan)" opacity={props.scanlines} /> : null}
        {props.grain > 0 ? <rect width={WIDTH} height={HEIGHT} fill="url(#tg-grain)" opacity={props.grain} /> : null}
        {glitch.corrupt > 0 ? (
          <g transform={`translate(${glitch.corruptX} 0)`} opacity={glitch.corrupt}>
            <path d={darkBands} fill={CORRUPT.dark} fillOpacity={CORRUPT.darkAlpha} />
            <path d={lightBars} fill={CORRUPT.light} fillOpacity={CORRUPT.lightAlpha} />
          </g>
        ) : null}
      </svg>
    </Canvas>
  );
};
