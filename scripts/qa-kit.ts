import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {projectRoot} from './export';
import {parsePackManifest, planPack, realPackDeps} from './pack-plan';
import {buildKitJob} from './stills-job';
import {runStills} from './stills-run';

const HELP_TEXT = `npm run qa:kit -- <pack> [options]

Visual QA of a pack without rendering it: one still per file the pack plans, at each frame, a
contact sheet per kind, a light sheet and stream mockups, in out/review/<date>-qa-<pack>/.

Options:
  --frames <a,b>  frames to render (default: 0 and 43% of the background's loop)
  --dry-run       write job.json and list the stills, render nothing
  --no-wait       fail instead of waiting when another render is running on this machine
  -h, --help      show this help`;

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      frames: {type: 'string'}, 'dry-run': {type: 'boolean', default: false},
      'no-wait': {type: 'boolean', default: false}, help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {console.log(HELP_TEXT); return;}
  if (positionals.length !== 1) throw new Error('Pass one pack: npm run qa:kit -- <pack>. Use --help.');
  const target = positionals[0]!;
  const file = target.endsWith('.json') ? path.resolve(target) : path.join(projectRoot, 'packs', `${target}.json`);
  if (!existsSync(file)) throw new Error(`Pack not found: ${path.relative(process.cwd(), file) || file}.`);
  const manifest = parsePackManifest(JSON.parse(readFileSync(file, 'utf8')));
  const frames = values.frames?.split(',').map((value) => {
    const frame = Number(value.trim());
    if (!Number.isInteger(frame)) throw new Error(`--frames takes whole numbers separated by commas, not "${value}".`);
    return frame;
  });
  const job = buildKitJob(planPack(manifest, realPackDeps), frames ? {frames} : {});
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const outDir = path.join(projectRoot, 'out', 'review', `${today}-qa-${manifest.name}`);
  mkdirSync(outDir, {recursive: true});
  const jobFile = path.join(outDir, 'job.json');
  writeFileSync(jobFile, `${JSON.stringify(job, null, 1)}\n`);
  await runStills({jobFile, dryRun: values['dry-run'], wait: !values['no-wait']});
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
