import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {
  USER_AGENT, checkOutDir, fetchReferences, formatSearch, httpWith, mergeSources, normalizeLicense, parseCommons,
  parseFetchList, realGit, searchReferences, type FetchEffects, type FetchedRecord, type Http,
} from '../scripts/reference-plan';

// Recorded shapes of the two APIs, with synthetic values (titles, people and ids are made up).
const COMMONS_SEARCH = {
  batchcomplete: '',
  query: {pages: {
    '-3': {title: 'File:Synthetic logo.png', index: 3, imageinfo: [{width: 400, height: 400, thumburl: 'https://upload.example/logo.png',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Synthetic_logo.png', extmetadata: {LicenseShortName: {value: 'Fair use'}}}]},
    '101': {title: 'File:Spiral A.jpg', index: 2, imageinfo: [{width: 6000, height: 3000, thumburl: 'https://upload.example/a-1600.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Spiral_A.jpg', extmetadata: {
        LicenseShortName: {value: 'CC BY 4.0'}, LicenseUrl: {value: 'https://creativecommons.org/licenses/by/4.0'},
        Artist: {value: '<a href="//commons.wikimedia.org/wiki/User:Someone">Observatory X</a>/A. N. Other'}, Credit: {value: '<span>Own work</span>'}}}]},
    '102': {title: 'File:Spiral B.tif', index: 1, imageinfo: [{width: 11000, height: 8000, thumburl: 'https://upload.example/b-1600.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Spiral_B.tif', extmetadata: {
        LicenseShortName: {value: 'Public domain'}, Artist: {value: 'Space Agency &amp; Partner'}}}]},
    '103': {title: 'File:No metadata.jpg', index: 4, imageinfo: [{width: 10, height: 10, thumburl: 'https://upload.example/n.jpg'}]},
  }},
};

const OPENVERSE_SEARCH = {
  result_count: 2, page_count: 1,
  results: [
    {id: 'aaaa-1111', title: 'Nebula C', width: 1024, height: 683, license: 'by', license_version: '2.0', creator: 'Telescope Team',
      foreign_landing_url: 'https://www.flickr.example/photos/1', url: 'https://live.example/c.jpg', attribution: '"Nebula C" by Telescope Team is licensed under CC BY 2.0.'},
    {id: 'bbbb-2222', title: 'Nebula D', width: 800, height: 600, license: 'by-nc', license_version: '2.0', creator: 'Someone',
      foreign_landing_url: 'https://www.flickr.example/photos/2', url: 'https://live.example/d.jpg'},
  ],
};

const commonsFile = (title: string, license: string, thumb?: string) => ({query: {pages: {'1': {title, index: 1,
  imageinfo: [{width: 100, height: 100, thumburl: thumb, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
    extmetadata: {LicenseShortName: {value: license}, Artist: {value: 'Synthetic Artist'}}}]}}}});

test('the User-Agent gives the store as the contact and carries no e-mail', () => {
  assert.match(USER_AGENT, /\(https:\/\/cacare\.co\)/);
  assert.doesNotMatch(USER_AGENT, /@/);
});

test('every real request sends the User-Agent, JSON and image alike, and a 429 stops with its Retry-After', async () => {
  const seen: Array<{url: string; agent: string}> = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    seen.push({url, agent: (init?.headers as Record<string, string>)['User-Agent']});
    if (url.includes('busy')) return new Response('slow down', {status: 429, statusText: 'Too Many Requests', headers: {'retry-after': '30'}});
    if (url.includes('.jpg')) return new Response(new Uint8Array([1, 2, 3]), {headers: {'content-type': 'image/jpeg'}});
    return Response.json({ok: true});
  }) as typeof fetch;
  const http = httpWith(fakeFetch);
  assert.deepEqual(await http.getJson('https://commons.wikimedia.org/w/api.php?x'), {ok: true});
  const image = await http.getBytes('https://upload.example/a.jpg');
  assert.equal(image.type, 'image/jpeg');
  assert.equal(image.bytes.length, 3);
  const refusal = await http.getJson('https://api.openverse.org/busy').then(() => 'no error', (error: Error) => error.message);
  assert.equal(refusal, '429 Too Many Requests from https://api.openverse.org/busy (retry after 30 s)');
  assert.equal(seen.length, 3);
  for (const {url, agent} of seen) {
    assert.match(agent ?? '', /\(https:\/\/cacare\.co\)/, `no store contact on ${url}`);
    assert.doesNotMatch(agent ?? '', /@/, `an e-mail in the User-Agent of ${url}`);
  }
});

test('licence labels from Commons and codes from Openverse map onto one code, and the unknown onto null', () => {
  const cases: Array<[string, string | null]> = [
    ['CC BY 4.0', 'by'], ['CC BY-SA 3.0 de', 'by-sa'], ['CC BY-SA 2.5', 'by-sa'], ['Public domain', 'pdm'], ['CC0', 'cc0'],
    ['by', 'by'], ['by-nc-sa', 'by-nc-sa'], ['pdm', 'pdm'], ['cc0', 'cc0'], ['CC BY-NC-ND 4.0', 'by-nc-nd'],
    ['Fair use', null], ['', null], ['GFDL', null], ['Attribution', null], ['bygone', null], ['CC BY-ND-SA 2.0', null],
  ];
  for (const [label, code] of cases) assert.equal(normalizeLicense(label), code, label);
});

test('a Commons response keeps the search order, plain-text credits and the page that shows the licence', () => {
  const found = parseCommons(COMMONS_SEARCH);
  assert.deepEqual(found.map((item) => item.id), ['File:Spiral B.tif', 'File:Spiral A.jpg', 'File:Synthetic logo.png', 'File:No metadata.jpg']);
  const [b, a, logo, bare] = found;
  assert.equal(b.license, 'pdm');
  assert.equal(b.creator, 'Space Agency & Partner');
  assert.equal(a.creator, 'Observatory X/A. N. Other');
  assert.equal(a.credit, 'Own work');
  assert.equal(a.licenseUrl, 'https://creativecommons.org/licenses/by/4.0');
  assert.equal(a.page, 'https://commons.wikimedia.org/wiki/File:Spiral_A.jpg');
  assert.equal(a.download, 'https://upload.example/a-1600.jpg');
  assert.equal(logo.license, null);
  assert.equal(bare.license, null);
  assert.equal(bare.licenseLabel, '');
});

test('search asks each service once per query, one at a time, and leaves out what has no allowed licence', async () => {
  const urls: string[] = [];
  const http: Http = {
    getJson: async (url) => { urls.push(url); return url.startsWith('https://commons.wikimedia.org/') ? COMMONS_SEARCH : OPENVERSE_SEARCH; },
    getBytes: async () => assert.fail('search downloads nothing'),
  };
  const pauses: number[] = [];
  const results = await searchReferences(['spiral galaxy'], {sources: ['commons', 'openverse'], limit: 8, width: 1600, licenses: ['cc0', 'pdm', 'by', 'by-sa']},
    http, async (ms) => { pauses.push(ms); });
  assert.equal(urls.length, 2);
  assert.deepEqual(pauses, [1000]);
  const commons = new URL(urls[0]);
  assert.equal(commons.searchParams.get('gsrsearch'), 'spiral galaxy');
  assert.equal(commons.searchParams.get('gsrnamespace'), '6');
  assert.equal(commons.searchParams.get('iiurlwidth'), '1600');
  assert.equal(new URL(urls[1]).searchParams.get('license'), 'cc0,pdm,by,by-sa');
  const [onCommons, onOpenverse] = results;
  assert.deepEqual(onCommons.kept.map((item) => item.id), ['File:Spiral B.tif', 'File:Spiral A.jpg']);
  assert.deepEqual(onCommons.dropped.map((item) => item.id), ['File:Synthetic logo.png', 'File:No metadata.jpg']);
  // Openverse filters by licence itself; what it sends outside the list is still left out.
  assert.deepEqual(onOpenverse.kept.map((item) => item.id), ['aaaa-1111']);
  assert.deepEqual(onOpenverse.dropped.map((item) => item.id), ['bbbb-2222']);
  const text = formatSearch(results, ['cc0', 'pdm', 'by', 'by-sa']).split('\n');
  assert.equal(text[1], '  File:Spiral B.tif | 11000x8000 | Public domain (pdm) | Space Agency & Partner | https://commons.wikimedia.org/wiki/File:Spiral_B.tif');
  assert.equal(text[3], '  left out 2: outside cc0,pdm,by,by-sa (Fair use, no licence)');
});

const fakeFetchEffects = (responses: Record<string, unknown>, images: Record<string, string>, existing: string[] = []) => {
  const written = new Map<string, Uint8Array>();
  const downloads: string[] = [];
  const pauses: number[] = [];
  const effects: FetchEffects = {
    getJson: async (url) => {
      const key = Object.keys(responses).find((part) => url.includes(part));
      return key ? responses[key] : {query: {pages: {'-1': {title: 'missing', missing: ''}}}};
    },
    getBytes: async (url) => { downloads.push(url); return {bytes: new Uint8Array(4), type: images[url] ?? 'image/jpeg'}; },
    pause: async (ms) => { pauses.push(ms); },
    exists: (file) => existing.includes(file),
    writeFile: (file, bytes) => { written.set(file, bytes); },
  };
  return {effects, written, downloads, pauses};
};

test('fetch downloads only allowed licences, as images, and never over an existing file', async () => {
  const responses = {
    'Spiral_free': commonsFile('File:Spiral free.jpg', 'Public domain', 'https://upload.example/free.jpg'),
    'Logo_unfree': commonsFile('File:Logo unfree.png', 'Fair use', 'https://upload.example/logo.png'),
    'Page_html': commonsFile('File:Page html.jpg', 'CC BY 4.0', 'https://upload.example/error-page'),
    'Old_one': commonsFile('File:Old one.jpg', 'CC0', 'https://upload.example/old.jpg'),
    'bbbb-2222': OPENVERSE_SEARCH.results[1],
    'aaaa-1111': OPENVERSE_SEARCH.results[0],
    'No_file': commonsFile('File:No file.jpg', 'Public domain'),
  };
  const {effects, written, downloads, pauses} = fakeFetchEffects(responses, {'https://upload.example/error-page': 'text/html; charset=utf-8'}, ['/refs/04_old.jpg']);
  const items = parseFetchList([
    {name: '01_free', commons: 'File:Spiral_free.jpg', width: 1800},
    {name: '02_unfree', commons: 'File:Logo_unfree.png'},
    {name: '03_html', commons: 'File:Page_html.jpg'},
    {name: '04_old', commons: 'File:Old_one.jpg'},
    {name: '05_nc', openverse: 'bbbb-2222'},
    {name: '06_by', openverse: 'aaaa-1111'},
    {name: '07_gone', commons: 'File:Nowhere.jpg'},
    {name: '08_no-file', commons: 'File:No_file.jpg'},
  ]);
  const outcome = await fetchReferences(items, {outDir: '/refs', width: 1600, licenses: ['cc0', 'pdm', 'by', 'by-sa'], overwrite: false}, effects);
  assert.deepEqual([...written.keys()], ['/refs/01_free.jpg', '/refs/06_by.jpg']);
  assert.deepEqual(downloads, ['https://upload.example/free.jpg', 'https://upload.example/error-page', 'https://upload.example/old.jpg', 'https://live.example/c.jpg']);
  assert.deepEqual(outcome.refused.map((item) => item.name), ['02_unfree', '03_html', '04_old', '05_nc', '07_gone', '08_no-file']);
  assert.equal(outcome.refused[0].why, 'licence Fair use is outside cc0,pdm,by,by-sa');
  assert.equal(outcome.refused[1].why, 'the download is text/html; charset=utf-8, not an image');
  assert.equal(outcome.refused[2].why, '/refs/04_old.jpg exists (pass --overwrite)');
  assert.equal(outcome.refused[3].why, 'licence by-nc 2.0 is outside cc0,pdm,by,by-sa');
  assert.equal(outcome.refused[4].why, 'nothing to download on Commons');
  assert.equal(outcome.refused[5].why, 'nothing to download on Commons');
  const [free, by] = outcome.written;
  assert.deepEqual({file: free.file, license: free.license, creator: free.creator, bytes: free.bytes}, {file: '01_free.jpg', license: 'pdm', creator: 'Synthetic Artist', bytes: 4});
  assert.equal(by.page, 'https://www.flickr.example/photos/1');
  assert.equal(by.credit, '"Nebula C" by Telescope Team is licensed under CC BY 2.0.');
  // One pause before every request but the first: 8 lookups and 4 downloads.
  assert.equal(pauses.length, 11);
});

test('fetch asks Commons for the width of each item, or the default', async () => {
  const urls: string[] = [];
  const {effects} = fakeFetchEffects({}, {});
  const getJson = effects.getJson;
  effects.getJson = async (url) => { urls.push(url); return getJson(url); };
  await fetchReferences(parseFetchList([{name: 'a', commons: 'File:A.jpg', width: 1800}, {name: 'b', commons: 'File:B.jpg'}]),
    {outDir: '/refs', width: 1600, licenses: ['pdm'], overwrite: false}, effects);
  assert.deepEqual(urls.map((url) => [new URL(url).searchParams.get('titles'), new URL(url).searchParams.get('iiurlwidth')]), [['File:A.jpg', '1800'], ['File:B.jpg', '1600']]);
});

test('the fetch list refuses a path in a name, a repeated name and an item with both or neither source', () => {
  const refusal = (data: unknown) => { try { parseFetchList(data); return 'accepted'; } catch (error) { return (error as Error).message; } };
  assert.match(refusal([{name: '../escape', commons: 'File:A.jpg'}]), /name must be letters/);
  assert.match(refusal([{name: 'a', commons: 'File:A.jpg'}, {name: 'a', commons: 'File:B.jpg'}]), /the name a repeats/);
  assert.match(refusal([{name: 'a', commons: 'File:A.jpg', openverse: 'x'}]), /exactly one of commons/);
  assert.match(refusal([{name: 'a'}]), /exactly one of commons/);
  assert.match(refusal([{name: 'a', commons: 'File:A.jpg', width: 0}]), /width must be a positive integer/);
  assert.match(refusal([]), /non-empty JSON array/);
  assert.equal(refusal([{name: '01_ok.v2', commons: 'File:A.jpg'}]), 'accepted');
});

test('sources.json keeps earlier records and replaces the ones fetched again', () => {
  const record = (name: string, title: string) => ({name, title} as FetchedRecord);
  assert.deepEqual(mergeSources([record('02_b', 'old b'), record('01_a', 'a')], [record('02_b', 'new b'), record('03_c', 'c')]).map((item) => `${item.name} ${item.title}`),
    ['01_a a', '02_b new b', '03_c c']);
});

test('fetch refuses an output folder git would track, in a real repo', (t) => {
  const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'reference-git-')));
  t.after(() => rmSync(repo, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(path.join(repo, '.gitignore'), 'out/\n');
  mkdirSync(path.join(repo, 'docs'));
  const refusal = (dir: string) => { try { checkOutDir(dir, realGit); return 'accepted'; } catch (error) { return (error as Error).message; } };
  assert.match(refusal(path.join(repo, 'docs', 'galaxy')), /^Refusing .*git would track it/);
  assert.match(refusal(path.join(repo, 'new-folder', 'deep')), /^Refusing /);
  assert.equal(refusal(path.join(repo, 'out', '.scratch', 'reference')), 'accepted');
  const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'reference-plain-')));
  t.after(() => rmSync(outside, {recursive: true, force: true}));
  assert.equal(refusal(path.join(outside, 'Visual Ref', 'Galaxy')), 'accepted');
});
