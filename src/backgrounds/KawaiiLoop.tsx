import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {Cloud, Heart, Star} from './kawaii/KawaiiArtwork';

export const kawaiiLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(12),
  seed: baseBackgroundSchema.shape.seed.default(7),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#FFF7F4'),
  colors: baseBackgroundSchema.shape.colors.default(['#F7C8D8', '#FFE6BC', '#BFE3DC'])
    .describe('Paleta: morango, baunilha e matchá; a terceira cor é opcional'),
  familyCount: z.number().int().min(2).max(6).default(5).describe('Quantos grupos compõem o quadro'),
  familyScale: z.number().finite().min(0.7).max(1.4).default(1).describe('Tamanho geral da composição'),
  centerClearance: z.number().finite().min(0).max(1).default(0.5).describe('Tamanho do vazio central reservado ao conteúdo'),
  drift: z.number().finite().min(0).max(1).default(0.55).describe('Amplitude da flutuação'),
  sparkleTrail: z.number().int().min(0).max(4).default(2).describe('Cintilos que acompanham cada grupo'),
});

export type KawaiiLoopProps = z.infer<typeof kawaiiLoopSchema>;

export type KawaiiElement = {
  kind: 'cloud' | 'heart' | 'star';
  x: number;
  y: number;
  /** Cloud sizing; 1 is roughly 230px wide. */
  scale: number;
  /** Heart and star sizing, as a half-height in pixels. */
  size: number;
  squashX: number;
  squashY: number;
  rotation: number;
  opacity: number;
  gloss: number;
  variant: number;
  /** Which voice of the family chord this piece sings, so colour follows the arrangement. */
  voice: number;
  /** Which family it belongs to, so the colour chord can rotate per group. */
  group: number;
};

const element = (kind: KawaiiElement['kind'], values: Partial<KawaiiElement>): KawaiiElement => ({
  kind, x: 0, y: 0, scale: 1, size: 1, squashX: 1, squashY: 1, rotation: 0,
  opacity: 1, gloss: 0.6, variant: 0, voice: 0, group: 0, ...values,
});

// ---------------------------------------------------------------------------
// O arranjo
//
// A versão anterior sorteava ângulo e distância de cada peça. Isso é distribuição, não
// composição: lê como gerador. Aqui o arranjo é AUTORAL — uma tabela escrita à mão — e a
// seed não move nada de lugar. Trocar a seed muda o baile, nunca o arranjo.
// ---------------------------------------------------------------------------

type Member = {
  piece: KawaiiElement['kind'];
  /** Along the family axis, which runs tangent to the ring. */
  along: number;
  /** Across it. */
  across: number;
  size: number;
  variant: number;
  voice: number;
};

/**
 * Três acordes, não um carimbo repetido: um grupo nunca é a cópia do vizinho.
 * A escada de tamanhos é áurea — 1 : 0,618 : 0,382 : 0,236 — e as distâncias e os ângulos
 * internos são todos diferentes, para o grupo ler como um objeto só e não como pontos soltos.
 */
const CHORDS: Record<'denso' | 'aberto' | 'duo', Member[]> = {
  denso: [
    {piece: 'cloud', along: 0, across: 0, size: 1, variant: 0, voice: 0},
    {piece: 'heart', along: 2.08, across: -0.5, size: 0.5, variant: 0, voice: 1},
    {piece: 'star', along: 2.86, across: 0.42, size: 0.34, variant: 0, voice: 1},
    {piece: 'star', along: -1.82, across: 0.66, size: 0.22, variant: 1, voice: 0},
  ],
  aberto: [
    {piece: 'cloud', along: 0, across: 0, size: 1, variant: 1, voice: 0},
    {piece: 'star', along: 2.16, across: 0.58, size: 0.46, variant: 0, voice: 1},
    {piece: 'heart', along: -1.88, across: -0.54, size: 0.3, variant: 1, voice: 1},
  ],
  duo: [
    {piece: 'cloud', along: 0, across: 0, size: 1, variant: 2, voice: 0},
    {piece: 'heart', along: 1.98, across: -0.46, size: 0.36, variant: 0, voice: 1},
  ],
};

/**
 * Cada grupo pertence a um plano de distância. As bandas não se tocam: o fundo é maior,
 * mais pálido e quase parado; a frente é menor, nítida e deriva bem mais. É a paralaxe
 * que dá profundidade sem precisar de blur.
 */
const PLANES = [
  {scale: 1.28, opacity: 0.52, parallax: 0.5, gloss: 0.34},
  {scale: 1, opacity: 0.86, parallax: 1, gloss: 0.62},
  {scale: 0.72, opacity: 1, parallax: 1.7, gloss: 0.88},
] as const;

