import {readFileSync} from 'node:fs';
import {blocoLoopSchema, getBlocoLayout, getBlocoMotion} from '../../src/overlays/bloco';
import {
  TRACK_MAIN, TRACK_SECOND, bordaFillOptions, bordaLoopSchema, getBordaGeometry, getBordaMotion,
} from '../../src/overlays/borda';
import {chatLoopSchema, getChatLayout, getChatMotion} from '../../src/overlays/chat';
import {
  colorRepeatsOf, getFillMotion, getStrokeMotion, type AssetMotion, type FillOptions, type Rect, type RoundRect,
} from '../../src/overlays/shared';
import {sizeProps, sizesForKind} from '../../src/sizes';
import {OVERLAY_THEMES} from './themes';

/**
 * The speeds every theme preset actually shows on every named size of its kind, layer by layer,
 * next to the speed it asks for. A pack sells one theme in many sizes, so they must move alike.
 */

export const SPEED_THEMES = OVERLAY_THEMES;
export const SPEED_KINDS = ['chat', 'bloco', 'borda'] as const;

/** How far the effective speed may stray from the requested one: ±35%. */
export const SPEED_TOLERANCE = 0.35;

export type SpeedRow = {
  preset: string;
  size: string;
  layer: 'contorno' | 'segunda linha' | 'preenchimento';
  /** strokeMotion or fill, for the table. */
  motion: string;
  requested: number;
  effective: number;
  /** Whole periods travelled per cycle (0 for the gradient's sway, which is exact). */
  laps: number;
  /** One period per cycle while the preset asks for less: the slowest the loop can go. */
  atMinimum: boolean;
  /** What the kind's getMotion reports for this layer (the sidecar and the pack manifest show it). */
  reported: number | null;
};

const readPreset = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../presets/${name}.json`, import.meta.url), 'utf8'));

type Parsed = Record<string, unknown> & {
  strokeMotion: string; strokeColors: string[]; strokeSpeed: number; fill: string; fillColors: string[]; fillSpeed: number;
  durationSeconds: number;
};

type KindAdapter = {
  parse: (input: Record<string, unknown>) => Parsed;
  track: (props: Parsed) => RoundRect;
  secondTrack?: (props: Parsed) => RoundRect | null;
  fillArea: (props: Parsed) => {area: Rect; options: FillOptions};
  motion: (props: Parsed) => AssetMotion;
};

const ADAPTERS: Record<(typeof SPEED_KINDS)[number], KindAdapter> = {
  chat: {
    parse: (input) => chatLoopSchema.strict().parse(input) as unknown as Parsed,
    track: (props) => getChatLayout(props as never).track,
    fillArea: (props) => ({area: getChatLayout(props as never).box, options: {}}),
    motion: (props) => getChatMotion(props as never),
  },
  bloco: {
    parse: (input) => blocoLoopSchema.strict().parse(input) as unknown as Parsed,
    track: (props) => getBlocoLayout(props as never).track,
    fillArea: (props) => ({area: getBlocoLayout(props as never).box, options: {}}),
    motion: (props) => getBlocoMotion(props as never),
  },
  borda: {
    parse: (input) => bordaLoopSchema.strict().parse(input) as unknown as Parsed,
    track: (props) => getBordaGeometry(props as never).tracks[TRACK_MAIN],
    secondTrack: (props) => (props.lines === 2 ? getBordaGeometry(props as never).tracks[TRACK_SECOND] : null),
    fillArea: (props) => {
      const geometry = getBordaGeometry(props as never);
      return {area: geometry.fillArea, options: bordaFillOptions(geometry)};
    },
    motion: (props) => getBordaMotion(props as never),
  },
};

const travelsAlongStroke = (props: Parsed) => props.strokeSpeed > 0
  && (props.strokeMotion === 'formigas' || props.strokeMotion === 'cometas'
    || (props.strokeMotion === 'gradiente' && props.strokeColors.length > 1));

const fillMoves = (props: Parsed) => props.fillSpeed > 0 && props.fill !== 'solido'
  && !(props.fill === 'gradiente' && props.fillColors.length < 2);

/** Every moving layer of every theme preset on every named size of its kind, at the preset's duration. */
export const speedTable = (): SpeedRow[] => {
  const rows: SpeedRow[] = [];
  for (const kind of SPEED_KINDS) {
    const adapter = ADAPTERS[kind];
    for (const theme of SPEED_THEMES) {
      const preset = `${kind}-${theme}`;
      const input = readPreset(preset);
      for (const size of sizesForKind(kind)) {
        const props = adapter.parse({...input, ...sizeProps(size)});
        const seconds = props.durationSeconds;
        const reported = adapter.motion(props);
        if (travelsAlongStroke(props)) {
          const strokeRow = (layer: SpeedRow['layer'], track: RoundRect, colorRepeats?: number) => {
            const motion = getStrokeMotion(props as never, track, colorRepeats === undefined ? {} : {colorRepeats});
            const lap = motion.period * motion.unitsPerPeriod;
            rows.push({
              preset, size: size.id, layer, motion: props.strokeMotion, requested: props.strokeSpeed, effective: motion.speed,
              laps: motion.laps, atMinimum: motion.laps === 1 && props.strokeSpeed * seconds < lap,
              reported: layer === 'contorno' ? reported.strokeSpeed : null,
            });
          };
          const main = adapter.track(props);
          strokeRow('contorno', main);
          const second = adapter.secondTrack?.(props) ?? null;
          // The second line only flows with the colour gradient; ants and comets leave it still.
          if (second && props.strokeMotion === 'gradiente') strokeRow('segunda linha', second, colorRepeatsOf(props as never, main));
        }
        if (fillMoves(props)) {
          const {area, options} = adapter.fillArea(props);
          const motion = getFillMotion(props as never, area, options);
          const lap = motion.period * motion.unitsPerPeriod;
          rows.push({
            preset, size: size.id, layer: 'preenchimento', motion: props.fillRise ? `${props.fill} subindo` : props.fill,
            requested: props.fillSpeed, effective: motion.speed, laps: motion.laps,
            atMinimum: motion.laps === 1 && props.fillSpeed * seconds < lap - 1e-9,
            reported: reported.fillSpeed,
          });
        }
      }
    }
  }
  return rows;
};

/** Effective over requested, minus one: +0.2 is 20% faster than asked. */
export const speedError = (row: SpeedRow) => row.effective / row.requested - 1;
