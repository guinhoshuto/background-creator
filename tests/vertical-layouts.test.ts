import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {planPack, realPackDeps} from '../scripts/pack-plan';
import {isQaOnly, overlayCatalog} from '../src/catalog';
import {
  FACE_BAND, LIVE_COMMENTS_CLEAR, LiveFrameFrame, RING_WIDTH, VERTICAL_CANVAS, VERTICAL_LAYOUTS, VERTICAL_LAYOUT_IDS,
  centerOf, cornerRectSdf, getLiveFrameScene, holePath, layoutModes, liveFrameLoopSchema, minDistanceOver,
  offsetCornerRect, rectInside, type LiveFrameLoopProps, type LiveFrameScene,
} from '../src/overlays/vertical';

/**
 * The vertical kind's layouts against the zones the app's interface covers (owner's spec §3,
 * §4.2), and the frame that cuts their windows. Pure geometry and markup: nothing renders.
 */

const N = 480;
const MID = N / 2;
const SCREEN = {x: 0, y: 0, ...VERTICAL_CANVAS};
const propsOf = (layout: string, chatMode: string, extra: Record<string, unknown> = {}): LiveFrameLoopProps =>
  liveFrameLoopSchema.parse({layout, chatMode, ...extra});

test('vertical layouts: every block inside the screen, ring included, with even position and size', () => {
  for (const id of VERTICAL_LAYOUT_IDS) {
    const layout = VERTICAL_LAYOUTS[id];
    assert.equal(layout.id, id);
    assert.ok(layout.chatModes.includes('open'), `${id}: open is every layout's default chat mode`);
    assert.equal(new Set(layout.windows.map((window) => window.id)).size, layout.windows.length, id);
    for (const window of layout.windows) {
      for (const value of [window.x, window.y, window.width, window.height]) {
        assert.ok(Number.isInteger(value) && value % 2 === 0, `${id}/${window.id}: ${value} must be an even integer`);
      }
      assert.ok(rectInside(offsetCornerRect(window, RING_WIDTH), SCREEN), `${id}/${window.id}: the ring leaves the screen`);
    }
  }
  // The spec's 760×1351 game, rounded up to the even 1352 (see layouts.ts).
  assert.equal(VERTICAL_LAYOUTS['phone-game-bubble'].windows.find((window) => window.role === 'game')!.height, 1352);
});

test('vertical layouts: the pill is round top and bottom, its radius half its width', () => {
  const [pill] = VERTICAL_LAYOUTS['single-stadium'].windows;
  assert.ok(pill);
  assert.deepEqual(pill.radii, [pill.width / 2, pill.width / 2, pill.width / 2, pill.width / 2]);
  // The top of the arc and the side where the half circles meet the straight sides lie on the edge.
  assert.equal(cornerRectSdf(pill, pill.x + pill.width / 2, pill.y), 0);
  assert.equal(cornerRectSdf(pill, pill.x, pill.y + pill.width / 2), 0);
  // The bubble is a circle: radius half its side.
  const bubble = VERTICAL_LAYOUTS['phone-game-bubble'].windows.find((window) => window.role === 'camera')!;
  assert.equal(bubble.width, bubble.height);
  assert.deepEqual(bubble.radii, [150, 150, 150, 150]);
});

/**
 * Camera windows whose vertical centre falls outside the FACE_BAND (y 230–1250): the spec's own
 * layout C puts the bubble under the game (§4.2 C), so it is fixed here as a known exception. A new
 * layout or a moved window that leaves the band fails, until the owner approves it here.
 */
const FACE_BAND_EXCEPTIONS: readonly string[] = ['phone-game-bubble/camera'];

