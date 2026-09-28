import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {getCheckerboardScene, checkerboardLoopSchema} from '../src/backgrounds/CheckerboardLoop';
import {christmasLoopSchema, getChristmasScene} from '../src/backgrounds/ChristmasLoop';
import {getCobwebScene, cobwebLoopSchema} from '../src/backgrounds/CobwebLoop';
import {getDotGridScene, dotGridLoopSchema} from '../src/backgrounds/DotGridLoop';
import {getGeometricScene, geometricLoopSchema} from '../src/backgrounds/GeometricLoop';
import {getGradientScene, gradientLoopSchema} from '../src/backgrounds/GradientLoop';
import {getHalloweenScene, halloweenLoopSchema} from '../src/backgrounds/HalloweenLoop';
import {getHauntedInteriorScene, hauntedInteriorLoopSchema} from '../src/backgrounds/HauntedInteriorLoop';
import {getHauntedMansionScene, hauntedMansionLoopSchema} from '../src/backgrounds/HauntedMansionLoop';
import {getKawaiiScene, kawaiiLoopSchema} from '../src/backgrounds/KawaiiLoop';
import {getParticleScene, particleLoopSchema} from '../src/backgrounds/ParticleLoop';
import {getSunburstScene, sunburstLoopSchema} from '../src/backgrounds/SunburstLoop';
import {getVaporwaveScene, vaporwaveLoopSchema} from '../src/backgrounds/VaporwaveLoop';
import {WEBGL_EXPERIMENTS, getWebGLScene, webglLoopSchema} from '../src/backgrounds/WebGLLoop';
import {getWutheringWavesScene, wutheringWavesLoopSchema} from '../src/backgrounds/WutheringWavesLoop';
import {backgroundCatalog, getBackground} from '../src/catalog';
import {blocoLoopSchema, getBlocoScene} from '../src/overlays/bloco';
import {bordaLoopSchema, getBordaScene} from '../src/overlays/borda';
import {chatLoopSchema, getChatScene} from '../src/overlays/chat';
import {loopPhase} from '../src/loop';
import {getCompositionMetadata} from '../src/settings';
import {getSize, sizeProps} from '../src/sizes';

type Scene = Record<string, string | number>[];
/** Fields a scene checks elsewhere, because the element they belong to is not the thing that lasts. */
type SeamExempt = (element: Record<string, string | number>, key: string) => boolean;