/**
 * As âncoras, escritas à mão. `angle` é o rumo a partir do centro da tela (0° à direita,
 * 90° embaixo) e `depth` a profundidade na faixa livre entre o miolo reservado e a borda.
 * O flanco esquerdo fica com a maior lacuna angular de propósito: é a pausa da composição.
 *
 * O equilíbrio é de alavanca: o grupo mais pesado tem braço curto, perto do miolo, e os
 * leves têm braço longo, quase na borda.
 */
const FAMILIES = [
  {chord: 'denso', angle: 186, depth: 0.24, tilt: 0, mirror: -1, plane: 1},
  {chord: 'aberto', angle: 16, depth: 0.34, tilt: 12, mirror: 1, plane: 1},
  {chord: 'denso', angle: 300, depth: 0.5, tilt: 8, mirror: 1, plane: 0},
  {chord: 'aberto', angle: 110, depth: 0.5, tilt: -8, mirror: -1, plane: 0},
  {chord: 'duo', angle: 240, depth: 0.62, tilt: 14, mirror: -1, plane: 2},
  {chord: 'duo', angle: 60, depth: 0.6, tilt: -14, mirror: 1, plane: 2},
] as const;

/** Raio nominal do grupo mais pesado, em pixels. Todo o resto é fração deste número. */
const FAMILY_RADIUS = 150;

/**
 * O vão que antecede o grupo decide o peso dele: silêncio grande anuncia nota grande.
 * É a regra que transforma espaço negativo em hierarquia em vez de sobra — e ela roda
 * antes de qualquer conta de tempo, então não toca na emenda do loop.
 */
export const getFamilyWeights = (familyCount: number): number[] => {
  const byAngle = FAMILIES.map((family, index) => ({index, angle: family.angle}))
    .sort((a, b) => a.angle - b.angle);
  const gaps = byAngle.map((entry, position) => {
    const previous = byAngle[(position - 1 + byAngle.length) % byAngle.length]!;
    const raw = ((entry.angle - previous.angle) % 360 + 360) % 360;
    return {index: entry.index, gap: raw === 0 ? 360 : raw};
  });
  const widest = Math.max(...gaps.map((entry) => entry.gap));
  const narrowest = Math.min(...gaps.map((entry) => entry.gap));
  const span = widest - narrowest;
  const weights = FAMILIES.map(() => 1);
  for (const {index, gap} of gaps) {
    weights[index] = 0.54 + 0.46 * (span === 0 ? 1 : (gap - narrowest) / span);
  }
  return weights.slice(0, familyCount);
};

/** The content box the scene promises to leave empty, in pixels around the centre. */
export const getContentBox = (centerClearance: number) => ({
  halfWidth: 430 + centerClearance * 210,
  halfHeight: 250 + centerClearance * 95,
});

/**
 * Meia-extensão desenhada de cada peça, por unidade de tamanho, medida do artwork.
 * Anisotrópica de propósito: uma nuvem de 1,42 por 0,78 não é um círculo, e tratá-la como
 * um raio só desperdiçaria meia tela de folga.
 */
export const DRAWN = {
  cloud: {x: 1.42, y: 0.78},
  heart: {x: 1.08, y: 1.04},
  star: {x: 1.14, y: 1.14},
} as const;

/** Respiração máxima de cada peça, já embutida no orçamento de folga. */
const BREATH = 1.05;
/**
 * Deriva máxima em pixels: plano mais adiantado (1,7) vezes a maior amplitude escrita
 * abaixo (15 em x, 10 em y) vezes `drift` no teto. Entra no alcance, então o miolo fica
 * livre sem precisar de nenhum clamp que dependa da fase.
 */
const MAX_DRIFT = {x: 15 * 1.7, y: 10 * 1.7};

/**
 * O maior raio de grupo que ainda cabe no corredor entre o miolo reservado e a borda.
 * É o que faz `centerClearance` trocar tamanho por espaço em vez de empurrar peça para fora
 * do quadro: pedir um miolo maior encolhe a composição, e a promessa continua de pé.
 */
export const maxFamilyRadius = (centerClearance: number) => {
  const box = getContentBox(centerClearance);
  const byWidth = ((960 - box.halfWidth) / 2 - MAX_DRIFT.x) / (DRAWN.cloud.x * BREATH);
  const byHeight = ((540 - box.halfHeight) / 2 - MAX_DRIFT.y) / (DRAWN.cloud.y * BREATH);
  return Math.max(12, Math.min(byWidth, byHeight));
};

export const reachOf = (kind: KawaiiElement['kind'], radius: number) => ({
  x: DRAWN[kind].x * radius * BREATH + MAX_DRIFT.x,
  y: DRAWN[kind].y * radius * BREATH + MAX_DRIFT.y,
});

