import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {freeBytes as diskFreeBytes} from './disk';
import {projectRoot} from './export';
import {PackContentsError, zipFileName, zipPack} from './pack-contents';
import {deliveryVersion, existingManifestFile, parsePackManifest, planPack, realPackDeps} from './pack-plan';

const ZIP_HELP_TEXT = `usage: npm run zip:pack -- <name|file.json> [--check]

Builds out/deliveries/<name>-overlay-pack-v<N>.zip (N: "version" in the manifest) from the finished pack in out/packs/<name>/:
exactly the files the whole plan lists (masks included), with no root folder, stored without
compression in a fixed order and date, so the same files always give the same zip. The pack folder
and its manifest.json are only checked, never shipped: the buyer gets the zip, never the folder.

Options:
  --check      runs every check and compares with the existing zip, writing nothing
               (exit 0: up to date; 2: no zip or a different one; 1: a check failed)
  -h, --help   shows this help`;

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      check: {type: 'boolean', default: false},
      'dry-run': {type: 'boolean', default: false},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {console.log(ZIP_HELP_TEXT); return;}
  // The size and time of a pack are known before its render, so render:pack estimates them; the zip only packs the result.
  if (values['dry-run']) {
    throw new Error(`zip:pack has no --dry-run. Size and render time of the pack: npm run render:pack -- ${positionals[0] ?? '<name>'} --dry-run. Every zip check, writing nothing: --check.`);
  }
  if (positionals.length !== 1) throw new Error('Name one pack: npm run zip:pack -- <name|file.json>. Use --help.');
  const file = existingManifestFile(positionals[0]!);
  const manifest = parsePackManifest(JSON.parse(await readFile(file, 'utf8')));
  const version = deliveryVersion(manifest);
  // The whole plan, the same pure path as --dry-run: the zip lists what the pack plans, not what the folder holds.
  const plan = planPack(manifest, realPackDeps);

  const packLabel = path.posix.join('out', 'packs', manifest.name);
  const deliveriesDirectory = path.join(projectRoot, 'out', 'deliveries');
  const {code} = await zipPack({
    pack: manifest.name, version, plan, check: values.check,
    packDirectory: path.join(projectRoot, packLabel), packLabel,
    deliveriesDirectory, zipLabel: path.posix.join('out', 'deliveries', zipFileName(manifest.name, version)),
    effects: {
      freeBytes: async () => diskFreeBytes(deliveriesDirectory),
      log: (message) => console.log(message),
    },
  });
  process.exitCode = code;
};

main().catch((error: unknown) => {
  // A failed check lists every problem at once; nothing was written.
  if (error instanceof PackContentsError) console.error(`${error.message}\nNothing was written.`);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
