import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {FREE_SPACE_HINT, assertCanStart, freeBytes} from './disk';
import {projectRoot} from './export';
import {listingCutArgs, mockVideoArgs, parseMockNames, planMockVideos} from './mock-video';
import {parsePackManifest, planPack, realPackDeps, type PlannedFile} from './pack-plan';
import {ffmpegPath, runProcess} from './process';
import {withRenderSlot} from './render-slot';
import {buildKitJob} from './stills-job';
import {runStills} from './stills-run';

const HELP_TEXT = `npm run qa:kit -- <pack> [options]

Visual QA of a pack without rendering it: one still per file the pack plans, at each frame, a
contact sheet per kind, a light sheet and stream mockups, in out/review/<date>-qa-<pack>/.

Options:
  --frames <a,b>  frames to render (default: 0 and 43% of the background's loop)
  --video <mocks> instead of the stills, animated stream mockups (all, or names such as
                  mock-chatting) built from the pack's .webm files, one loop long (a piece the
                  pack ships only as .png stays still); a missing piece is rendered first with
                  render:pack. A loop over 14.5 s also gets a <mock>-listing.mp4 for the
                  listing video, its last second faded into frame 0
  --dry-run       write job.json and list the stills, render nothing
  --no-wait       fail instead of waiting when another render is running on this machine
  -h, --help      show this help`;

/** About 6 MB per second of 1920×1080 at CRF 14, with room to spare. */
const VIDEO_BYTES_PER_SECOND = 8 * 1024 ** 2;

const mockVideos = async (
  {pack, plan, names, outDir, dryRun}: {pack: string; plan: readonly PlannedFile[]; names: string[]; outDir: string; dryRun: boolean},
) => {
  const videos = planMockVideos(plan, names);
  const fromRoot = (relative: string) => path.join(projectRoot, relative);
  const needed = [...new Set(videos.flatMap((video) => [video.base, ...video.layers.map((layer) => layer.file)]))];
  const missing = needed.filter((file) => !existsSync(fromRoot(file)));
  const seconds = videos.reduce((sum, video) => sum + video.frames / video.fps, 0);
  for (const video of videos) console.log(`${video.name}: ${video.frames} frames at ${video.fps} fps${listingCutArgs(video, '', '') ? ', plus a listing cut' : ''}`);
  for (const file of missing) console.log(`  to render first: ${file}`);
  if (dryRun) return;
  // Each piece through the official pack renderer, which takes the render slot itself.
  for (const file of missing) {
    const run = spawnSync(process.execPath, [...process.execArgv, path.join(projectRoot, 'scripts', 'pack.ts'), pack, '--only', file], {stdio: 'inherit'});
    if (run.status !== 0) throw new Error(`render:pack stopped on ${file}; nothing was composited.`);
  }
  mkdirSync(outDir, {recursive: true});
  assertCanStart({free: freeBytes(outDir), estimate: seconds * 2 * VIDEO_BYTES_PER_SECOND, where: path.relative(process.cwd(), outDir), then: FREE_SPACE_HINT});
  await withRenderSlot(async () => {
    for (const video of videos) {
      const output = path.join(outDir, `${video.name}.mp4`);
      await runProcess(ffmpegPath(), mockVideoArgs(video, fromRoot, output));
      console.log(`✓ ${path.relative(process.cwd(), output)}`);
      const cut = path.join(outDir, `${video.name}-listing.mp4`);
      const cutArgs = listingCutArgs(video, output, cut);
      if (!cutArgs) continue;
      await runProcess(ffmpegPath(), cutArgs);
      console.log(`✓ ${path.relative(process.cwd(), cut)}`);
    }
  });
};

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      frames: {type: 'string'}, video: {type: 'string'}, 'dry-run': {type: 'boolean', default: false},
      'no-wait': {type: 'boolean', default: false}, help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {console.log(HELP_TEXT); return;}
  if (positionals.length !== 1) throw new Error('Pass one pack: npm run qa:kit -- <pack>. Use --help.');
  const target = positionals[0]!;
  const file = target.endsWith('.json') ? path.resolve(target) : path.join(projectRoot, 'packs', `${target}.json`);
  if (!existsSync(file)) throw new Error(`Pack not found: ${path.relative(process.cwd(), file) || file}.`);
  const manifest = parsePackManifest(JSON.parse(readFileSync(file, 'utf8')));
  const plan = planPack(manifest, realPackDeps);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const outDir = path.join(projectRoot, 'out', 'review', `${today}-qa-${manifest.name}`);
  if (values.video !== undefined) {
    if (values.frames !== undefined) throw new Error('--frames picks stills; --video renders whole loops. Pass one of them.');
    await mockVideos({pack: manifest.name, plan, names: parseMockNames(values.video), outDir, dryRun: values['dry-run']});
    return;
  }
  const frames = values.frames?.split(',').map((value) => {
    const frame = Number(value.trim());
    if (!Number.isInteger(frame)) throw new Error(`--frames takes whole numbers separated by commas, not "${value}".`);
    return frame;
  });
  const job = buildKitJob(plan, frames ? {frames} : {});
  mkdirSync(outDir, {recursive: true});
  const jobFile = path.join(outDir, 'job.json');
  writeFileSync(jobFile, `${JSON.stringify(job, null, 1)}\n`);
  await runStills({jobFile, dryRun: values['dry-run'], wait: !values['no-wait']});
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