test('vertical layouts: the camera sits in the FACE_BAND, with the bubble as the one fixed exception', () => {
  const camera = (id: keyof typeof VERTICAL_LAYOUTS) => VERTICAL_LAYOUTS[id].windows.find((window) => window.role === 'camera')!;
  // The three-blocks camera block lies wholly inside the band.
  assert.ok(rectInside(camera('three-blocks'), FACE_BAND), 'three-blocks camera');
  // One window: it is taller than the band, so its vertical centre is what must sit inside.
  for (const id of ['single-stadium', 'single-rect'] as const) {
    const {y} = centerOf(camera(id));
    assert.ok(y >= FACE_BAND.y && y <= FACE_BAND.y + FACE_BAND.height, `${id}: centre at y ${y}`);
  }
  const outside = VERTICAL_LAYOUT_IDS.flatMap((id) => VERTICAL_LAYOUTS[id].windows
    .filter((window) => window.role === 'camera')
    .filter((window) => {
      const {y} = centerOf(window);
      return y < FACE_BAND.y || y > FACE_BAND.y + FACE_BAND.height;
    })
    .map((window) => `${id}/${window.id}`));
  assert.deepEqual(outside, FACE_BAND_EXCEPTIONS);
});

/**
 * The windows whose edge reaches into LIVE_COMMENTS_CLEAR (x 0–780, y 1290–1775), per layout and
 * chat mode, as the geometry measures them: `window` when the window itself enters, `ring` when
 * only its ring (13 px outside the window) does. Fixed by hand, compared exactly, so a new
 * intrusion fails until the owner approves it here. The chat block is meant to be there.
 */
const COMMENTS_CLEAR_CROSSINGS: Record<string, Record<string, 'window' | 'ring'>> = {
  'single-stadium/open': {camera: 'window'},
  'single-rect/open': {camera: 'window'},
  'three-blocks/window': {game: 'ring', chat: 'window'},
  'three-blocks/panel': {game: 'ring'},
  'three-blocks/open': {game: 'ring'},
  'phone-game-bubble/open': {game: 'window', camera: 'window'},
};

test('vertical layouts: what reaches into the comments keep-clear zone is exactly the fixed table', () => {
  const measured: Record<string, Record<string, 'window' | 'ring'>> = {};
  for (const {layout, chatMode} of layoutModes()) {
    const crossings: Record<string, 'window' | 'ring'> = {};
    for (const window of getLiveFrameScene(propsOf(layout.id, chatMode), 0, N).windows) {
      const distance = minDistanceOver(window, LIVE_COMMENTS_CLEAR, 1);
      if (distance < 0) crossings[window.id] = 'window';
      else if (distance < RING_WIDTH) crossings[window.id] = 'ring';
    }
    measured[`${layout.id}/${chatMode}`] = crossings;
  }
  assert.deepEqual(measured, COMMENTS_CLEAR_CROSSINGS);
});

/** The markup that must never move: every hole's clip and the rings, which come last in the SVG. */
const stillParts = (markup: string) => ({
  holes: markup.match(/<defs data-layer="holes">[\s\S]*?<\/defs>/g) ?? [],
  ring: markup.slice(markup.indexOf('<g data-layer="ring">')),
});