/**
 * Projeta um rumo na faixa livre entre o miolo reservado e a borda do quadro, descontando
 * o alcance da própria peça nos dois eixos. Retangular porque conteúdo é retangular: um
 * vazio elíptico deixaria as quinas de um bloco de texto descobertas.
 */
const ringPoint = (
  angleDegrees: number,
  depth: number,
  reach: {x: number; y: number},
  centerClearance: number,
) => {
  const box = getContentBox(centerClearance);
  const angle = angleDegrees * Math.PI / 180;
  const toX = Math.abs(Math.cos(angle));
  const toY = Math.abs(Math.sin(angle));
  const inner = 1 / Math.max(toX / (box.halfWidth + reach.x), toY / (box.halfHeight + reach.y));
  const outer = 1 / Math.max(toX / (960 - reach.x), toY / (540 - reach.y));
  const distance = inner + Math.max(0, outer - inner) * depth;
  return {x: 960 + Math.cos(angle) * distance, y: 540 + Math.sin(angle) * distance};
};

/**
 * Empurra a CASA de uma peça para fora do miolo reservado, ao longo do próprio rumo.
 * Roda só sobre coordenadas de arranjo, nunca sobre a posição já animada: a fase não entra
 * aqui, então não existe nenhum clamp dependente do tempo para quebrar a emenda do loop.
 * A órbita cabe no alcance, logo a peça animada também nunca entra na caixa.
 */
const clearCentre = (
  home: {x: number; y: number},
  reach: {x: number; y: number},
  centerClearance: number,
) => {
  const angle = Math.atan2(home.y - 540, home.x - 960) * 180 / Math.PI;
  const floor = ringPoint(angle, 0, reach, centerClearance);
  const outward = Math.hypot(home.x - 960, home.y - 540);
  const minimum = Math.hypot(floor.x - 960, floor.y - 540);
  if (outward >= minimum) return home;
  const push = minimum / Math.max(outward, 1e-6);
  return {x: 960 + (home.x - 960) * push, y: 540 + (home.y - 540) * push};
};

/** Puxa a casa de volta para dentro do quadro, com o alcance desenhado já descontado. */
const keepInFrame = (home: {x: number; y: number}, reach: {x: number; y: number}) => ({
  x: Math.min(1920 - reach.x, Math.max(reach.x, home.x)),
  y: Math.min(1080 - reach.y, Math.max(reach.y, home.y)),
});

/**
 * A onda que atravessa a composição: a defasagem de um ponto vem de ONDE ele está, não de
 * um sorteio. Assim a respiração viaja pelo quadro em vez de cada peça piscar por conta
 * própria — a animação concorda com o arranjo em vez de desmenti-lo.
 */
const travel = (x: number, y: number) => (x / 1920 * 0.72 + y / 1080 * 0.28) * TAU;