const scenes: {id: string; sample: (input: unknown, frame: number, length: number) => Scene; seamExempt?: SeamExempt}[] = [
  {
    id: 'WutheringWavesLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getWutheringWavesScene(wutheringWavesLoopSchema.parse(input), frame, length),
  },
  {
    id: 'WutheringWavesLoop (maximum controls)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getWutheringWavesScene(wutheringWavesLoopSchema.parse({
        atmosphere: 1, resonance: 1, particleCount: 100, motion: 2, centerShade: 1,
        transparent: true, ...(input as object),
      }), frame, length),
  },
  {
    id: 'GradientLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getGradientScene(gradientLoopSchema.parse(input), frame, length),
  },
  {
    id: 'ParticleLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getParticleScene(particleLoopSchema.parse(input), frame, length),
  },
  {
    id: 'GeometricLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getGeometricScene(geometricLoopSchema.parse(input), frame, length),
  },
  {
    id: 'HalloweenLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getHalloweenScene(halloweenLoopSchema.parse(input), frame, length),
  },
  {
    id: 'HauntedInteriorLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getHauntedInteriorScene(hauntedInteriorLoopSchema.parse(input), frame, length),
  },
  {
    id: 'HauntedMansionLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getHauntedMansionScene(hauntedMansionLoopSchema.parse(input), frame, length),
  },
  {
    id: 'CobwebLoop',
    // The web geometry is frame-invariant and checked in tests/cobweb.test.ts; the shared
    // scans stay on scalars, so every field of every composition remains covered.
    sample: (input: unknown, frame: number, length: number): Scene =>
      getCobwebScene(cobwebLoopSchema.parse(input), frame, length).map(({geometry, ...element}) => ({
        ...element,
        sheen: geometry?.sheen ?? 0,
        nodeCount: geometry?.nodes.length ?? 0,
      })),
  },
  {
    id: 'ChristmasLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getChristmasScene(christmasLoopSchema.parse(input), frame, length),
  },
  {
    // Every layer at its maximum, the lights and boughs at full swing and the alpha path on.
    id: 'ChristmasLoop (maximum controls)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getChristmasScene(christmasLoopSchema.parse({
        baubleCount: 10, snowCount: 240, bokehCount: 48, sparkleCount: 60,
        sway: 1, lightGlow: 1, twinkle: 1, centerCalm: 1, transparent: true, ...(input as object),
      }), frame, length),
  },
  {
    id: 'SunburstLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getSunburstScene(sunburstLoopSchema.parse(input), frame, length),
    // The fan turns: at the seam a ray takes over the place, and the shape, of its neighbour.
    // The picture is continuous, the ray is not; tests/sunburst.test.ts checks the rotation
    // and the field that gives every place its shape. The layers that stay put keep the scan.
    seamExempt: (element, key) => element.kind === 'ray' && ['angle', 'halfWidth', 'opacity'].includes(key),
  },
  {
    id: 'KawaiiLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getKawaiiScene(kawaiiLoopSchema.parse(input), frame, length),
  },
  {
    // The floor and the sun cuts scroll, but they are listed by place, not by line: every
    // field of the scene keeps the scan, with no exemption.
    id: 'VaporwaveLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getVaporwaveScene(vaporwaveLoopSchema.parse(input), frame, length),
  },
  {
    // Every layer at its maximum, the sun centred (sunk, with its own cut band) and the alpha
    // path on: the WebM seam scan covers what the defaults leave out, and the periodicity scan,
    // which sets mp4 and gif, still covers the opaque path.
    id: 'VaporwaveLoop (máximos)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getVaporwaveScene(vaporwaveLoopSchema.parse({
        speed: 12, starCount: 200, shootingStars: 3, palmCount: 3, shapeCount: 4, centerShade: 1, sunPosition: 0.5,
        transparent: true, ...(input as object),
      }), frame, length),
  },
  {
    // The dots scroll, but they are listed by place, like the vaporwave floor: every field of
    // the scene keeps the scan, with no exemption.
    id: 'DotGridLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getDotGridScene(dotGridLoopSchema.parse(input), frame, length),
  },
  {
    // The alternating rows need two rows to line up, and a diagonal closes both axes at once.
    id: 'DotGridLoop (alternados, diagonal)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getDotGridScene(dotGridLoopSchema.parse({
        layout: 'alternating', direction: 'up-left', speed: 90, dotSize: 20, spacing: 36, ...(input as object),
      }), frame, length),
  },
  {
    // The squares scroll, but they are listed by place along the board's diagonals, like the
    // dots: every field of the scene keeps the scan, with no exemption.
    id: 'CheckerboardLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getCheckerboardScene(checkerboardLoopSchema.parse(input), frame, length),
  },
  {
    // A tilted board sliding along its rows, whose step is two squares, not one diagonal.
    id: 'CheckerboardLoop (inclinado, fileira)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getCheckerboardScene(checkerboardLoopSchema.parse({
        angle: -30, direction: 'left', speed: 90, squareSize: 48, ...(input as object),
      }), frame, length),
  },
  // A shader scene holds every moving uniform: the shared scans cover each experiment, at its
  // defaults and with every control at its maximum on the alpha path.
  ...WEBGL_EXPERIMENTS.flatMap((experiment) => [
    {
      id: `WebGLLoop (${experiment})`,
      sample: (input: unknown, frame: number, length: number): Scene =>
        getWebGLScene(webglLoopSchema.parse({experiment, ...(input as object)}), frame, length),
    },
    {
      id: `WebGLLoop (${experiment}, máximos)`,
      sample: (input: unknown, frame: number, length: number): Scene =>
        getWebGLScene(webglLoopSchema.parse({
          experiment, speed: 3, scale: 2, intensity: 2, centerFade: 1, transparent: true, ...(input as object),
        }), frame, length),
    },
  ]),
  // The sized overlays list every moving piece by place (dots, dashes, comets, sparks) and wrap
  // their sheens and embers only out of sight, so the scans run with no exemption. Their own
  // tests cover sizes, themes and the hole; here each runs at its defaults and at its busiest.
  {
    id: 'ChatLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getChatScene(chatLoopSchema.parse(input), frame, length),
  },
  {
    // Rising embers over a three-colour base, four colours flowing round the edge, the glow
    // breathing four times (as strong as the title still allows at that reach) and the halo at
    // the edge of the bleed.
    id: 'ChatLoop (máximos)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getChatScene(chatLoopSchema.parse({
        fill: 'brilhos', fillRise: true, fillColors: ['#150B24', '#F97316', '#FACC15'],
        strokeMotion: 'gradiente', strokeColors: ['#22D3EE', '#E879F9', '#A78BFA', '#FACC15'], strokeWidth: 3,
        glow: 24, glowStrength: 2, glowPulses: 4, halo: 32, ...(input as object),
      }), frame, length),
  },
  {
    id: 'BlocoLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBlocoScene(blocoLoopSchema.parse(input), frame, length),
  },
  {
    // Scrolling stripes, marching ants over the dim track, a left bar with four glints per
    // cycle, the glow breathing four times and the halo filling the bleed.
    id: 'BlocoLoop (máximos)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBlocoScene(blocoLoopSchema.parse({
        fill: 'listras', fillSpeed: 48, strokeMotion: 'formigas', accent: 'esquerda', accentSheen: 4,
        glowPulses: 4, halo: 32, ...(input as object),
      }), frame, length),
  },
  {
    id: 'BordaLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBordaScene(bordaLoopSchema.parse(input), frame, length),
  },
  {
    // Scrolling dots in the band, colours flowing along both lines, gems breathing four times
    // and the glow pulsing: every moving part a border has, around the window.
    id: 'BordaLoop (máximos)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBordaScene(bordaLoopSchema.parse({
        fill: 'pontos', fillColors: ['#0B0620', '#E879F9'], strokeMotion: 'gradiente', lines: 2,
        corners: 'joias', cornerPulses: 4, glowPulses: 4, ...(input as object),
      }), frame, length),
  },
  {
    // The round block: its text square, the accent arc and the glint going round the circle.
    id: 'BlocoLoop (círculo)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBlocoScene(blocoLoopSchema.parse({...sizeProps(getSize('circulo')), ...(input as object)}), frame, length),
  },
  {
    id: 'BlocoLoop (círculo, máximos)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBlocoScene(blocoLoopSchema.parse({
        ...sizeProps(getSize('circulo')), fill: 'listras', fillSpeed: 48, strokeMotion: 'formigas', accent: 'esquerda', accentSheen: 4,
        glowPulses: 4, halo: 32, ...(input as object),
      }), frame, length),
  },
  {
    id: 'BordaLoop (círculo)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBordaScene(bordaLoopSchema.parse({...sizeProps(getSize('webcam-redonda')), ...(input as object)}), frame, length),
  },
  {
    id: 'BordaLoop (círculo, máximos)',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getBordaScene(bordaLoopSchema.parse({
        ...sizeProps(getSize('webcam-redonda')), fill: 'pontos', fillColors: ['#0B0620', '#E879F9'], strokeMotion: 'gradiente', lines: 2,
        corners: 'joias', cornerPulses: 4, glowPulses: 4, ...(input as object),
      }), frame, length),
  },
  // BordaLoop's mask mode (mascara) is left out on purpose: it is one still PNG, so the scans'
  // "frames differ" and "the seed changes the scene" checks cannot hold. tests/borda.test.ts runs
  // the same scans on it as a still (moving: false, seeded: false) instead of faking a motion.
];

