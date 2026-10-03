import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {ornamentReportText, ornamentRows} from './ornament-rows';
import {existingManifestFile, parsePackManifest, realPackDeps} from './pack-plan';

const HELP_TEXT = `usage: npm run ornaments:report -- <name|file.json>

Prints where the ornaments go on every file of a pack (packs/<name>.json or the given file),
from the placement alone: per file, each motif's slot, layer, size, extent and the room at its
spot, and the motifs the set places on other files of the same kind but drops there.
No render: it takes no render slot and writes nothing.

Options:
  -h, --help       shows this help`;

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {help: {type: 'boolean', short: 'h'}},
  });
  if (values.help) {console.log(HELP_TEXT); return;}
  if (positionals.length !== 1) throw new Error('Name one pack: npm run ornaments:report -- <name|file.json>. Use --help.');
  const manifest = parsePackManifest(JSON.parse(await readFile(existingManifestFile(positionals[0]!), 'utf8')));
  console.log(ornamentReportText(manifest.name, ornamentRows(manifest, realPackDeps)));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
