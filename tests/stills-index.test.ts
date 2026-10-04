import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {captionImages, sectionNames, sectionTags, stillsIndex} from '../scripts/stills-index';

test('index: folders are named by what tells them apart and tagged by initials', () => {
  const dirs = ['out/review/2026-10-04-qa-halloween-midnight', 'out/review/2026-10-04-qa-halloween-haunted-mansion',
    'out/review/2026-10-04-qa-halloween-haunted-interior', 'out/review/2026-10-04-qa-halloween-cobweb'];
  const names = sectionNames(dirs);
  assert.deepEqual(names, ['midnight', 'haunted-mansion', 'haunted-interior', 'cobweb']);
  assert.deepEqual(sectionTags(names), ['M', 'HM', 'HI', 'C']);
  assert.deepEqual(sectionTags(['cobweb', 'christmas']), ['C', 'C2']);
  assert.deepEqual(sectionNames(['out/review/2026-10-04-qa-halloween-cobweb']), ['qa-halloween-cobweb']);
});

test('index: mockups come first, then sheets, and every image gets a stable numbered caption', () => {
  const images = captionImages('HM', ['label-0.png', 'sheet-chat-0.png', 'mock-screen-0.png', 'report.json', 'mock-chatting-0.png', 'card-0.base.png']);
  assert.deepEqual(images.map((image) => image.caption),
    ['HM-01 · mock-chatting-0', 'HM-02 · mock-screen-0', 'HM-03 · sheet-chat-0', 'HM-04 · label-0']);
});

test('index: the page shows each caption under its image, with links relative to the page', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stills-index-'));
  try {
    for (const name of ['2026-10-04-qa-halloween-midnight', '2026-10-04-qa-halloween-cobweb']) {
      mkdirSync(path.join(root, name));
      writeFileSync(path.join(root, name, 'mock-chatting-0.png'), '');
    }
    const out = path.join(root, 'index.html');
    const summary = stillsIndex([out, path.join(root, '2026-10-04-qa-halloween-midnight'), path.join(root, '2026-10-04-qa-halloween-cobweb'), '--title', 'Halloween QA']);
    assert.match(summary, /2 images in 2 section/);
    const html = readFileSync(out, 'utf8');
    assert.match(html, /<figure id="M-01"><a href="2026-10-04-qa-halloween-midnight\/mock-chatting-0\.png">.*<figcaption>M-01 · mock-chatting-0<\/figcaption>/);
    assert.match(html, /<figcaption>C-01 · mock-chatting-0<\/figcaption>/);
    assert.match(html, /<title>Halloween QA<\/title>/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
