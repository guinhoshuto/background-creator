import path from 'node:path';

/**
 * The Etsy listing of a pack: its text lives in listings/<pack>.md (versioned), its media comes from the
 * thumbnail generator's out/<pack>/, and the zip's size and link from ship:pack's state. A bundle listing
 * (front matter "bundle") sells packs already shipped: its photos and video come from out/<bundle>/, and
 * its digital files are the guides of its packs, each from out/<pack>/. Pure: the CLI
 * (scripts/listing-page.ts) reads the files and writes out/listings/<name>/.
 */

/** Etsy's limits: a title of at most 140 characters, exactly 13 tags of at most 20, at most 20 photos, at most 5 digital files. */
export const TITLE_MAX = 140;
export const TAG_COUNT = 13;
export const TAG_MAX = 20;
export const PHOTO_MAX = 20;
export const DIGITAL_FILE_MAX = 5;
// Etsy takes letters, numbers, spaces, hyphens, apostrophes and ™©® in a tag.
const TAG_CHARACTERS = /^[\p{L}\p{N} '\-™©®]+$/u;
const PRICE_FORMAT = /^US\$ \d+\.\d{2}$/;
const PLACEHOLDERS = new Set(['ZIP_SIZE']);
const SECTIONS = ['Title', 'Tags', 'Description'] as const;
const NOTES = 'Before publishing';

export class ListingError extends Error {}

export type Listing = {
  pack: string;
  price: string;
  caption: string;
  /** Front matter "bundle": the packs a bundle sells, one guide each; empty for a pack's own listing. */
  bundle: string[];
  title: string;
  tags: string[];
  description: string;
  /** "## Before publishing": what the owner checks by hand; shown on the page, never pasted into Etsy. */
  notes: string;
};

/** One pack's entry in ship:pack's .cache/ship-pack/state.json. Packs shipped before versioning have no version. */
export type ShippedZip = {version?: number; url: string; bytes: number};

/** The size the buyer's guide prints, in decimal units: two places from 1 GB, whole MB below. */
export const zipSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`);

/** The guide the listing ships: <pack>-guide-v<N>.pdf for a versioned zip, guide.pdf for one shipped before versioning. */
export const guideFileName = (pack: string, shipped: ShippedZip) =>
  (shipped.version === undefined ? 'guide.pdf' : `${pack}-guide-v${shipped.version}.pdf`);

const fail = (file: string, problems: string[]) => {
  if (problems.length > 0) throw new ListingError(`${file}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
};