test('vertical frame: windows and rings are the same on every frame while the fill moves', () => {
  for (const {layout, chatMode} of layoutModes()) {
    const props = propsOf(layout.id, chatMode, {fill: 'gradient', fillColors: ['#3A3548', '#7C6FA8', '#C9A3D9'], fillSpeed: 16});
    const draw = (frame: number) => renderToStaticMarkup(createElement(LiveFrameFrame, {props, frame, durationInFrames: N}));
    const first = draw(0);
    const middle = draw(MID);
    const where = `${layout.id}/${chatMode}`;
    assert.notEqual(first, middle, `${where}: the gradient must move, or this test proves nothing`);
    assert.deepEqual(stillParts(middle), stillParts(first), where);
    assert.equal(stillParts(first).holes.length, getLiveFrameScene(props, 0, N).windows.length
      + getLiveFrameScene(props, 0, N).rings.reduce((count, ring) => count + ring.holesAbove.length, 0), where);
    assert.match(stillParts(first).ring, /<path d="M/, `${where}: the ring is drawn`);
  }
});

/** Whether the scene paints point (x, y): the background and panel under every hole, each ring under the holes above it. */
const painted = (scene: LiveFrameScene, x: number, y: number) => {
  const outsideAll = (windows: readonly {radii: unknown}[]) => (windows as LiveFrameScene['windows']).every((window) => cornerRectSdf(window, x, y) >= 0);
  const background = outsideAll(scene.windows);
  const panel = scene.panel !== null && cornerRectSdf(scene.panel, x, y) < 0 && background;
  const ring = scene.rings.some((entry, index) => {
    const distance = cornerRectSdf(entry.window, x, y);
    return distance >= 0 && distance <= RING_WIDTH && outsideAll(scene.windows.slice(index + 1));
  });
  return background || panel || ring;
};

test('vertical frame: alpha 0 at the centre of every window, on every layout, mode and sampled frame', () => {
  for (const {layout, chatMode} of layoutModes()) {
    const props = propsOf(layout.id, chatMode);
    for (const frame of [0, MID, N - 1]) {
      const scene = getLiveFrameScene(props, frame, N);
      const where = `${layout.id}/${chatMode} f${frame}`;
      const markup = renderToStaticMarkup(createElement(LiveFrameFrame, {props, frame, durationInFrames: N}));
      // Each window is an evenodd hole of the screen, in the scene and in the markup that draws it.
      assert.deepEqual(scene.holes, scene.windows.map(holePath), where);
      // The holes clip the background nested: hole i's clipped group opens straight onto hole i+1's,
      // and the last one holds the fill and the panel.
      const chain = scene.holes.map((hole, index) => `<clipPath id="live-hole-${index}" clipPathUnits="userSpaceOnUse">`
        + `<path d="${hole}" clip-rule="evenodd"></path></clipPath></defs><g clip-path="url(#live-hole-${index})">`).join('<g><defs data-layer="holes">');
      assert.ok(markup.includes(`<g><defs data-layer="holes">${chain}`), `${where}: the holes clip the background, nested`);
      // A clip that is defined but never applied cuts nothing: every one the frame defines is used (the rings' too).
      for (const [, id] of markup.matchAll(/<clipPath id="([^"]+)"/g)) {
        assert.ok(markup.includes(`clip-path="url(#${id})"`), `${where}: clip ${id} is defined but never applied`);
      }
      scene.rings.forEach((ring, index) => assert.deepEqual(ring.holesAbove, scene.holes.slice(index + 1), `${where}: ${ring.window.id}`));
      for (const window of scene.windows) {
        const {x, y} = centerOf(window);
        assert.equal(painted(scene, x, y), false, `${where}: ${window.id} centre is painted`);
      }
      // And the background is there: a corner of the screen far from every window is painted.
      assert.equal(painted(scene, 4, 4), true, where);
    }
  }
  // The chat block is a window only in `window` mode; in `panel` mode it is painted.
  const panel = getLiveFrameScene(propsOf('three-blocks', 'panel'), 0, N);
  assert.ok(panel.panel);
  assert.equal(painted(panel, centerOf(panel.panel).x, centerOf(panel.panel).y), true);
});

test('vertical frame: a chat mode without a chat block is refused with the way out', () => {
  for (const id of ['single-stadium', 'single-rect', 'phone-game-bubble']) {
    for (const chatMode of ['window', 'panel']) {
      const result = liveFrameLoopSchema.safeParse({layout: id, chatMode});
      assert.equal(result.success, false, `${id}/${chatMode}`);
      assert.match(result.error!.issues[0]!.message, new RegExp(`${id} has no chat block: use chatMode "open", or the layout three-blocks`));
    }
  }
});

test('vertical mocks: the UI mocks are QA only, and the pack planner refuses them', () => {
  const qa = Object.values(overlayCatalog).filter((entry) => isQaOnly(entry)).map((entry) => entry.id);
  assert.deepEqual(qa, ['LiveUiMock', 'FeedUiMock']);
  for (const composition of qa) {
    assert.throws(
      () => planPack({name: 'test-vertical', items: [{composition, formats: ['png']}]} as never, realPackDeps),
      new RegExp(`${composition} is a QA mock of an app's interface and never ships in a pack`),
    );
  }
});
