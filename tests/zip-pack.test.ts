import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {appendFile, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {
  assertZip32, assertZipName, buyerPathIssues, checkPackContents, readCentralDirectory, zipFileName, zipLayout, zipPack,
  type ZipPackEffects,
} from '../scripts/pack-contents';
import {packPropsHash, type PlannedFile} from '../scripts/pack-plan';

// Tiny files in a temporary folder, no render: the zip only reads what the plan names.

const GiB = 1024 ** 3;
const HEAD = {
  webm: Buffer.from('1a45dfa3', 'hex'),
  png: Buffer.from('89504e470d0a1a0a', 'hex'),
  gif: Buffer.from('GIF89a', 'latin1'),
} as const;

const file = (relative: string, format: 'webm' | 'png' | 'gif', extra: Partial<PlannedFile> = {}): PlannedFile => ({
  composition: 'FakeLoop', kind: 'background', folder: relative.split('/')[0]!, format,
  props: {}, exportProps: {file: relative}, output: `out/packs/test/${relative}`,
  canvas: {width: 2, height: 2}, fps: 30, frames: 1, ...extra,
});

const MASK = 'masks/test-webcam-round-mask.png';
const PLAN: readonly PlannedFile[] = [
  file('backgrounds/test-background.webm', 'webm'),
  file('text-boxes/test-card.png', 'png', {kind: 'block', size: 'card'}),
  file('twitch-panels/test-twitch-panel.gif', 'gif', {kind: 'block', size: 'twitch-panel'}),
  file('borders/test-webcam-round.webm', 'webm', {kind: 'border', size: 'webcam-round', mask: `out/packs/test/${MASK}`}),
  file(MASK, 'png', {kind: 'border', size: 'webcam-round', role: 'mask', frame: 0}),
];
const NAMES = PLAN.map((entry) => entry.output.slice('out/packs/test/'.length));
const SORTED = [...NAMES].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));

const relativeOf = (entry: PlannedFile) => entry.output.slice('out/packs/test/'.length);
const manifestOf = (plan: readonly PlannedFile[]) => ({
  name: 'test',
  files: plan.map((entry) => ({
    file: relativeOf(entry), composition: entry.composition, kind: entry.kind, size: entry.size ?? null,
    format: entry.format, propsHash: packPropsHash(entry),
    ...(entry.role ? {role: entry.role} : {}), ...(entry.mask ? {mask: entry.mask.slice('out/packs/test/'.length)} : {}),
  })),
});

/** A finished pack in a fresh temporary folder: every planned file (its format's first bytes) and the manifest. */
const makePack = async (plan: readonly PlannedFile[] = PLAN) => {
  const root = await mkdtemp(path.join(tmpdir(), 'zip-pack-'));
  const packDirectory = path.join(root, 'pack');
  const deliveriesDirectory = path.join(root, 'deliveries');
  for (const entry of plan) {
    const target = path.join(packDirectory, relativeOf(entry));
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, Buffer.concat([HEAD[entry.format as keyof typeof HEAD], Buffer.from(`${relativeOf(entry)}\n`.repeat(40))]));
  }
  await writeFile(path.join(packDirectory, 'manifest.json'), `${JSON.stringify(manifestOf(plan), null, 2)}\n`);
  return {root, packDirectory, deliveriesDirectory};
};

type Pack = Awaited<ReturnType<typeof makePack>>;

const run = (pack: Pack, options: {check?: boolean; plan?: readonly PlannedFile[]; effects?: Partial<ZipPackEffects>} = {}) => {
  const logs: string[] = [];
  const result = zipPack({
    pack: 'test', plan: options.plan ?? PLAN, packDirectory: pack.packDirectory,
    deliveriesDirectory: pack.deliveriesDirectory, check: options.check ?? false,
    effects: {freeBytes: async () => 100 * GiB, log: (message) => logs.push(message), ...options.effects},
  });
  return {result, logs};
};

