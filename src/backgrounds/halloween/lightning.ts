import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../loop';

/**
 * Os relâmpagos do salão assombrado (HauntedInteriorLoop), num arquivo próprio para que os
 * overlays do kit (FlashLayer) pisquem junto com o fundo, com a mesma seed e a mesma duração.
 * Movido sem mudanças de HauntedInteriorLoop.tsx, que reexporta todos os nomes.
 */

/** O que os relâmpagos leem das props: a seed e a duração do ciclo. */
export type LightningProps = {seed: number; durationSeconds: number};

/* ------------------------------------------------------------------------------ relâmpagos */

/**
 * Relâmpagos: dois por ciclo, um em cada metade, em momentos escolhidos pela seed e longe da emenda
 * (`margin` segundos, ou `share` do ciclo, o que for maior). Cada um é um clarão rápido, um segundo
 * clarão 150–250 ms depois e uma cauda que se apaga, tudo em `length` segundos. Entre o início de
 * dois relâmpagos passam ao menos 1,5 s, então nenhum intervalo de 1 s tem mais de dois clarões (o
 * limite de fotossensibilidade é três). Ciclos curtos demais para isso ficam com um relâmpago (a
 * partir de `oneFrom` segundos) ou nenhum.
 */
export const LIGHTNING = {length: 0.8, margin: 0.35, share: 0.08, twoFrom: 3, oneFrom: 1.5} as const;

/** A cor fria do relâmpago: o brilho do raio no fundo e o clarão dos overlays do kit. */
export const LIGHTNING_COLOR = '#DCE6FF';

export type LightningStrike = {
  /** Início, em segundos desde o começo do ciclo. */
  start: number;
  /** Atraso do segundo clarão, em segundos, e a força dele diante do primeiro. */
  delay: number;
  echo: number;
  /**
   * A janela voltada para o raio (0: esquerda, 1: direita), que o vê e deixa entrar a luz dele; na
   * outra, o vidro só clareia, com força `far`, e pouco dessa luz entra (FAR_WASH, FAR_LIGHT).
   */
  side: 0 | 1;
  far: number;
  /** Seed do desenho do raio. */
  shape: number;
};

export const getLightningStrikes = (props: LightningProps): LightningStrike[] => {
  const cycle = props.durationSeconds;
  const count = cycle >= LIGHTNING.twoFrom ? 2 : cycle >= LIGHTNING.oneFrom ? 1 : 0;
  const margin = Math.max(LIGHTNING.margin, LIGHTNING.share * cycle);
  const random = createSeededRandom(props.seed + 509);
  const firstSide = random() < 0.5 ? 0 : 1;
  return Array.from({length: count}, (_, index) => {
    const earliest = (index * cycle) / count + margin;
    const latest = ((index + 1) * cycle) / count - margin - LIGHTNING.length;
    return {
      start: randomBetween(random, earliest, Math.max(earliest, latest)),
      delay: randomBetween(random, 0.15, 0.25),
      echo: randomBetween(random, 0.55, 0.8),
      side: ((firstSide + index) % 2) as 0 | 1,
      far: randomBetween(random, 0.7, 0.85),
      shape: Math.floor(random() * 2 ** 31),
    };
  });
};

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Um clarão, `t` segundos após começar: sobe em `rise`, fica no máximo por `hold` e se apaga com constante `fall`. */
const pulse = (t: number, rise: number, hold: number, fall: number) =>
  t <= 0 ? 0 : t < rise ? smooth(t / rise) : t < rise + hold ? 1 : Math.exp(-(t - rise - hold) / fall);

/**
 * Força do clarão (0–1) e visibilidade do raio `t` segundos após o início de um relâmpago. Fora do
 * relâmpago as duas são exatamente zero, e entram e saem sem salto. O raio acende quase de uma vez
 * e o céu, que ele ilumina, cresce em 40 ms: no primeiro frame o risco branco aparece sobre nuvens
 * ainda escuras, e é esse contraste que o faz ser lido como raio, e não só como um vidro que clareia.
 */
export const getStrikeEnvelope = (strike: LightningStrike, t: number) => {
  if (t <= 0 || t >= LIGHTNING.length) return {flash: 0, bolt: 0};
  const fade = 1 - smooth((t - LIGHTNING.length + 0.3) / 0.3);
  const echo = t - strike.delay;
  const main = pulse(t, 0.04, 0.025, 0.06);
  const second = pulse(echo, 0.025, 0.02, 0.07);
  const tail = 0.14 * smooth(echo / 0.06) * Math.exp(-Math.max(0, echo) / 0.28);
  return {
    flash: Math.min(1, main + strike.echo * second + tail) * fade,
    bolt: Math.min(1, pulse(t, 0.006, 0.045, 0.03) + 0.6 * pulse(echo, 0.006, 0.02, 0.035)) * fade,
  };
};

/** Segundos desde o começo do ciclo, na mesma escala em que os relâmpagos são marcados. */
export const cycleSeconds = (props: Pick<LightningProps, 'durationSeconds'>, frame: number, durationInFrames: number) =>
  (loopPhase(frame, durationInFrames) / TAU) * props.durationSeconds;

/** O relâmpago em curso no frame, se houver. */
export const getActiveStrike = (props: LightningProps, frame: number, durationInFrames: number) => {
  const seconds = cycleSeconds(props, frame, durationInFrames);
  return getLightningStrikes(props).find((strike) => seconds > strike.start && seconds < strike.start + LIGHTNING.length);
};

/**
 * A força do clarão em cada janela (0: esquerda, 1: direita), de 0 a 1, antes de multiplicar por
 * lightningIntensity: as duas veem o mesmo céu, a voltada para o raio com força 1, a outra com
 * `far`. Exatamente 0 longe dos relâmpagos (e perto da emenda), sem saltos.
 */
export const getWindowFlash = (props: LightningProps, frame: number, durationInFrames: number): [number, number] => {
  const seconds = cycleSeconds(props, frame, durationInFrames);
  const strikes = getLightningStrikes(props);
  const level = (side: 0 | 1) => {
    let flash = 0;
    for (const strike of strikes) {
      const envelope = getStrikeEnvelope(strike, seconds - strike.start);
      flash = Math.max(flash, envelope.flash * (strike.side === side ? 1 : strike.far));
    }
    return flash;
  };
  return [level(0), level(1)];
};