/** Every animated property lives here, so the seam tests cover the entire scene. */
export const getKawaiiScene = (
  props: KawaiiLoopProps,
  frame: number,
  durationInFrames: number,
): KawaiiElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  // A seed só desloca o baile. Nenhuma peça muda de lugar por causa dela.
  const danceRandom = createSeededRandom(props.seed + 419);
  const weights = getFamilyWeights(props.familyCount);
  const scene: KawaiiElement[] = [];

  for (let index = 0; index < props.familyCount; index++) {
    const family = FAMILIES[index]!;
    const plane = PLANES[family.plane]!;
    const dance = danceRandom() * TAU;
    // Cada grupo cintila no próprio harmônico inteiro: a cadência também é composta.
    const harmonic = 2 + index;
    const radius = Math.min(
      FAMILY_RADIUS * weights[index]! * plane.scale * props.familyScale,
      maxFamilyRadius(props.centerClearance) * weights[index]! * plane.scale / 1.08,
    );
    const anchor = ringPoint(
      family.angle, family.depth, reachOf('cloud', radius * 1.08), props.centerClearance,
    );
    const axis = (family.angle + 90 + family.tilt) * Math.PI / 180;
    const alongX = Math.cos(axis) * family.mirror;
    const alongY = Math.sin(axis) * family.mirror;
    const swing = plane.parallax * props.drift;
    const chord = CHORDS[family.chord];

    for (let member = 0; member < chord.length; member++) {
      const part = chord[member]!;
      const memberRadius = radius * part.size;
      const reach = reachOf(part.piece, memberRadius);
      const home = clearCentre(keepInFrame({
        x: anchor.x + (part.along * alongX - part.across * alongY) * radius,
        y: anchor.y + (part.along * alongY + part.across * alongX) * radius,
      }, reach), reach, props.centerClearance);
      // A fase vem da casa da peça, então o grupo respira junto e a onda caminha pelo quadro.
      const offset = travel(home.x, home.y) + dance + member * 0.42;
      const breath = Math.sin(2 * phase + offset) * 0.045;

      scene.push(element(part.piece, {
        x: home.x + Math.cos(phase + offset) * 15 * swing,
        y: home.y + Math.sin(phase + offset) * 10 * swing,
        scale: part.piece === 'cloud' ? memberRadius / 100 : 1,
        size: part.piece === 'cloud' ? 1 : memberRadius,
        squashX: 1 + breath,
        squashY: 1 - breath,
        rotation: family.tilt * 0.3 + Math.sin(phase + offset) * 2.4 * plane.parallax,
        opacity: plane.opacity * (0.93 + Math.sin(phase + offset) * 0.07),
        gloss: plane.gloss * (0.86 + Math.sin(harmonic * phase + offset) * 0.14),
        variant: part.variant,
        voice: part.voice,
        group: index,
      }));
    }

    // O rastro: cintilos acompanhando o eixo do grupo, em cadência de razão áurea.
    for (let trail = 0; trail < props.sparkleTrail; trail++) {
      const step = -1.5 - trail * 0.82;
      const sway = 0.62 + trail * 0.36;
      const sparkleRadius = radius * 0.22 * Math.pow(0.78, trail);
      const trailReach = reachOf('star', sparkleRadius);
      const home = clearCentre(keepInFrame({
        x: anchor.x + (step * alongX - sway * alongY) * radius,
        y: anchor.y + (step * alongY + sway * alongX) * radius,
      }, trailReach), trailReach, props.centerClearance);
      const offset = travel(home.x, home.y) + dance;

      scene.push(element('star', {
        x: home.x + Math.cos(phase + offset) * 12 * swing,
        y: home.y + Math.sin(phase + offset) * 8 * swing,
        size: sparkleRadius,
        rotation: Math.sin(phase + offset) * 14,
        // Harmônico próprio por grupo: os rastros piscam fora de sincronia entre si.
        opacity: plane.opacity * (0.56 + Math.sin(harmonic * phase + offset) * 0.3),
        gloss: plane.gloss,
        variant: 1,
        voice: (trail + 1) % 2,
        group: index,
      }));
    }
  }

  return scene;
};

export const KawaiiLoop = (props: KawaiiLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getKawaiiScene(props, frame, durationInFrames);
  const strawberry = props.colors[0]!;
  const butter = props.colors[1] ?? strawberry;
  const matcha = props.colors[2] ?? butter;
  const transparent = hasTransparentBackground(props);
  // Cada grupo é um acorde de duas vozes, e o acorde gira uma casa por grupo: o motivo
  // volta sem repetir, e a regra vale para qualquer paleta de 2 a 6 cores.
  const colorFor = (item: KawaiiElement) =>
    props.colors[(item.group + item.voice) % props.colors.length]!;

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          {/* Alpha baixo em toda a rampa, para um backgroundColor escuro ainda aparecer. */}
          <linearGradient id="kawaii-sky" x2="0" y2="1">
            <stop stopColor={butter} stopOpacity="0.24" />
            <stop offset="0.46" stopColor={matcha} stopOpacity="0.09" />
            <stop offset="1" stopColor={strawberry} stopOpacity="0.28" />
          </linearGradient>
          <radialGradient id="kawaii-halo">
            <stop stopColor={butter} stopOpacity="0.18" />
            <stop offset="1" stopColor={butter} stopOpacity="0" />
          </radialGradient>
        </defs>

        {!transparent && (
          <>
            <rect width="1920" height="1080" fill="url(#kawaii-sky)" />
            <ellipse cx="960" cy="470" rx="880" ry="500" fill="url(#kawaii-halo)" />
          </>
        )}

        {scene.map((item, index) => {
          const color = colorFor(item);
          if (item.kind === 'cloud') {
            return (
              <Cloud key={index} x={item.x} y={item.y} scale={item.scale}
                squashX={item.squashX} squashY={item.squashY} rotation={item.rotation}
                opacity={item.opacity} variant={item.variant} color={color}
                gloss={item.gloss} id={`kawaii-cloud-${index}`} />
            );
          }
          if (item.kind === 'heart') {
            return (
              <Heart key={index} x={item.x} y={item.y} size={item.size}
                rotation={item.rotation} opacity={item.opacity} variant={item.variant}
                color={color} gloss={item.gloss} id={`kawaii-heart-${index}`} />
            );
          }
          return (
            <Star key={index} x={item.x} y={item.y} size={item.size}
              rotation={item.rotation} opacity={item.opacity} variant={item.variant}
              color={color} gloss={item.gloss} id={`kawaii-star-${index}`} />
          );
        })}
      </svg>
    </Canvas>
  );
};
