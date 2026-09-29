import path from 'node:path';
import {parseArgs} from 'node:util';

const HELP_TEXT = `npm run stills -- <job.json> [options]

Renders verification stills with one bundle and one browser, then writes contact sheets, stream
mockups, diffs, loop-seam checks and before/after comparisons, plus report.json. The job format is
documented in scripts/stills-job.ts (jobSchema). Output: the job's outDir, or out/review/<date>-<job>/.

Options:
  --dry-run   parse the job, list the stills and the disk estimate, render nothing
  --no-wait   fail instead of waiting when another render is running on this machine
  -h, --help  show this help

Measure PNGs (region stats, L* profile, crop, diff; CPU only, no slot): npm run stills -- inspect --help`;

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === 'inspect') {
    // Its own module, loaded alone: the render modules (bundler, renderer) never load for a measure.
    const {inspect} = await import('./stills-inspect');
    console.log(inspect(args.slice(1)));
    return;
  }
  const {values, positionals} = parseArgs({
    args, allowPositionals: true,
    options: {'dry-run': {type: 'boolean', default: false}, 'no-wait': {type: 'boolean', default: false}, help: {type: 'boolean', short: 'h'}},
  });
  if (values.help) {console.log(HELP_TEXT); return;}
  if (positionals.length !== 1) throw new Error('Pass one job file: npm run stills -- <job.json>. Use --help.');
  const {runStills} = await import('./stills-run');
  await runStills({jobFile: path.resolve(positionals[0]!), dryRun: values['dry-run'], wait: !values['no-wait']});
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