export const parseListing = (text: string, file: string): Listing => {
  const problems: string[] = [];
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const fields = new Map<string, string>();
  for (const line of front?.[1]?.split('\n') ?? []) {
    const match = /^([a-z]+):\s*(.+)$/.exec(line);
    if (match) fields.set(match[1]!, match[2]!.trim());
    else if (line.trim()) problems.push(`unreadable front matter line: "${line}"`);
  }
  if (!front) problems.push('no front matter: start the file with ---, pack, price and caption, then ---');
  for (const key of ['pack', 'price', 'caption']) if (!fields.get(key)) problems.push(`front matter has no "${key}"`);

  const body = front ? text.slice(front[0].length) : text;
  const sections = new Map<string, string>();
  const headings = [...body.matchAll(/^## (.+)$/gm)];
  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    sections.set(heading[1]!.trim(), body.slice(start, end).trim());
  });
  for (const name of SECTIONS) if (!sections.get(name)) problems.push(`no "## ${name}" section, or it is empty`);
  const order = headings.map((heading) => heading[1]!.trim()).filter((name) => (SECTIONS as readonly string[]).includes(name));
  if (order.join() !== SECTIONS.filter((name) => sections.has(name)).join()) problems.push(`sections out of order: ${SECTIONS.map((name) => `## ${name}`).join(', ')}`);
  for (const name of sections.keys()) {
    if (!(SECTIONS as readonly string[]).includes(name) && name !== NOTES) problems.push(`unknown section "## ${name}" (a description cannot hold a "## " line)`);
  }

  const title = sections.get('Title') ?? '';
  if (title.includes('\n')) problems.push('the title is more than one line');
  if (title.length > TITLE_MAX) problems.push(`the title has ${title.length} characters; Etsy takes at most ${TITLE_MAX}`);
  const tags = (sections.get('Tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
  if (tags.length !== TAG_COUNT) problems.push(`${tags.length} tags; a listing uses all ${TAG_COUNT}`);
  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag.length > TAG_MAX) problems.push(`the tag "${tag}" has ${tag.length} characters; Etsy takes at most ${TAG_MAX}`);
    if (!TAG_CHARACTERS.test(tag)) problems.push(`the tag "${tag}" has a character Etsy refuses (letters, numbers, spaces, - ' ™©® only)`);
    if (seen.has(tag.toLowerCase())) problems.push(`the tag "${tag}" is repeated`);
    seen.add(tag.toLowerCase());
  }
  const description = sections.get('Description') ?? '';
  for (const [, name] of description.matchAll(/\{\{([^}]*)\}\}/g)) {
    if (!PLACEHOLDERS.has(name!)) problems.push(`unknown placeholder {{${name}}} in the description (known: ${[...PLACEHOLDERS].map((p) => `{{${p}}}`).join(', ')})`);
  }
  const price = fields.get('price') ?? '';
  if (price && !PRICE_FORMAT.test(price)) problems.push(`price "${price}" is not like "US$ 12.99"`);
  const pack = fields.get('pack') ?? '';
  if (pack && pack !== path.basename(file, '.md')) problems.push(`pack "${pack}" differs from the file name; the file is listings/<pack>.md`);
  const bundle = (fields.get('bundle') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (fields.has('bundle')) {
    if (bundle.length < 2) problems.push(`a bundle sells at least 2 packs; "bundle" names ${bundle.length}`);
    if (bundle.length > DIGITAL_FILE_MAX) problems.push(`a bundle of ${bundle.length} packs ships ${bundle.length} guides; Etsy takes at most ${DIGITAL_FILE_MAX} digital files`);
    for (const id of bundle) if (!/^[a-z0-9-]+$/.test(id)) problems.push(`bundle pack "${id}": lowercase letters, digits and hyphens only`);
    for (const id of new Set(bundle.filter((id, index) => bundle.indexOf(id) !== index))) problems.push(`the bundle names ${id} twice`);
    if (bundle.includes(pack)) problems.push(`the bundle ${pack} names itself`);
  }

  fail(file, problems);
  return {pack, price, caption: fields.get('caption')!, bundle, title, tags, description, notes: sections.get(NOTES) ?? ''};
};

export type PackInputs = {
  /** "version" in packs/<pack>.json. */
  manifestVersion: number | undefined;
  /** The pack's entry in ship:pack's state, undefined when it was never shipped. */
  shipped: ShippedZip | undefined;
  /** File names in the thumbnail generator's out/<pack>/. */
  thumbFiles: string[];
  /** The media folder, as messages name it. */
  thumbsLabel: string;
};

/** A bundle's own inputs give only its photos and video; members gives, per pack it sells, that pack's own inputs. */
export type ListingInputs = PackInputs & {members?: Record<string, PackInputs>};

/** One digital file of the listing: a pack's guide and the zip it links to. */
export type DigitalFile = {
  /** The pack whose out/<pack>/ holds the guide. */
  pack: string;
  guide: string;
  /** The guide's PNG preview, when the generator wrote it. */
  preview: string | undefined;
  zipUrl: string;
  bytes: number;
};

export type ListingPlan = {
  listing: Listing;
  description: string;
  photos: string[];
  /** The pack's guide, or one guide per pack of a bundle, in the order of "bundle". */
  files: DigitalFile[];
  /** The paste-ready listing.txt. */
  text: string;
};

export const planListing = (listing: Listing, inputs: ListingInputs): ListingPlan => {
  const problems: string[] = [];
  const {pack, bundle} = listing;
  const files: DigitalFile[] = [];
  for (const id of bundle.length > 0 ? bundle : [pack]) {
    const source = bundle.length > 0 ? inputs.members?.[id] : inputs;
    if (!source) {
      problems.push(`${id}: the bundle names it, but nothing was read for it`);
      continue;
    }
    const {shipped} = source;
    if (!shipped) {
      problems.push(`${id} was never shipped, so there is no zip link or size: npm run ship:pack -- ${id}`);
      continue;
    }
    if (shipped.version !== undefined && shipped.version !== source.manifestVersion) {
      problems.push(`packs/${id}.json is at version ${source.manifestVersion ?? '(none)'} but v${shipped.version} is the one shipped: npm run ship:pack -- ${id}, then the guide for the new link`);
    }
    const names = new Set(source.thumbFiles);
    const guide = guideFileName(id, shipped);
    if (!names.has(guide)) problems.push(`no ${guide} in ${source.thumbsLabel}: the guide of the shipped zip (/guia)`);
    const preview = guide.replace(/\.pdf$/, '.png');
    files.push({pack: id, guide, preview: names.has(preview) ? preview : undefined, zipUrl: shipped.url, bytes: shipped.bytes});
  }
  // Every guide lands in the same listing folder: two zips shipped before versioning would both ship guide.pdf.
  for (const guide of new Set(files.map((file) => file.guide).filter((guide, index, all) => all.indexOf(guide) !== index))) {
    problems.push(`two packs of the bundle ship ${guide} and would overwrite each other: ship them again with a version`);
  }
  const own = new Set(inputs.thumbFiles);
  const photos = inputs.thumbFiles.filter((name) => /^\d{2}-.+\.jpg$/.test(name)).sort();
  if (photos.length === 0) problems.push(`no listing photos (NN-<template>.jpg) in ${inputs.thumbsLabel}: render them with /thumb`);
  if (photos.length > PHOTO_MAX) problems.push(`${photos.length} photos in ${inputs.thumbsLabel}; Etsy takes at most ${PHOTO_MAX}`);
  if (!own.has('video.mp4')) problems.push(`no video.mp4 in ${inputs.thumbsLabel}: npm run render -- listings/${pack}.json --video-only in the thumbnail generator`);
  fail(`listings/${pack}.md`, problems);

  // A bundle's {{ZIP_SIZE}} is what the buyer downloads in all: the sum of its packs' zips.
  const description = listing.description.replaceAll('{{ZIP_SIZE}}', zipSize(files.reduce((sum, file) => sum + file.bytes, 0)));
  const text = [
    `TITLE\n${listing.title}`, `PRICE\n${listing.price}`, `TAGS\n${listing.tags.join(', ')}`, `DESCRIPTION\n${description}`,
    `PHOTOS (in order)\n${photos.join('\n')}`, 'VIDEO\nvideo.mp4',
    `${files.length > 1 ? 'DIGITAL FILES' : 'DIGITAL FILE'}\n${files.map((file) => `${file.guide} (download link inside: ${file.zipUrl})`).join('\n')}`,
  ].join('\n\n') + '\n';
  return {listing, description, photos, files, text};
};

/** The files one listing copies into its folder: photos and video from the generator's out/<listing>/, each guide from out/<its pack>/. */
export const listingCopies = (plan: ListingPlan) => [
  ...[...plan.photos, 'video.mp4'].map((file) => ({from: plan.listing.pack, file})),
  ...plan.files.flatMap(({pack, guide, preview}) => [guide, ...(preview ? [preview] : [])].map((file) => ({from: pack, file}))),
];

/**
 * What the vault needs from a written page: the `listing_files` line for the product note of each listing on it
 * (THB-22: the note keeps the absolute folder of the ready listing, and /abrir opens it by the note's name). A
 * worktree's out/ goes away with the worktree, so from one the line comes with the warning not to write it.
 */
export const listingFilesLines = (folder: string, packs: string[], inWorktree: boolean) => [
  `listing_files: ${folder}`,
  `  goes in the product note of ${packs.join(', ')} (the agent writes it there with the owner's yes)`,
  ...(inWorktree ? [`  this checkout is a worktree, and ${folder} goes away with it: run listing:page from the main checkout before writing it`] : []),
];

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]!);

