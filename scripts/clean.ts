// npm run clean [-- --apply] [--review]: lists (or, with --apply, deletes) the space that regenerates.
import {fileURLToPath} from 'node:url';
import {runClean} from './clean-plan';

const HELP = `Usage: npm run clean -- [--apply] [--review]

Lists what it would delete, with sizes: out/.scratch, old bundles in .cache and node_modules/.cache/webpack.
  --apply   delete them (refused while a render holds the render slot)
  --review  also out/review (the owner's review boards)
out/packs and out/deliveries are never deleted.`;

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
