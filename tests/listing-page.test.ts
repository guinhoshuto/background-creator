import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {ListingError, guideFileName, listingCopies, parseListing, planListing, renderListingPage, zipSize, type PackInputs} from '../scripts/listing-plan';

// Pure checks on listings/<pack>.md and the plan built from it; no file is copied.

const TAGS = Array.from({length: 13}, (_, index) => `tag number ${index + 1}`);
const listingText = (overrides: {front?: string; title?: string; tags?: string[]; description?: string; extra?: string} = {}) => [
  '---', overrides.front ?? 'pack: fake-kit\nprice: US$ 12.99\ncaption: FK', '---', '',
  '## Title', '', overrides.title ?? 'Fake Overlay Kit, Animated', '',
  '## Tags', '', (overrides.tags ?? TAGS).join(', '), '',
  '## Description', '', overrides.description ?? 'A fake kit.\n\n✦ WHAT YOU GET\n- PDF guide with your download link (zip, about {{ZIP_SIZE}})', '',
  overrides.extra ?? '## Before publishing\n\n- Check the motifs.', '',
].join('\n');

const FILE = 'listings/fake-kit.md';
const problemsOf = (text: string) => {
  try {
    parseListing(text, FILE);
  } catch (error) {
    assert.ok(error instanceof ListingError);
    return error.message;
  }
  assert.fail('the listing was accepted');
};

const SHIPPED = {version: 1, url: 'https://cacare.co/packs/fake-kit/abcd1234/fake-kit-overlay-pack-v1.zip', bytes: 1_073_784_702};
const THUMBS = ['02-grid.jpg', '01-cover-stage.jpg', 'video.mp4', 'fake-kit-guide-v1.pdf', 'fake-kit-guide-v1.png', 'sheet.jpg', 'manifest.json'];
const inputs = (overrides = {}) => ({manifestVersion: 1, shipped: SHIPPED, thumbFiles: THUMBS, thumbsLabel: 'thumbs/fake-kit', ...overrides});
const planProblems = (overrides: object) => {
  try {
    planListing(parseListing(listingText(), FILE), inputs(overrides));
  } catch (error) {
    assert.ok(error instanceof ListingError);
    return error.message;
  }
  assert.fail('the plan was accepted');
};

test('a listing file gives its fields, tags split and the notes apart from the description', () => {
  const listing = parseListing(listingText(), FILE);
  assert.equal(listing.pack, 'fake-kit');
  assert.equal(listing.price, 'US$ 12.99');
  assert.equal(listing.caption, 'FK');
  assert.equal(listing.title, 'Fake Overlay Kit, Animated');
  assert.deepEqual(listing.tags, TAGS);
  assert.ok(listing.description.endsWith('(zip, about {{ZIP_SIZE}})'));
  assert.equal(listing.notes, '- Check the motifs.');
});

test('Etsy limits are refused all at once: 141-character title, 12 tags, a 21-character tag, a bad character, a repeat', () => {
  assert.doesNotThrow(() => parseListing(listingText({title: 'x'.repeat(140)}), FILE));
  assert.doesNotThrow(() => parseListing(listingText({tags: [...TAGS.slice(0, 12), 'y'.repeat(20)]}), FILE));
  const message = problemsOf(listingText({title: 'x'.repeat(141), tags: [...TAGS.slice(0, 9), 'z'.repeat(21), 'emoji ✦', 'Tag Number 1']}));
  assert.match(message, /the title has 141 characters; Etsy takes at most 140/);
  assert.match(message, /12 tags; a listing uses all 13/);
  assert.match(message, /the tag "z{21}" has 21 characters/);
  assert.match(message, /the tag "emoji ✦" has a character Etsy refuses/);
  assert.match(message, /the tag "Tag Number 1" is repeated/);
});