for (const {id, sample, seamExempt} of scenes) {
  test(`${id}: seed and frame determine the scene independently of render order`, () => {
    const first = sample({seed: 42}, 137, 480);
    sample({seed: -7}, 350, 480);
    assert.deepEqual(sample({seed: 42}, 137, 480), first);
    assert.notDeepEqual(sample({seed: 43}, 137, 480), first);
    assert.notDeepEqual(sample({seed: 42}, 180, 480), first);
  });

  test(`${id}: complete cycles repeat exactly across durations, cadences, and seeds`, () => {
    for (const durationSeconds of [3.7, 8, 12.25]) {
      for (const outputFormat of ['mp4', 'webm', 'gif'] as const) {
        const {durationInFrames: length} = getCompositionMetadata({durationSeconds, outputFormat});
        for (const seed of [-7, 1, 2026]) {
          const props = {durationSeconds, outputFormat, seed};
          assert.deepEqual(sample(props, 0, length), sample(props, length, length));
          assert.deepEqual(sample(props, 17, length), sample(props, length + 17, length));
          assert.deepEqual(sample(props, length - 1, length), sample(props, -1, length));
          assert.notDeepEqual(sample(props, 0, length), sample(props, length - 1, length), 'Do not duplicate the first frame at the end');
        }
      }
    }
  });

  test(`${id}: position, size, opacity, and rotation have continuous seam velocity`, () => {
    const normalizedStep = 1e-6;
    for (const length of [185, 480, 735]) {
      for (const seed of [-7, 1, 2026]) {
        const beginning = sample({seed}, 0, length);
        const before = sample({seed}, length * (1 - normalizedStep), length);
        const after = sample({seed}, length * normalizedStep, length);
        assert.equal(before.length, beginning.length);
        assert.equal(after.length, beginning.length);

        for (let i = 0; i < beginning.length; i++) {
          for (const [key, value] of Object.entries(beginning[i]!)) {
            if (typeof value !== 'number' || seamExempt?.(beginning[i]!, key)) continue;
            const previous = before[i]![key];
            const next = after[i]![key];
            assert.equal(typeof previous, 'number');
            assert.equal(typeof next, 'number');
            const leftVelocity = (value - (previous as number)) / normalizedStep;
            const rightVelocity = ((next as number) - value) / normalizedStep;
            const tolerance = 0.1 + Math.max(Math.abs(leftVelocity), Math.abs(rightVelocity)) * 0.001;
            assert.ok(Number.isFinite(leftVelocity) && Number.isFinite(rightVelocity), `${id} ${i}.${key}: finite motion`);
            assert.ok(Math.abs(leftVelocity - rightVelocity) < tolerance, `${id} seed ${seed} ${i}.${key}: seam velocity ${leftVelocity} vs ${rightVelocity}`);
          }
        }
      }
    }
  });

  test(`${id}: elements keep valid dimensions and opacity throughout the cycle`, () => {
    for (const frame of [0, 1, 60, 120, 240, 359, 479]) {
      for (const element of sample({}, frame, 480)) {
        for (const value of Object.values(element)) {
          if (typeof value === 'number') assert.ok(Number.isFinite(value));
        }
        assert.ok(typeof element.opacity === 'number' && element.opacity >= 0 && element.opacity <= 1);
        for (const key of ['radius', 'radiusX', 'radiusY']) {
          if (key in element) assert.ok(typeof element[key] === 'number' && element[key] > 0);
        }
      }
    }
  });
}

