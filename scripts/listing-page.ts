import {existsSync} from 'node:fs';
import {copyFile, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {projectRoot} from './export';
import {ListingError, listingCopies, parseListing, planListing, renderListingPage, type ShippedZip} from './listing-plan';
import {existingManifestFile, parsePackManifest} from './pack-plan';

const HELP_TEXT = `usage: npm run listing:page -- <pack...> [--name <folder>] [--check]

Builds out/listings/<folder>/ for filling in Etsy by hand: index.html with, per pack, the listing photos
and video (captions <caption>-NN and <caption>-V), title, price, tags and description with copy buttons,
and the guide; plus <pack>/listing.txt and the media it names. npm run clean never deletes out/listings.

  text     listings/<pack>.md (versioned): front matter pack, price, caption; sections ## Title, ## Tags,
           ## Description ({{ZIP_SIZE}} becomes the zip's size) and an optional ## Before publishing
  media    the thumbnail generator's out/<pack>/: NN-<template>.jpg, video.mp4, the guide and its .png
  zip      .cache/ship-pack/state.json (ship:pack): link, bytes, version; the guide must be
           <pack>-guide-v<N>.pdf for that version (guide.pdf for a zip shipped before versioning)

Every problem is listed at once and nothing is written.

Options:
  --name <folder>    the folder in out/listings/ (default: the pack, when there is one)
  --thumbs <dir>     the generator's out/ (default: ~/dev/firulas/etsy-thumb-generator/out)
  --state <file>     ship:pack's state (default: .cache/ship-pack/state.json; a worktree points at the main checkout's)
  --check            runs every check and writes nothing
  -h, --help         shows this help`;

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      name: {type: 'string'},
      thumbs: {type: 'string', default: path.join(os.homedir(), 'dev/firulas/etsy-thumb-generator/out')},
      state: {type: 'string', default: path.join(projectRoot, '.cache/ship-pack/state.json')},
      check: {type: 'boolean', default: false},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {console.log(HELP_TEXT); return;}
  if (positionals.length === 0) throw new Error('Name at least one pack: npm run listing:page -- <pack...>. Use --help.');
  const name = values.name ?? (positionals.length === 1 ? positionals[0]! : undefined);
  if (!name) throw new Error(`Several packs share one page: name its folder with --name (e.g. --name ${positionals[0]!.split('-')[0]}).`);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`--name "${name}": lowercase letters, digits and hyphens only.`);

  const state = existsSync(values.state) ? JSON.parse(await readFile(values.state, 'utf8')) as Record<string, ShippedZip> : {};
  const plans = [];
  const problems: string[] = [];
  for (const pack of positionals) {
    try {
      const file = path.join(projectRoot, 'listings', `${pack}.md`);
      if (!existsSync(file)) throw new ListingError(`listings/${pack}.md does not exist: write the listing text there (format: --help).`);
      const listing = parseListing(await readFile(file, 'utf8'), `listings/${pack}.md`);
      const manifest = parsePackManifest(JSON.parse(await readFile(existingManifestFile(pack), 'utf8')));
      const thumbs = path.join(values.thumbs, pack);
      const thumbFiles = existsSync(thumbs) ? await readdir(thumbs) : [];
      plans.push({thumbs, plan: planListing(listing, {manifestVersion: manifest.version, shipped: state[pack], thumbFiles, thumbsLabel: thumbs})});
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problems.length > 0) throw new ListingError(problems.join('\n'));

  const out = path.join(projectRoot, 'out', 'listings', name);
  for (const {plan} of plans) {
    console.log(`${plan.listing.pack}: ${plan.photos.length} photos, video, ${plan.guide}, ${plan.listing.title.length}-character title, ${plan.listing.tags.length} tags`);
  }
  if (values.check) {console.log(`All checks passed. Would write ${path.relative(projectRoot, out)}/index.html.`); return;}
  for (const {thumbs, plan} of plans) {
    const folder = path.join(out, plan.listing.pack);
    await mkdir(folder, {recursive: true});
    for (const file of listingCopies(plan)) await copyFile(path.join(thumbs, file), path.join(folder, file));
    await writeFile(path.join(folder, 'listing.txt'), plan.text);
  }
  const title = plans.length === 1 ? `${name} · Etsy listing` : `${name} · Etsy listings`;
  await writeFile(path.join(out, 'index.html'), renderListingPage(title, plans.map(({plan}) => plan)));
  console.log(path.join(out, 'index.html'));
};

main().catch((error: unknown) => {
  if (error instanceof ListingError) console.error(`${error.message}\nNothing was written.`);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