test('a listing without front matter, with a stray placeholder, another pack name or a bad price is refused', () => {
  assert.match(problemsOf(listingText().replace(/^---[\s\S]*?---\n/, '')), /no front matter/);
  assert.match(problemsOf(listingText({description: 'Size {{SIZE}}'})), /unknown placeholder \{\{SIZE\}\}/);
  assert.match(problemsOf(listingText({front: 'pack: other-kit\nprice: US$ 12.99\ncaption: FK'})), /pack "other-kit" differs from the file name/);
  assert.match(problemsOf(listingText({front: 'pack: fake-kit\nprice: 12.99\ncaption: FK'})), /price "12.99" is not like "US\$ 12.99"/);
  assert.match(problemsOf(listingText({front: 'pack: fake-kit\nprice: US$ 12.99'})), /front matter has no "caption"/);
  assert.match(problemsOf(listingText({description: 'Line\n## Notes\nmore'})), /unknown section "## Notes"/);
});

test('the zip size is printed as the guide prints it: two decimals from 1 GB, whole MB below', () => {
  assert.equal(zipSize(1_073_784_702), '1.07 GB');
  assert.equal(zipSize(1_000_000_000), '1.00 GB');
  assert.equal(zipSize(999_999_999), '1000 MB');
  assert.equal(zipSize(776_785_518), '777 MB');
});

test('the plan fills the size, orders the photos and names the guide of the shipped version', () => {
  const plan = planListing(parseListing(listingText(), FILE), inputs());
  assert.ok(plan.description.endsWith('(zip, about 1.07 GB)'));
  assert.deepEqual(plan.photos, ['01-cover-stage.jpg', '02-grid.jpg']);
  assert.deepEqual(plan.files.map(({guide, preview}) => [guide, preview]), [['fake-kit-guide-v1.pdf', 'fake-kit-guide-v1.png']]);
  assert.deepEqual(listingCopies(plan).map(({from, file}) => `${from}/${file}`),
    ['fake-kit/01-cover-stage.jpg', 'fake-kit/02-grid.jpg', 'fake-kit/video.mp4', 'fake-kit/fake-kit-guide-v1.pdf', 'fake-kit/fake-kit-guide-v1.png']);
  assert.match(plan.text, /^TITLE\nFake Overlay Kit, Animated\n\nPRICE\nUS\$ 12\.99\n\nTAGS\ntag number 1, /);
  assert.match(plan.text, /DIGITAL FILE\nfake-kit-guide-v1\.pdf \(download link inside: https:\/\/cacare\.co\/packs\/fake-kit\/abcd1234\/fake-kit-overlay-pack-v1\.zip\)\n$/);
  assert.doesNotMatch(plan.text, /Check the motifs/);
});

test('a zip shipped before versioning ships guide.pdf', () => {
  assert.equal(guideFileName('fake-kit', {url: 'u', bytes: 1}), 'guide.pdf');
  assert.equal(guideFileName('fake-kit', {version: 3, url: 'u', bytes: 1}), 'fake-kit-guide-v3.pdf');
  const plan = planListing(parseListing(listingText(), FILE), inputs({shipped: {url: 'u', bytes: 5e8}, thumbFiles: ['01-a.jpg', 'video.mp4', 'guide.pdf']}));
  assert.deepEqual(plan.files.map(({guide, preview}) => [guide, preview]), [['guide.pdf', undefined]]);
});

test('a pack not shipped, a manifest past the shipped version, or missing media is refused with the way out', () => {
  assert.match(planProblems({shipped: undefined}), /fake-kit was never shipped.*npm run ship:pack -- fake-kit/);
  assert.match(planProblems({manifestVersion: 2}), /packs\/fake-kit\.json is at version 2 but v1 is the one shipped/);
  const media = planProblems({thumbFiles: ['sheet.jpg', 'fake-kit-guide-v2.pdf']});
  assert.match(media, /no listing photos \(NN-<template>\.jpg\) in thumbs\/fake-kit/);
  assert.match(media, /no video\.mp4 in thumbs\/fake-kit/);
  assert.match(media, /no fake-kit-guide-v1\.pdf in thumbs\/fake-kit/);
  const photos = (count: number) => Array.from({length: count}, (_, index) => `${String(index + 1).padStart(2, '0')}-x.jpg`);
  const others = THUMBS.filter((name) => !name.endsWith('.jpg'));
  assert.equal(planListing(parseListing(listingText(), FILE), inputs({thumbFiles: [...others, ...photos(20)]})).photos.length, 20);
  assert.match(planProblems({thumbFiles: [...others, ...photos(21)]}), /21 photos in thumbs\/fake-kit; Etsy takes at most 20/);
});