test('composition schemas reject invalid custom controls and accept documented boundaries', () => {
  for (const input of [{scale: 0}, {scale: 3.01}, {intensity: -0.1}, {intensity: 2.01}]) {
    assert.equal(gradientLoopSchema.safeParse(input).success, false);
  }
  for (const input of [{count: 0}, {count: 601}, {count: 2.5}, {size: 0}, {size: 25}, {distribution: 'random'}]) {
    assert.equal(particleLoopSchema.safeParse(input).success, false);
  }
  for (const input of [{count: 0}, {count: 101}, {count: 2.5}, {scale: 0.1}, {scale: 3.01}]) {
    assert.equal(geometricLoopSchema.safeParse(input).success, false);
  }
  for (const input of [
    {webCount: -1}, {webCount: 5}, {webCount: 1.5}, {webCount: '4'},
    {strandCount: -1}, {strandCount: 25}, {strandCount: 1.5},
    {moteCount: -1}, {moteCount: 121}, {moteCount: 2.5},
    {spiderCount: -1}, {spiderCount: 4}, {spiderCount: 1.5},
    {dewIntensity: -0.01}, {dewIntensity: 1.01}, {dewIntensity: Number.POSITIVE_INFINITY},
    {mistIntensity: -0.01}, {mistIntensity: 1.01}, {mistIntensity: Number.NaN},
  ]) {
    assert.equal(cobwebLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {rayCount: 5}, {rayCount: 49}, {rayCount: 12.5}, {rayCount: '20'},
    {rayWidth: 0.14}, {rayWidth: 0.81}, {rayWidth: Number.NaN},
    {swirl: -0.01}, {swirl: 1.01}, {spin: 2.5}, {spin: 25}, {spin: -25}, {spin: '3'},
    {coreFade: -0.01}, {coreFade: 1.01}, {coreShade: -0.01}, {coreShade: Number.POSITIVE_INFINITY},
  ]) {
    assert.equal(sunburstLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {speed: -1}, {speed: 13}, {speed: 2.5}, {speed: '4'},
    {sunPosition: 0.09}, {sunPosition: 0.91}, {sunPosition: Number.NaN},
    {neonGlow: -0.01}, {neonGlow: 1.01}, {starCount: -1}, {starCount: 201}, {starCount: 1.5},
    {shootingStars: -1}, {shootingStars: 4}, {shootingStars: 0.5},
    {palmCount: -1}, {palmCount: 4}, {palmCount: 1.5}, {shapeCount: -1}, {shapeCount: 5}, {shapeCount: 2.5},
    {centerShade: -0.01}, {centerShade: 1.01}, {centerShade: Number.POSITIVE_INFINITY},
  ]) {
    assert.equal(vaporwaveLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {direction: 'diagonal'}, {direction: 45}, {layout: 'hex'}, {layout: true},
    {dotSize: 0.99}, {dotSize: 96.01}, {dotSize: Number.NaN}, {dotSize: '10'},
    {spacing: 15.99}, {spacing: 240.01}, {spacing: Number.POSITIVE_INFINITY},
    {speed: -0.01}, {speed: 480.01}, {speed: Number.NaN}, {speed: '24'},
    {dotColor: 12}, {colors: ['#FFFFFF', '#000000']},
    {spacing: 16, speed: 480, direction: 'right'}, {spacing: 16, speed: 480, direction: 'down-left', outputFormat: 'gif'},
    {durationSeconds: 0.03, direction: 'left'},
  ]) {
    assert.equal(dotGridLoopSchema.strict().safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {direction: 'diagonal'}, {direction: 45},
    {angle: -45.01}, {angle: 45.01}, {angle: Number.NaN}, {angle: '15'},
    {squareSize: 15.99}, {squareSize: 480.01}, {squareSize: Number.POSITIVE_INFINITY}, {squareSize: '80'},
    {speed: -0.01}, {speed: 960.01}, {speed: Number.NaN}, {speed: '40'},
    {squareColor: 12}, {colors: ['#FFFFFF', '#000000']}, {backgroundColor: 'rgba(0, 0, 0, 0.5)'},
    {squareSize: 16, speed: 960, direction: 'right'}, {squareSize: 16, speed: 500, direction: 'down-left', outputFormat: 'gif'},
    {durationSeconds: 0.03, direction: 'left'},
  ]) {
    assert.equal(checkerboardLoopSchema.strict().safeParse(input).success, false, JSON.stringify(input));
  }
  assert.equal(gradientLoopSchema.safeParse({scale: 0.25, intensity: 2}).success, true);
  assert.equal(particleLoopSchema.safeParse({count: 600, size: 24, distribution: 'center'}).success, true);
  assert.equal(geometricLoopSchema.safeParse({count: 100, scale: 0.15}).success, true);
  for (const input of [
    {webCount: 0, strandCount: 0, moteCount: 0, spiderCount: 0, dewIntensity: 0, mistIntensity: 0},
    {webCount: 4, strandCount: 24, moteCount: 120, spiderCount: 3, dewIntensity: 1, mistIntensity: 1},
  ]) {
    assert.equal(cobwebLoopSchema.safeParse(input).success, true);
  }
  for (const input of [
    {rayCount: 6, rayWidth: 0.15, swirl: 0, spin: -24, coreFade: 0, coreShade: 0},
    {rayCount: 48, rayWidth: 0.8, swirl: 1, spin: 24, coreFade: 1, coreShade: 1},
  ]) {
    assert.equal(sunburstLoopSchema.safeParse(input).success, true);
  }
  for (const input of [
    {direction: 'right', layout: 'aligned', dotColor: 'rgba(255, 255, 255, 0.35)', dotSize: 1, spacing: 16, speed: 0},
    {direction: 'down-left', layout: 'alternating', dotColor: 'red', dotSize: 96, spacing: 240, speed: 480},
  ]) {
    assert.equal(dotGridLoopSchema.strict().safeParse(input).success, true, JSON.stringify(input));
  }
  for (const input of [
    {direction: 'right', angle: -45, squareColor: 'rgba(255, 255, 255, 0.14)', squareSize: 16, speed: 0},
    {direction: 'down-left', angle: 45, squareColor: 'red', squareSize: 480, speed: 960},
  ]) {
    assert.equal(checkerboardLoopSchema.strict().safeParse(input).success, true, JSON.stringify(input));
  }
  for (const input of [
    {speed: 0, sunPosition: 0.1, neonGlow: 0, starCount: 0, shootingStars: 0, palmCount: 0, shapeCount: 0, centerShade: 0},
    {speed: 12, sunPosition: 0.9, neonGlow: 1, starCount: 200, shootingStars: 3, palmCount: 3, shapeCount: 4, centerShade: 1},
  ]) {
    assert.equal(vaporwaveLoopSchema.safeParse(input).success, true);
  }
});

