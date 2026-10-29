import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {TAU} from '../src/loop';
import {createTokyoRain, getTokyoDropState, getTokyoImpactState} from '../src/backgrounds/tokyo/motion';
import {createTokyoSignDrops, createTokyoSignRain, getTokyoSignDropState} from '../src/backgrounds/tokyo/sign-rain';

const sign = {width: 1.2, height: 3.7, color: '#46d9eb'};
const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('Tokyo surface impacts grow from the actual contact and finish before the next fall', () => {
  for (const drop of createTokyoRain(2089)) {
    const contact = drop.offset * TAU / drop.turns;
    const falling = getTokyoDropState(drop, contact - 1e-10);
    const first = getTokyoImpactState(drop, contact + 0.06 * TAU / 12);
    const later = getTokyoImpactState(drop, contact + 0.2 * TAU / 12);
    close(first.x, falling.x, 1e-8);
    close(first.x, later.x);
    close(first.z, falling.z);
    assert.ok(later.radius > first.radius);
    assert.equal(getTokyoImpactState(drop, contact + 0.6 * TAU / 12).opacity, 0);
    if (Math.abs(first.x) >= 5.8 || first.z <= -62 || first.z >= 11) assert.equal(first.opacity, 0);
    else assert.ok(first.opacity > 0, 'road contacts remain visible during their short response');
    for (const phase of [0, 0.8, 3.4, 6.1]) {
      const state = getTokyoImpactState(drop, phase);
      const repeated = getTokyoImpactState(drop, phase + TAU);
      for (const key of ['x', 'z', 'radius', 'opacity', 'age'] as const) close(state[key], repeated[key]);
    }
  }
});

test('Tokyo sign beads occupy seeded margins without crossing the lettering or panel sides', () => {
  for (const dimensions of [{width: 0.56, height: 2.8}, {width: 1.44, height: 0.54}, {width: 8.2, height: 0.85}]) {
    const surface = {...sign, ...dimensions};
    const drops = createTokyoSignDrops(surface, 2089);
    assert.deepEqual(drops, createTokyoSignDrops(surface, 2089));
    assert.notDeepEqual(drops, createTokyoSignDrops(surface, 2090));
    for (const drop of drops) {
      for (let frame = 0; frame < 720; frame++) {
        const state = getTokyoSignDropState(drop, frame * TAU / 720);
        if (state.opacity < 0.001 || state.y < -surface.height / 2) continue;
        assert.ok(Math.abs(state.x) - state.width > surface.width * 0.38, 'lettering remains clear');
        assert.ok(Math.abs(state.x) + state.width < surface.width / 2, 'bead remains on the face');
        assert.ok(state.y + state.height < surface.height / 2);
      }
    }
  }
});

test('Tokyo sign runoff reaches the lower rim and preserves velocity when it detaches', () => {
  const drop = createTokyoSignDrops(sign, 2089).find(({detaches}) => detaches)!;
  const period = 12 / drop.turns;
  const releaseTime = period * 0.66;
  const at = (seconds: number) => getTokyoSignDropState(drop, (seconds / period - drop.offset) * TAU / drop.turns);
  const step = 1e-6;
  const before = at(releaseTime - step);
  const edge = at(releaseTime);
  const after = at(releaseTime + step);
  close(edge.y, -sign.height / 2);
  close((edge.y - before.y) / step, (after.y - edge.y) / step, 0.00001);
  assert.ok(edge.opacity > 0.9, 'release is a visible continuation of the attached bead');
  assert.ok(at(releaseTime + 0.2).y < edge.y, 'gravity moves the drop downward');
  assert.equal(at(releaseTime + 0.45).opacity, 0, 'the drop fades before its invisible reset');
});

test('Tokyo sign water returns with continuous value and speed across the loop', () => {
  for (const drop of createTokyoSignDrops(sign, 2089)) {
    const step = 1e-7;
    const before = getTokyoSignDropState(drop, -step);
    const start = getTokyoSignDropState(drop, 0);
    const after = getTokyoSignDropState(drop, step);
    const repeated = getTokyoSignDropState(drop, TAU);
    for (const key of ['x', 'y', 'z', 'width', 'height', 'opacity'] as const) {
      close(start[key], repeated[key]);
      close(start[key] - before[key], after[key] - start[key], 1e-9);
    }
  }
});

test('Tokyo sign rain inherits the real panel transform and is independent of frame history', () => {
  const panel = new THREE.Object3D();
  panel.position.set(-9.08, 6.5, 4.648);
  panel.rotation.y = 0.71;
  const rain = createTokyoSignRain(panel, sign, 2089);
  const mesh = panel.children.find((object) => object.name === 'sign-rain') as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  assert.ok(mesh, 'the water is attached to the rendered panel');
  assert.equal(mesh.material.depthTest, true, 'buildings and panel mounts occlude water');
  assert.equal(mesh.material.depthWrite, false);
  rain.draw(1.2, 0.66, 0.95);
  panel.updateMatrixWorld(true);
  const center = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.dropCenter!, 0);
  const point = mesh.localToWorld(center.clone());
  const panelPoint = panel.worldToLocal(point);
  close(panelPoint.x, center.x);
  close(panelPoint.y, center.y);
  close(panelPoint.z, 0.014, 1e-8);
  const snapshot = () => ['dropCenter', 'dropSize', 'dropAlpha'].map((name) => [...mesh.geometry.attributes[name]!.array]);
  const direct = snapshot();
  rain.draw(5.8, 0.66, 0.95);
  rain.draw(0, 0.66, 0.95);
  rain.draw(1.2, 0.66, 0.95);
  assert.deepEqual(snapshot(), direct);
  mesh.geometry.dispose(); mesh.material.dispose();
});