test('the page gives each photo, the video and the guide a citable caption and escapes the text', () => {
  const plan = planListing(parseListing(listingText({description: 'Use <b> & "quotes" {{ZIP_SIZE}}'}), FILE), inputs());
  const page = renderListingPage('fake · Etsy listing', [plan]);
  for (const caption of ['FK-01 · 01-cover-stage.jpg', 'FK-02 · 02-grid.jpg', 'FK-V · video.mp4', 'FK-G · fake-kit-guide-v1.png']) assert.ok(page.includes(caption), caption);
  assert.ok(page.includes('Use &lt;b&gt; &amp; &quot;quotes&quot; 1.07 GB'));
  assert.ok(page.includes('src="fake-kit/01-cover-stage.jpg"'));
});

// A bundle of three fake packs: its own out/ has the photos and the video, each pack's out/ its guide.
const BUNDLE_FILE = 'listings/fake-bundle.md';
const bundleText = (packs = 'fake-kit, other-kit, old-kit') => listingText({front: `pack: fake-bundle\nprice: US$ 29.99\ncaption: FB\nbundle: ${packs}`});
const member = (pack: string, overrides: Partial<PackInputs> = {}): PackInputs => ({
  manifestVersion: 1, shipped: {version: 1, url: `https://cacare.co/packs/${pack}/abcd1234/${pack}-overlay-pack-v1.zip`, bytes: 1_000_000_000},
  thumbFiles: ['01-cover-stage.jpg', 'video.mp4', `${pack}-guide-v1.pdf`, `${pack}-guide-v1.png`], thumbsLabel: `thumbs/${pack}`, ...overrides,
});
const MEMBERS: Record<string, PackInputs> = {
  'fake-kit': member('fake-kit'),
  'other-kit': member('other-kit', {thumbFiles: ['other-kit-guide-v1.pdf']}),
  'old-kit': member('old-kit', {shipped: {url: 'https://cacare.co/packs/old-kit/1234abcd/old-kit-overlay-pack.zip', bytes: 500_000_000}, thumbFiles: ['guide.pdf']}),
};
const bundleInputs = (members: Record<string, PackInputs> = MEMBERS) => ({
  manifestVersion: undefined, shipped: undefined, thumbFiles: ['02-grid.jpg', '01-cover-stage.jpg', 'video.mp4', 'sheet.jpg'], thumbsLabel: 'thumbs/fake-bundle', members,
});
const bundleProblems = (text: string, members?: Record<string, PackInputs>) => {
  try {
    const listing = parseListing(text, BUNDLE_FILE);
    planListing(listing, bundleInputs(members));
  } catch (error) {
    assert.ok(error instanceof ListingError);
    return error.message;
  }
  assert.fail('the bundle was accepted');
};

