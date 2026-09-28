import path from 'node:path';
import {parseArgs} from 'node:util';
import {runStills} from './stills-run';

const HELP_TEXT = `npm run stills -- <job.json> [options]

Renders verification stills with one bundle and one browser, then writes contact sheets, stream
mockups, diffs, loop-seam checks and before/after comparisons, plus report.json. The job format is
documented in scripts/stills-job.ts (jobSchema). Output: the job's outDir, or out/review/<date>-<job>/.

Options:
  --dry-run   parse the job, list the stills and the disk estimate, render nothing
  --no-wait   fail instead of waiting when another render is running on this machine
  -h, --help  show this help`;

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {'dry-run': {type: 'boolean', default: false}, 'no-wait': {type: 'boolean', default: false}, help: {type: 'boolean', short: 'h'}},
  });
  if (values.help) {console.log(HELP_TEXT); return;}
  if (positionals.length !== 1) throw new Error('Pass one job file: npm run stills -- <job.json>. Use --help.');
  await runStills({jobFile: path.resolve(positionals[0]!), dryRun: values['dry-run'], wait: !values['no-wait']});
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
