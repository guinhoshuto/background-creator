import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WEBGL_EXPERIMENTS, getWebGLScene, webglLoopSchema} from '../src/backgrounds/WebGLLoop';
import {getCompositionMetadata} from '../src/settings';

/**
 * Every WebGL experiment follows `speed`: the distance each scene value travels in a cycle,
 * divided by the speed, stays within 0.5× and 2× of what it travels at speed 1. A long cycle
 * keeps whole-turn rounding small, so a value outside that band ignores the speed (or applies
 * it twice) instead of rounding it.
 *
 * Values whose travel is not their pace are listed here, by experiment and `kind.field`, with
 * the reason. The list must match what falls outside exactly, so a fixed exception is dropped.
 */
const EXCEPTIONS: Record<string, string> = {
  // The phase turns once per cycle at any speed; the pace rides in `swing.pace`, checked below.
  'contours/swing.angle': 'carrier phase',
  // The slow phase sways: its angle travels with the speed, but the cosine of a small sway near
  // its turning point barely moves, so its travel does not scale with it.
  'mesh/warp.slowCos': 'cosine of a sway',
};

const DURATION_SECONDS = 60;
const SPEEDS = [0.25, 0.5, 2, 3];

/** Total distance each numeric `kind.field` of the scene travels over one cycle, summed over elements. */
const travel = (experiment: string, speed: number) => {
  const props = webglLoopSchema.parse({experiment, speed, durationSeconds: DURATION_SECONDS});
  const {durationInFrames: length} = getCompositionMetadata(props);
  const distances = new Map<string, number>();
  let previous = getWebGLScene(props, 0, length);
  for (let frame = 1; frame <= length; frame++) {
    const scene = getWebGLScene(props, frame, length);
    assert.equal(scene.length, previous.length, `${experiment}: a cena muda de tamanho no frame ${frame}`);
    scene.forEach((element, index) => {
      for (const [field, value] of Object.entries(element)) {
        const before = previous[index]![field];
        if (typeof value !== 'number' || typeof before !== 'number') continue;
        const key = `${element.kind}.${field}`;
        distances.set(key, (distances.get(key) ?? 0) + Math.abs(value - before));
      }
    });
    previous = scene;
  }
  return distances;
};

const TRAVEL = new Map(WEBGL_EXPERIMENTS.map((experiment) => [
  experiment, new Map([1, ...SPEEDS].map((speed) => [speed, travel(experiment, speed)])),
]));

test('WebGL ritmo: cada valor da cena anda na proporção do speed, entre 0,5× e 2× do pedido', () => {
  const outside = new Set<string>();
  const failures: string[] = [];
  for (const experiment of WEBGL_EXPERIMENTS) {
    const base = TRAVEL.get(experiment)!.get(1)!;
    assert.ok([...base.values()].some((distance) => distance > 0), `${experiment}: nada anda em speed 1`);
    for (const speed of SPEEDS) {
      const moved = TRAVEL.get(experiment)!.get(speed)!;
      for (const [key, distance] of base) {
        if (distance < 1e-9) continue;
        const ratio = moved.get(key)! / distance / speed;
        if (ratio >= 0.5 && ratio <= 2) continue;
        const id = `${experiment}/${key}`;
        outside.add(id);
        if (!(id in EXCEPTIONS)) failures.push(`${id}: speed ${speed} anda ${ratio.toFixed(2)}× o pedido`);
      }
    }
  }
  assert.deepEqual(failures, []);
  assert.deepEqual([...outside].sort(), Object.keys(EXCEPTIONS).sort(), 'as exceções ainda caem fora da faixa');
});

test('WebGL ritmo: somando a cena inteira, cada experimento anda na proporção do speed', () => {
  for (const experiment of WEBGL_EXPERIMENTS) {
    const total = (speed: number) => {
      let sum = 0;
      for (const [key, distance] of TRAVEL.get(experiment)!.get(speed)!) {
        if (!(`${experiment}/${key}` in EXCEPTIONS)) sum += distance;
      }
      return sum;
    };
    for (const speed of SPEEDS) {
      const ratio = total(speed) / total(1) / speed;
      assert.ok(ratio >= 0.5 && ratio <= 2, `${experiment}: speed ${speed} anda ${ratio.toFixed(2)}× o pedido`);
    }
  }
});

test('WebGL ritmo: no contours, o passo do giro dos gradientes segue o speed', () => {
  const pace = (speed: number) => {
    const props = webglLoopSchema.parse({experiment: 'contours', speed, durationSeconds: DURATION_SECONDS});
    return getWebGLScene(props, 0, getCompositionMetadata(props).durationInFrames).find((element) => element.kind === 'swing')!.pace as number;
  };
  for (const speed of SPEEDS) {
    const ratio = pace(speed) / pace(1) / speed;
    assert.ok(ratio >= 0.5 && ratio <= 2, `speed ${speed}: ${ratio.toFixed(2)}× o pedido`);
  }
});