test('particle controls keep their element count and visible opacity for the entire cycle', () => {
  for (const distribution of ['uniform', 'center'] as const) {
    const props = particleLoopSchema.parse({count: 600, size: 24, distribution});
    for (const frame of [0, 120, 240, 479]) {
      const particles = getParticleScene(props, frame, 480);
      assert.equal(particles.length, 600);
      assert.ok(particles.every(({opacity, radius}) => opacity > 0 && opacity <= 1 && radius > 0));
    }
  }
});

test('catalog defaults and shipped presets pass the same schemas used by Studio and export', () => {
  const presets = [
    ['WutheringWavesLoop', 'wuthering-waves-azure-lotus.json'],
    ['GradientLoop', 'gradient-aurora.json'],
    ['ParticleLoop', 'particles-alpha.json'],
    ['GeometricLoop', 'geometric-orbit.json'],
    ['HalloweenLoop', 'halloween-midnight.json'],
    ['HauntedInteriorLoop', 'halloween-haunted-interior.json'],
    ['HauntedMansionLoop', 'halloween-haunted-mansion.json'],
    ['KawaiiLoop', 'kawaii-constelacao.json'],
    ['CobwebLoop', 'halloween-cobweb.json'],
    ['ChristmasLoop', 'christmas-gilded-garland.json'],
    ['SunburstLoop', 'sunburst-crimson.json'],
    ['SunburstLoop', 'sunburst-sand.json'],
    ['SunburstLoop', 'sunburst-ocean.json'],
    ['SunburstLoop', 'sunburst-moss.json'],
    ['VaporwaveLoop', 'vaporwave-horizonte.json'],
    ['VaporwaveLoop', 'vaporwave-classico.json'],
    ['VaporwaveLoop', 'vaporwave-alpha.json'],
    ['DotGridLoop', 'dots-classico.json'],
    ['DotGridLoop', 'dots-alternados.json'],
    ['DotGridLoop', 'dots-alpha.json'],
    ['CheckerboardLoop', 'xadrez-classico.json'],
    ['CheckerboardLoop', 'xadrez-losangos.json'],
    ['CheckerboardLoop', 'xadrez-inclinado.json'],
    ['CheckerboardLoop', 'xadrez-alpha.json'],
  ];
  for (const entry of Object.values(backgroundCatalog)) {
    assert.deepEqual(entry.schema.parse(entry.defaultProps), entry.defaultProps);
    assert.equal(getBackground(entry.id), entry);
  }
  for (const [id, filename] of presets) {
    const props: unknown = JSON.parse(readFileSync(new URL(`../presets/${filename}`, import.meta.url), 'utf8'));
    assert.equal(getBackground(id!).schema.strict().safeParse(props).success, true, filename);
  }
  assert.throws(() => getBackground('UnknownLoop'), /Background desconhecido/);
  assert.throws(() => getBackground('__proto__'), /Background desconhecido/);
});

test('loop helper rejects invalid frame counts instead of propagating NaN', () => {
  for (const length of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(() => loopPhase(0, length));
  }
  assert.throws(() => loopPhase(Number.NaN, 480));
  assert.throws(() => loopPhase(Number.POSITIVE_INFINITY, 480));
});
