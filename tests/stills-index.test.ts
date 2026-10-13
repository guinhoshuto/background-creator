import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {captionImages, sectionNames, sectionTags, stillsIndex, writeRunIndex} from '../scripts/stills-index';

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

test('index: a stills run leaves index.html in its folder, over its PNGs and each subfolder that holds any', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stills-index-'));
  try {
    const run = path.join(root, '2026-10-12-qa-sand-terminal');
    // What a run leaves: stills, sheets and mockups, the baseline renders, report.json, seams/ and compare/, a sheet
    // in a folder of its own, plus a dot folder of its scratch and a folder with no PNG. Zoom/ goes last by name,
    // though APFS lists capitals first: the tags must not hang on the file system's order.
    for (const file of ['mock-chatting-0.png', 'sheet-chat-0.png', 'card-0.png', 'card-0.base.png', 'report.json', 'Zoom/card-0.png',
      'seams/bg-0.png', 'compare/card-0.png', 'sheets/light/sheet-light-0.png', '.seam-bg/0.png', 'notes/todo.txt']) {
      mkdirSync(path.dirname(path.join(run, file)), {recursive: true});
      writeFileSync(path.join(run, file), '');
    }
    assert.equal(writeRunIndex(run, 'sand-terminal · qa:kit'), '7 images in 5 section(s) (QST qa-sand-terminal, C compare, S seams, L light, Z Zoom)');
    const html = readFileSync(path.join(run, 'index.html'), 'utf8');
    assert.match(html, /<title>sand-terminal · qa:kit<\/title>/);
    assert.match(html, /<figure id="QST-01"><a href="mock-chatting-0\.png">.*<figcaption>QST-01 · mock-chatting-0<\/figcaption>/);
    assert.match(html, /<figcaption>QST-03 · card-0<\/figcaption>/);
    assert.match(html, /<figure id="L-01"><a href="sheets\/light\/sheet-light-0\.png">.*<figcaption>L-01 · sheet-light-0<\/figcaption>/);
    assert.doesNotMatch(html, /base\.png|seam-bg|notes/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('index: every npm run stills and qa:kit run writes its page after report.json, titled by the job, else by its folder', () => {
  // The runner needs a bundle and a browser, so its call is checked in the source, like render:pack's profile (tests/pack.test.ts).
  const source = readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'stills-run.ts'), 'utf8');
  const report = source.indexOf("writeFileSync(path.join(outDir, 'report.json')");
  const page = source.indexOf('writeRunIndex(outDir, job.title ?? path.basename(outDir))');
  assert.ok(report > 0 && page > report, 'runStills ends with writeRunIndex(outDir, job.title ?? path.basename(outDir)), after the sheets, the mockups and report.json');
});
