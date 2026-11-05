// npm run clean [-- --apply] [--review]: lists (or, with --apply, deletes) the space that regenerates.
import {fileURLToPath} from 'node:url';
import {runClean} from './clean-plan';

const HELP = `Usage: npm run clean -- [--apply] [--review]

Lists what it would delete, with sizes: out/.scratch, old bundles in .cache and node_modules/.cache/webpack.
  --apply   delete them, holding the render slot: it waits for its turn in the slot's queue
            (up to 4 hours), so no render starts on what it deletes
  --review  also out/review (the owner's review boards)
out/packs and out/deliveries are never deleted.
Run it as is, never through render-slot run: run's machine check waits while the disk is
below the floor, and this is what frees the disk.`;

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(HELP);
} else {
  const unknown = args.filter((arg) => arg !== '--apply' && arg !== '--review');
  if (unknown.length > 0) {
    console.error(`Unknown option ${unknown.join(', ')}.\n\n${HELP}`);
    process.exitCode = 1;
  } else {
    const root = fileURLToPath(new URL('../', import.meta.url));
    runClean({root, apply: args.includes('--apply'), review: args.includes('--review')}).then(({text}) => {
      console.log(text);
    }, (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
