import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {ListingError, guideFileName, listingCopies, parseListing, planListing, renderListingPage, zipSize} from '../scripts/listing-plan';

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
  assert.equal(plan.guide, 'fake-kit-guide-v1.pdf');
  assert.equal(plan.guidePreview, 'fake-kit-guide-v1.png');
  assert.deepEqual(listingCopies(plan), ['01-cover-stage.jpg', '02-grid.jpg', 'video.mp4', 'fake-kit-guide-v1.pdf', 'fake-kit-guide-v1.png']);
  assert.match(plan.text, /^TITLE\nFake Overlay Kit, Animated\n\nPRICE\nUS\$ 12\.99\n\nTAGS\ntag number 1, /);
  assert.match(plan.text, /DIGITAL FILE\nfake-kit-guide-v1\.pdf \(download link inside: https:\/\/cacare\.co\/packs\/fake-kit\/abcd1234\/fake-kit-overlay-pack-v1\.zip\)\n$/);
  assert.doesNotMatch(plan.text, /Check the motifs/);
});

test('a zip shipped before versioning ships guide.pdf', () => {
  assert.equal(guideFileName('fake-kit', {url: 'u', bytes: 1}), 'guide.pdf');
  assert.equal(guideFileName('fake-kit', {version: 3, url: 'u', bytes: 1}), 'fake-kit-guide-v3.pdf');
  const plan = planListing(parseListing(listingText(), FILE), inputs({shipped: {url: 'u', bytes: 5e8}, thumbFiles: ['01-a.jpg', 'video.mp4', 'guide.pdf']}));
  assert.equal(plan.guide, 'guide.pdf');
  assert.equal(plan.guidePreview, undefined);
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

test('every versioned listing parses and names a pack that exists', () => {
  const root = path.join(import.meta.dirname, '..');
  const files = readdirSync(path.join(root, 'listings')).filter((name) => name.endsWith('.md'));
  assert.ok(files.length > 0);
  for (const name of files) {
    const listing = parseListing(readFileSync(path.join(root, 'listings', name), 'utf8'), `listings/${name}`);
    assert.ok(existsSync(path.join(root, 'packs', `${listing.pack}.json`)), `${name}: no packs/${listing.pack}.json`);
  }
});