const zipPath = (pack: Pack) => path.join(pack.deliveriesDirectory, zipFileName('test'));
const entryNames = async (pack: Pack) => readCentralDirectory(await readFile(zipPath(pack))).map((entry) => entry.name);

const withPack = async (body: (pack: Pack) => Promise<void>, plan?: readonly PlannedFile[]) => {
  const pack = await makePack(plan);
  try {
    await body(pack);
  } finally {
    await rm(pack.root, {recursive: true, force: true});
  }
};

test('zip takes only planned files', () => withPack(async (pack) => {
  await writeFile(path.join(pack.packDirectory, 'preview.html'), '<html></html>');
  await writeFile(path.join(pack.packDirectory, '.DS_Store'), 'x');
  assert.equal((await run(pack).result).code, 0);
  assert.deepEqual(await entryNames(pack), SORTED);
}));

test('refuses a missing planned file of every format', async () => {
  for (const missing of ['backgrounds/test-background.webm', 'text-boxes/test-card.png', 'twitch-panels/test-twitch-panel.gif', MASK]) {
    await withPack(async (pack) => {
      await rm(path.join(pack.packDirectory, missing));
      await assert.rejects(run(pack).result, (error: Error) => {
        assert.match(error.message, /Missing 1 planned files in .*:\n {2}(.+)\nRun npm run render:pack -- test to finish the pack\./);
        assert.match(error.message, new RegExp(`\\n {2}${missing.replace(/\./g, '\\.')}\\n`));
        return true;
      });
      assert.equal(existsSync(pack.deliveriesDirectory), false);
    });
  }
});