const copyBlock = (label: string, text: string) =>
  `<div class="f"><div class="h"><b>${label}</b><button onclick="navigator.clipboard.writeText(this.parentNode.nextElementSibling.textContent)">copy</button></div><pre>${escape(text)}</pre></div>`;

/**
 * One page for the owner to fill in Etsy: per listing, the photos and the video with a citable caption
 * (<caption>-NN, <caption>-V, <caption>-G; a bundle's guides <caption>-G1, -G2…), each text block with a
 * copy button, and the guides.
 */
export const renderListingPage = (title: string, plans: ListingPlan[]) => {
  const sections = plans.map((plan) => {
    const {pack, caption} = plan.listing;
    const media = plan.photos.map((name, index) =>
      `<figure><img src="${pack}/${name}"><figcaption>${caption}-${String(index + 1).padStart(2, '0')} · ${name}</figcaption></figure>`).join('')
      + `<figure><video src="${pack}/video.mp4" controls loop muted playsinline></video><figcaption>${caption}-V · video.mp4</figcaption></figure>`;
    const links = plan.files.map(({guide, zipUrl}) =>
      `<p>Digital file: <a href="${pack}/${guide}">${guide}</a> · download link inside: <code>${escape(zipUrl)}</code></p>`).join('');
    const previews = plan.files.map(({preview}, index) => (preview
      ? `<figure class="g"><img src="${pack}/${preview}"><figcaption>${caption}-G${plan.files.length > 1 ? index + 1 : ''} · ${preview}</figcaption></figure>`
      : '')).join('');
    const guide = links + (previews ? `<div class="imgs">${previews}</div>` : '');
    const notes = plan.listing.notes ? `<div class="n"><b>${NOTES}</b><pre>${escape(plan.listing.notes)}</pre></div>` : '';
    return `<section id="${pack}"><h2>${pack}</h2>${notes}<div class="imgs">${media}</div>`
      + copyBlock('Title', plan.listing.title) + copyBlock('Price', plan.listing.price) + copyBlock('Tags', plan.listing.tags.join(', '))
      + copyBlock('Description', plan.description) + guide + '</section>';
  });
  return `<!doctype html><meta charset="utf-8"><title>${escape(title)}</title><style>`
    + 'body{font:15px system-ui;margin:24px;background:#f6f6f8;color:#222}section{background:#fff;border-radius:10px;padding:16px;margin:0 0 24px}'
    + '.imgs{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;width:300px}figure.g{width:420px}img,video{width:100%;border-radius:6px}'
    + 'figcaption{font-size:13px;color:#555}.f{margin:12px 0}.h{display:flex;gap:8px;align-items:center}'
    + 'pre{white-space:pre-wrap;background:#f0f0f4;padding:10px;border-radius:6px;margin:4px 0}.n pre{background:#fff6dc}'
    + `</style><h1>${escape(title)}</h1>${sections.join('')}\n`;
};