test('a bundle ships one guide per pack, each from its own folder, and sums the zips', () => {
  assert.deepEqual(parseListing(listingText(), FILE).bundle, []);
  const plan = planListing(parseListing(bundleText(), BUNDLE_FILE), bundleInputs());
  assert.deepEqual(plan.listing.bundle, ['fake-kit', 'other-kit', 'old-kit']);
  assert.deepEqual(plan.files.map(({pack, guide, preview}) => [pack, guide, preview]),
    [['fake-kit', 'fake-kit-guide-v1.pdf', 'fake-kit-guide-v1.png'], ['other-kit', 'other-kit-guide-v1.pdf', undefined], ['old-kit', 'guide.pdf', undefined]]);
  assert.ok(plan.description.endsWith('(zip, about 2.50 GB)'));
  assert.deepEqual(listingCopies(plan).map(({from, file}) => `${from}/${file}`), [
    'fake-bundle/01-cover-stage.jpg', 'fake-bundle/02-grid.jpg', 'fake-bundle/video.mp4',
    'fake-kit/fake-kit-guide-v1.pdf', 'fake-kit/fake-kit-guide-v1.png', 'other-kit/other-kit-guide-v1.pdf', 'old-kit/guide.pdf',
  ]);
  assert.match(plan.text, /\n\nDIGITAL FILES\nfake-kit-guide-v1\.pdf \(download link inside: https:\/\/cacare\.co\/packs\/fake-kit\/abcd1234\/fake-kit-overlay-pack-v1\.zip\)\nother-kit-guide-v1\.pdf \(download link inside: [^)]+\)\nguide\.pdf \(download link inside: https:\/\/cacare\.co\/packs\/old-kit\/1234abcd\/old-kit-overlay-pack\.zip\)\n$/);
  const page = renderListingPage('fake-bundle · Etsy listing', [plan]);
  for (const text of ['FB-01 · 01-cover-stage.jpg', 'FB-V · video.mp4', 'FB-G1 · fake-kit-guide-v1.png', 'href="fake-bundle/other-kit-guide-v1.pdf"', 'href="fake-bundle/guide.pdf"']) assert.ok(page.includes(text), text);
});

test('a bundle of 1 or 6 packs, a bad or repeated id, or one naming itself is refused', () => {
  assert.match(bundleProblems(bundleText('fake-kit')), /a bundle sells at least 2 packs; "bundle" names 1/);
  assert.doesNotThrow(() => parseListing(bundleText('a, b, c, d, e'), BUNDLE_FILE));
  assert.match(bundleProblems(bundleText('a, b, c, d, e, f')), /a bundle of 6 packs ships 6 guides; Etsy takes at most 5 digital files/);
  const ids = bundleProblems(bundleText('fake-kit, Other_Kit, fake-kit, fake-bundle'));
  assert.match(ids, /bundle pack "Other_Kit": lowercase letters, digits and hyphens only/);
  assert.match(ids, /the bundle names fake-kit twice/);
  assert.match(ids, /the bundle fake-bundle names itself/);
});

test('a bundle pack not shipped, past its shipped version, without its guide or read for nothing is refused, all at once', () => {
  const problems = bundleProblems(bundleText(), {
    'fake-kit': member('fake-kit', {shipped: undefined}),
    'other-kit': member('other-kit', {manifestVersion: 2, thumbFiles: []}),
  });
  assert.match(problems, /fake-kit was never shipped.*npm run ship:pack -- fake-kit/);
  assert.match(problems, /packs\/other-kit\.json is at version 2 but v1 is the one shipped/);
  assert.match(problems, /no other-kit-guide-v1\.pdf in thumbs\/other-kit/);
  assert.match(problems, /old-kit: the bundle names it, but nothing was read for it/);
  const twoOld = bundleProblems(bundleText('old-kit, older-kit'), {'old-kit': MEMBERS['old-kit']!, 'older-kit': {...MEMBERS['old-kit']!, thumbsLabel: 'thumbs/older-kit'}});
  assert.match(twoOld, /two packs of the bundle ship guide\.pdf and would overwrite each other/);
});

test('every versioned listing parses and names packs that exist', () => {
  const root = path.join(import.meta.dirname, '..');
  const files = readdirSync(path.join(root, 'listings')).filter((name) => name.endsWith('.md'));
  assert.ok(files.length > 0);
  for (const name of files) {
    const listing = parseListing(readFileSync(path.join(root, 'listings', name), 'utf8'), `listings/${name}`);
    for (const pack of listing.bundle.length > 0 ? listing.bundle : [listing.pack]) {
      assert.ok(existsSync(path.join(root, 'packs', `${pack}.json`)), `${name}: no packs/${pack}.json`);
    }
  }
});