test('refuses stale manifest entries', () => withPack(async (pack) => {
  const manifest = manifestOf(PLAN);
  const stale = ['borders/test-screen-16x9.webm', 'borders/test-screen-16x9.png', 'borders/test-screen-4x3.webm', 'borders/test-screen-4x3.png'];
  manifest.files.push(...stale.map((name) => ({...manifest.files[0]!, file: name})));
  await writeFile(path.join(pack.packDirectory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(run(pack).result, (error: Error) => {
    assert.match(error.message, /4 manifest entries are not in the plan/);
    for (const name of stale) assert.ok(error.message.includes(`  ${name}\n`), name);
    return true;
  });
}));

test('refuses a missing or stale props hash', () => withPack(async (pack) => {
  const manifest = manifestOf(PLAN);
  delete (manifest.files[0] as {propsHash?: string}).propsHash;
  manifest.files[1]!.propsHash = packPropsHash({...PLAN[1]!, exportProps: {other: true}});
  await writeFile(path.join(pack.packDirectory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(run(pack).result, (error: Error) => {
    assert.match(error.message, /backgrounds\/test-background\.webm: no props hash is recorded/);
    assert.match(error.message, /text-boxes\/test-card\.png: rendered from other props than the plan/);
    return true;
  });
}));

test('refuses interrupted builds, warns on loose files', async () => {
  const signs: ((directory: string) => Promise<void>)[] = [
    (directory) => writeFile(path.join(directory, 'borders/test-webcam-round.webm.json'), '{}'),
    (directory) => mkdir(path.join(directory, '.asset-render-abc')),
    (directory) => writeFile(path.join(directory, 'manifest.json.tmp'), '{}'),
  ];
  for (const leave of signs) {
    await withPack(async (pack) => {
      await leave(pack.packDirectory);
      await assert.rejects(run(pack).result, /An interrupted build left files in/);
      assert.equal(existsSync(pack.deliveriesDirectory), false);
    });
  }
  await withPack(async (pack) => {
    await writeFile(path.join(pack.packDirectory, 'preview.html'), '<html></html>');
    await writeFile(path.join(pack.packDirectory, 'text-boxes/old-name.webm'), HEAD.webm);
    await writeFile(path.join(pack.packDirectory, '.DS_Store'), 'x');
    await writeFile(path.join(pack.packDirectory, 'text-boxes/._x'), 'x');
    const {result, logs} = run(pack);
    assert.equal((await result).code, 0);
    const text = logs.join('\n');
    assert.match(text, /Warning: 2 file\(s\) in .* are not in the plan and stay out of the zip/);
    assert.ok(text.includes('  preview.html') && text.includes('  text-boxes/old-name.webm'));
    assert.ok(!text.includes('.DS_Store') && !text.includes('._x'));
    assert.deepEqual(await entryNames(pack), SORTED);
  });
});

test('no root folder, no directory entries', () => withPack(async (pack) => {
  await run(pack).result;
  const names = await entryNames(pack);
  assert.equal(names.length, PLAN.length);
  for (const name of names) {
    assert.ok(!name.startsWith('test/'), name);
    assert.ok(!name.endsWith('/'), name);
  }
}));

test('same input gives the same bytes', () => withPack(async (first) => withPack(async (second) => {
  const old = new Date('2001-02-03T04:05:06Z');
  for (const name of NAMES) await utimes(path.join(second.packDirectory, name), old, old);
  const a = await run(first).result;
  const b = await run(second, {plan: [...PLAN].reverse()}).result;
  const bytesA = await readFile(zipPath(first));
  assert.deepEqual(bytesA, await readFile(zipPath(second)));
  assert.equal(a.sha256, b.sha256);
  assert.equal(a.sha256, createHash('sha256').update(bytesA).digest('hex'));
})));

test('an independent reader accepts the zip', () => withPack(async (pack) => {
  await run(pack).result;
  const tested = spawnSync('python3', ['-m', 'zipfile', '-t', zipPath(pack)], {encoding: 'utf8'});
  assert.equal(tested.status, 0, tested.stderr + tested.stdout);
  const listed = spawnSync('python3', ['-c', [
    'import sys, zipfile',
    'z = zipfile.ZipFile(sys.argv[1])',
    'assert z.testzip() is None',
    'print(" ".join(f"{i.filename}:{i.compress_type}:{i.date_time}".replace(" ", "") for i in z.infolist()))',
  ].join('\n'), zipPath(pack)], {encoding: 'utf8'});
  assert.equal(listed.status, 0, listed.stderr);
  const items = listed.stdout.trim().split(' ');
  assert.deepEqual(items.map((item) => item.split(':')[0]), SORTED);
  // Stored (method 0) and dated 1980-01-01 00:00, every entry.
  for (const item of items) assert.match(item, /:0:\(1980,1,1,0,0,0\)$/);
}));

test('buyer file names are enforced', async () => {
  assert.deepEqual(buyerPathIssues(SORTED), []);
  assert.equal(buyerPathIssues(['text-boxes/BlockLoop-card.png']).length, 1);
  const at = (length: number) => `borders/${'a'.repeat(length - 'borders/'.length - '.webm'.length)}.webm`;
  assert.deepEqual(buyerPathIssues([at(100)]), []);
  assert.match(buyerPathIssues([at(101)]).join('\n'), /101 characters, over the 100/);
  assert.match(buyerPathIssues(['chat/test-a.png', 'CHAT/test-a.png']).join('\n'), /same path/);
  assert.match(buyerPathIssues(['chat/test-a.png', 'borders/test-a.png']).join('\n'), /same file name/);
  assert.doesNotThrow(() => assertZipName(`${'a'.repeat(66)}.zip`));
  assert.throws(() => assertZipName(`${'a'.repeat(67)}.zip`), /71 characters, over the 70/);
  const bad = [file('text-boxes/BlockLoop-card.png', 'png'), ...PLAN.slice(1)];
  await withPack(async (pack) => {
    await assert.rejects(run(pack, {plan: bad}).result, /text-boxes\/BlockLoop-card\.png: not a buyer file name/);
  }, bad);
});

test('disk guard stops before writing', () => withPack(async (pack) => {
  await run(pack).result;
  const size = (await readFile(zipPath(pack))).length;
  await rm(pack.deliveriesDirectory, {recursive: true});
  await assert.rejects(run(pack, {effects: {freeBytes: async () => size + GiB - 1}}).result, /Not enough free space/);
  assert.equal(existsSync(pack.deliveriesDirectory), false);
  assert.equal((await run(pack, {effects: {freeBytes: async () => size + GiB}}).result).code, 0);
  assert.equal((await readFile(zipPath(pack))).length, size);
}));

test('--check never writes', () => withPack(async (pack) => {
  assert.equal((await run(pack, {check: true}).result).code, 2);
  assert.equal(existsSync(pack.deliveriesDirectory), false);
  await run(pack).result;
  const before = await readFile(zipPath(pack));
  const listing = await readdir(pack.deliveriesDirectory);
  assert.equal((await run(pack, {check: true}).result).code, 0);
  // Same size, other bytes: the zip it would make differs.
  const card = path.join(pack.packDirectory, 'text-boxes/test-card.png');
  const bytes = await readFile(card);
  bytes[bytes.length - 2] = 0x21;
  await writeFile(card, bytes);
  assert.equal((await run(pack, {check: true}).result).code, 2);
  assert.deepEqual(await readFile(zipPath(pack)), before);
  assert.deepEqual(await readdir(pack.deliveriesDirectory), listing);
  await rm(zipPath(pack));
  assert.equal((await run(pack, {check: true}).result).code, 2);
  assert.deepEqual(await readdir(pack.deliveriesDirectory), []);
}));

test('interrupted write leaves the old zip intact', () => withPack(async (pack) => {
  await run(pack).result;
  const before = await readFile(zipPath(pack));
  await appendFile(path.join(pack.packDirectory, 'text-boxes/test-card.png'), 'more');
  let chunks = 0;
  const writeChunk: ZipPackEffects['writeChunk'] = async (handle, chunk) => {
    if (++chunks > 3) throw new Error('disk went away');
    await handle.write(chunk);
  };
  await assert.rejects(run(pack, {effects: {writeChunk}}).result, /disk went away/);
  assert.deepEqual(await readFile(zipPath(pack)), before);
  assert.deepEqual(await readdir(pack.deliveriesDirectory), [zipFileName('test')]);
}));

test('refuses over 4 GiB', () => {
  const name = 'backgrounds/test-background.webm';
  const overhead = zipLayout([{name, size: 0}]).totalBytes;
  assert.throws(() => assertZip32([{name, size: 4_294_967_296 - overhead}]), /The pack is over 4 GiB: ZIP64 is not supported; split the formats into another pack\./);
  assert.equal(assertZip32([{name, size: 4_294_967_295 - overhead}]).totalBytes, 4_294_967_295);
});

test('magic bytes must match the extension', async () => {
  const wrong = {webm: HEAD.png, png: HEAD.gif, gif: HEAD.png} as const;
  for (const [name, format] of [['backgrounds/test-background.webm', 'webm'], ['text-boxes/test-card.png', 'png'], ['twitch-panels/test-twitch-panel.gif', 'gif']] as const) {
    await withPack(async (pack) => {
      await writeFile(path.join(pack.packDirectory, name), Buffer.concat([wrong[format], Buffer.from('payload')]));
      await assert.rejects(checkPackContents({pack: 'test', plan: PLAN, packDirectory: pack.packDirectory}),
        new RegExp(`${name.replace(/\./g, '\\.')}: its first bytes are not those of a ${format} file`));
    });
  }
});

test('refuses a file that changes between passes', () => withPack(async (pack) => {
  const betweenPasses = () => appendFile(path.join(pack.packDirectory, 'text-boxes/test-card.png'), 'x');
  await assert.rejects(run(pack, {effects: {betweenPasses}}).result, /text-boxes\/test-card\.png changed size between passes/);
  assert.equal(existsSync(zipPath(pack)), false);
}));
