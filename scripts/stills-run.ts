// The render half of `npm run stills` and `npm run qa:kit`: ONE bundle and ONE browser for every
// still, holding the machine-wide render slot (render-slot.ts), after checking free disk and other
// renders (this Mac has 8 GB of RAM). The job format and every image operation live in stills-job.ts.
import {bundle} from '@remotion/bundler';
import {openBrowser, renderFrames, renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {PNG} from 'pngjs';
import {getAsset, getLayoutOf, getOpenGlRenderer} from '../src/catalog';
import {kindPolicies} from '../src/kinds';
import {FREE_SPACE_HINT, RUN_MIN_FREE_BYTES, START_MIN_FREE_BYTES, assertCanStart, freeBytes, gibibytes} from './disk';
import {projectRoot} from './export';
import {expandSize} from './render-args';
import {diffDetail} from './pixel-stats';
import {acquireRenderSlot, currentCommand} from './render-slot';
import {busyOutsideSlot, busyProcesses, takeRenderTurn} from './render-turn';
import {
  alphaStats, contactSheet, diffImages, meanLuma, mergeStillProps, parseJob, regionProblems, regionReport, resolveOutDir,
  seamVerdict, sequenceVerdict, streamMockup, wrapFrame, type Rgba, type StillSpec, type StillsJob,
} from './stills-job';

type Browser = Awaited<ReturnType<typeof openBrowser>>;
type Prepared = {spec: StillSpec; props: Record<string, unknown>; canvas: {width: number; height: number}; bleed: number; gl: 'angle' | null};

const readPng = (file: string): Rgba => PNG.sync.read(readFileSync(file));
const writePng = (file: string, png: PNG) => { mkdirSync(path.dirname(file), {recursive: true}); writeFileSync(file, PNG.sync.write(png)); };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Resolves every still to parsed props before anything heavy starts: a bad preset fails in a second. */
const prepare = (job: StillsJob): Prepared[] => {
  const errors: string[] = [];
  const prepared: Prepared[] = [];
  for (const spec of job.stills) {
    try {
      const asset = getAsset(spec.id);
      const presetFile = spec.preset === undefined ? null : path.join(projectRoot, 'presets', `${spec.preset}.json`);
      if (presetFile && !existsSync(presetFile)) throw new Error(`preset not found: presets/${spec.preset}.json`);
      const preset = presetFile ? JSON.parse(readFileSync(presetFile, 'utf8')) as Record<string, unknown> : {};
      const sizeProps = spec.size === undefined ? {} : expandSize(asset.kind, spec.size);
      const merged = mergeStillProps({preset, props: spec.props, sizeProps, overlay: asset.kind !== 'background'});
      const props = asset.schema.strict().parse(merged) as Record<string, unknown>;
      const canvas = getLayoutOf(asset)?.(props).canvas ?? kindPolicies[asset.kind].fixedSize;
      if (!canvas) throw new Error('the composition does not report its canvas');
      prepared.push({spec, props, canvas, bleed: typeof props.bleed === 'number' ? props.bleed : 0, gl: getOpenGlRenderer(asset)});
    } catch (error) {
      errors.push(`${spec.name} (${spec.id}): ${error instanceof Error ? error.message.slice(0, 600) : String(error)}`);
    }
  }
  if (errors.length > 0) throw new Error(`Nothing rendered; fix these stills first:\n- ${errors.join('\n- ')}`);
  return prepared;
};

/** PNG upper bound: raw RGBA per still (the baseline doubles it), plus the bundle. */
const estimateBytes = (prepared: readonly Prepared[], job: StillsJob) => {
  const perRun = prepared.reduce((sum, p) => sum + p.canvas.width * p.canvas.height * 4, 0);
  return perRun * (job.baseline ? 2 : 1) + 200 * 1024 ** 2;
};

/** Cleanup that must also run on Ctrl-C: bundles, the baseline worktree and the render slot. */
const cleanups: (() => void)[] = [];
const runCleanups = () => { while (cleanups.length > 0) { try { cleanups.pop()!(); } catch { /* keep cleaning */ } } };
const onSignal = () => { runCleanups(); process.exit(130); };

const makeBundle = async (root: string, tag: string) => {
  const outDir = path.join(projectRoot, '.cache', `stills-bundle-${tag}-${process.pid}`);
  cleanups.push(() => rmSync(outDir, {recursive: true, force: true}));
  return bundle({entryPoint: path.join(root, 'src/index.ts'), outDir, enableCaching: false});
};

/** A detached worktree of `ref` that shares this checkout's node_modules. */
const addBaselineWorktree = (ref: string) => {
  // Under .cache (gitignored), so the checkout never shows it as untracked.
  const dir = path.join(projectRoot, '.cache', `stills-baseline-${process.pid}`);
  execFileSync('git', ['-C', projectRoot, 'worktree', 'add', '--detach', dir, ref], {stdio: 'ignore'});
  cleanups.push(() => execFileSync('git', ['-C', projectRoot, 'worktree', 'remove', '--force', dir], {stdio: 'ignore'}));
  symlinkSync(path.join(projectRoot, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
};

export type RunOptions = {jobFile: string; dryRun?: boolean; wait?: boolean};

export const runStills = async ({jobFile, dryRun = false, wait = true}: RunOptions) => {
  const job = parseJob(JSON.parse(readFileSync(jobFile, 'utf8')));
  const outDir = resolveOutDir(job, jobFile, projectRoot, localDate());
  const prepared = prepare(job);
  const boxes = regionProblems(job, new Map(prepared.map((p) => [p.spec.name, p.canvas])));
  if (boxes.length > 0) throw new Error(`Nothing rendered; fix these regions first:\n- ${boxes.join('\n- ')}`);
  const byName = new Map(prepared.map((p) => [p.spec.name, p]));
  const estimate = estimateBytes(prepared, job);
  const shown = path.relative(process.cwd(), outDir) || '.';

  if (dryRun) {
    for (const p of prepared) console.log(`${p.spec.name}: ${p.spec.id} frame ${p.spec.frame}, ${p.canvas.width}×${p.canvas.height}${p.gl ? ', WebGL' : ''}`);
    console.log(`${prepared.length} stills${job.baseline ? ` (+${prepared.length} at ${job.baseline.ref})` : ''}, ${job.sheets?.length ?? 0} sheets, ${job.mockups?.length ?? 0} mockups → ${shown}/`);
    console.log(`Disk: up to ${gibibytes(estimate)} for this job, ${gibibytes(freeBytes(outDir))} free (a job starts with at least ${gibibytes(START_MIN_FREE_BYTES)} and leaves at least ${gibibytes(RUN_MIN_FREE_BYTES)}).`);
    return null;
  }

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const report: Record<string, unknown> = {outDir, stills: {}, timings: {}};
  const stills = report.stills as Record<string, unknown>;
  const timings = report.timings as Record<string, number>;
  const logs = new Set<string>();
  const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error' || log.type === 'warning') logs.add(log.text.slice(0, 300)); };
  let browser: Browser | undefined;
  try {
    // No other render running and the slot held (render-turn.ts has the order and why).
    const slot = await takeRenderTurn({wait}, {
      busy: busyProcesses,
      outsideSlot: busyOutsideSlot,
      acquire: ({wait: waitForSlot, waitLimitMs, since}) => acquireRenderSlot({command: currentCommand(), wait: waitForSlot, waitLimitMs, since}),
      sleep,
      // Measured inside the slot: after waiting for another render, the disk is what that render left.
      whileHeld: () => assertCanStart({free: freeBytes(outDir), estimate, where: shown, then: FREE_SPACE_HINT}),
    });
    cleanups.push(() => slot.release());
    mkdirSync(outDir, {recursive: true});

    let t = Date.now();
    const serveUrl = await makeBundle(projectRoot, 'current');
    timings.bundleMs = Date.now() - t;
    const chromiumOptions = prepared.some((p) => p.gl === 'angle') ? {gl: 'angle' as const} : {};
    browser = await openBrowser('chrome', {chromiumOptions});
    const puppeteerInstance = browser;
    const compositions = new Map<string, Awaited<ReturnType<typeof selectComposition>>>();
    const compositionFor = async (url: string, p: Prepared) => {
      const key = `${url}|${p.spec.id}|${JSON.stringify(p.props)}`;
      if (!compositions.has(key)) {
        compositions.set(key, await selectComposition({serveUrl: url, id: p.spec.id, inputProps: p.props, puppeteerInstance, chromiumOptions, logLevel: 'error'}));
      }
      return compositions.get(key)!;
    };
    const renderOne = async (url: string, p: Prepared, frame: number, output: string) => {
      const composition = await compositionFor(url, p);
      const wrapped = wrapFrame(frame, composition.durationInFrames);
      await renderStill({serveUrl: url, composition, inputProps: p.props, frame: wrapped, output, imageFormat: 'png', overwrite: true,
        puppeteerInstance, chromiumOptions, logLevel: 'error', onBrowserLog});
      return {frame: wrapped, frames: composition.durationInFrames};
    };

    t = Date.now();
    for (const p of prepared) {
      const output = path.join(outDir, `${p.spec.name}.png`);
      const started = Date.now();
      const {frame, frames} = await renderOne(serveUrl, p, p.spec.frame, output);
      const png = readPng(output);
      const regions = regionReport(png, p.spec.name, job.regions ?? []);
      stills[p.spec.name] = {frame, frames, canvas: `${png.width}×${png.height}`, ms: Date.now() - started, meanLuma: meanLuma(png), ...alphaStats(png), regions: regions.stats};
      for (const crop of regions.crops) writePng(path.join(outDir, crop.file), crop.png);
    }
    timings.stillsMs = Date.now() - t;

    // Loop seam: N−1 → 0 must look like 0 → 1. The three frames become one small sheet.
    if (job.seams?.length) {
      report.seams = {};
      for (const ref of job.seams) {
        const p = byName.get(ref)!;
        const scratch = path.join(outDir, `.seam-${ref}`);
        mkdirSync(scratch, {recursive: true});
        const files = [-1, 0, 1].map((frame) => path.join(scratch, `${frame}.png`));
        for (const [i, frame] of [-1, 0, 1].entries()) await renderOne(serveUrl, p, frame, files[i]!);
        const [last, first, second] = files.map(readPng) as [Rgba, Rgba, Rgba];
        const seam = diffImages(last, first), step = diffImages(first, second);
        if (seam.sameSize && step.sameSize) (report.seams as Record<string, unknown>)[ref] = seamVerdict(seam.mean, step.mean);
        writePng(path.join(outDir, 'seams', `${ref}.png`), contactSheet([last, first, second], {cols: 3, width: 520, bg: 'checker'}));
        rmSync(scratch, {recursive: true, force: true});
      }
    }

    // Determinism: frames from one renderFrames tab must match fresh stills byte for byte.
    if (job.sequences?.length) {
      report.sequences = [];
      for (const sequence of job.sequences) {
        const p = byName.get(sequence.still)!;
        const composition = await compositionFor(serveUrl, p);
        const dir = path.join(outDir, `.sequence-${sequence.name}`);
        rmSync(dir, {recursive: true, force: true});
        await renderFrames({serveUrl, composition, inputProps: p.props, outputDir: dir, imageFormat: 'png', concurrency: 1,
          frameRange: [sequence.from, sequence.to], puppeteerInstance, chromiumOptions, logLevel: 'error',
          onStart: () => undefined, onFrameUpdate: () => undefined});
        const frames = readdirSync(dir).filter((file) => file.endsWith('.png')).sort();
        const results = [];
        for (const [index, file] of frames.entries()) {
          const frame = sequence.from + index;
          const fresh = path.join(dir, `fresh-${frame}.png`);
          await renderOne(serveUrl, p, frame, fresh);
          const [fromTab, alone] = [readPng(path.join(dir, file)), readPng(fresh)];
          const result = diffImages(fromTab, alone);
          if (!result.sameSize || result.identical) { results.push({frame, ...result}); continue; }
          // Where the drift sits points at the element that carries it (BGC-24).
          const {changedBox, heatmap} = diffDetail(fromTab, alone, 16);
          results.push({frame, ...result, changedBox});
          if (sequence.heatmaps) writePng(path.join(outDir, 'sequences', `${sequence.name}-${frame}.png`), heatmap);
        }
        const verdict = sequenceVerdict(results, sequence.tolerance);
        if (!verdict.ok) console.log(`Sequence ${sequence.name}: up to ${verdict.maxDelta}/255 against a tolerance of ${sequence.tolerance} (frames ${verdict.over.join(', ')}).`);
        (report.sequences as unknown[]).push({name: sequence.name, ...verdict, results});
        rmSync(dir, {recursive: true, force: true});
      }
    }

    // Before and after: the same stills at a git ref, in a detached worktree, with the same props.
    if (job.baseline) {
      t = Date.now();
      const worktree = addBaselineWorktree(job.baseline.ref);
      const baseUrl = await makeBundle(worktree, 'baseline');
      const baseline: Record<string, unknown> = {};
      for (const p of prepared) {
        const output = path.join(outDir, `${p.spec.name}.base.png`);
        try {
          await renderOne(baseUrl, p, p.spec.frame, output);
        } catch (error) {
          baseline[p.spec.name] = {error: error instanceof Error ? error.message.slice(0, 400) : String(error)};
          continue;
        }
        const before = readPng(output), after = readPng(path.join(outDir, `${p.spec.name}.png`));
        const result = diffImages(before, after);
        baseline[p.spec.name] = result;
        if (!result.sameSize || !result.identical) {
          writePng(path.join(outDir, 'compare', `${p.spec.name}.png`), contactSheet([before, after], {cols: 2, width: 780, bg: 'checker'}));
        }
      }
      report.baseline = {ref: job.baseline.ref, results: baseline};
      timings.baselineMs = Date.now() - t;
    }

    if (job.bench?.length) {
      const cpuOptions = {gl: 'swangle' as const};
      const cpu = await openBrowser('chrome', {chromiumOptions: cpuOptions});
      try {
        const bench: Record<string, unknown> = {};
        for (const ref of job.bench) {
          const p = byName.get(ref)!;
          const composition = await selectComposition({serveUrl, id: p.spec.id, inputProps: p.props, puppeteerInstance: cpu, chromiumOptions: cpuOptions, logLevel: 'error'});
          const output = path.join(outDir, `.bench-${ref}.png`);
          const times: number[] = [];
          for (let run = 0; run < 3; run++) {
            const started = Date.now();
            await renderStill({serveUrl, composition, inputProps: p.props, frame: wrapFrame(p.spec.frame, composition.durationInFrames), output,
              imageFormat: 'png', overwrite: true, puppeteerInstance: cpu, chromiumOptions: cpuOptions, logLevel: 'error'});
            times.push(Date.now() - started);
          }
          rmSync(output, {force: true});
          bench[ref] = {swangleMedianMs: times.sort((a, b) => a - b)[1]};
        }
        report.bench = bench;
      } finally {
        await cpu.close({silent: true}).catch(() => undefined);
      }
    }
  } finally {
    if (browser) await browser.close({silent: true}).catch(() => undefined);
    runCleanups();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  // CPU only from here: the browser is closed and the render slot released.
  const load = (ref: string) => readPng(path.join(outDir, `${ref}.png`));
  if (job.diffs?.length) report.diffs = job.diffs.map(([a, b]) => ({a, b, ...diffImages(load(a), load(b))}));
  for (const sheet of job.sheets ?? []) writePng(path.join(outDir, sheet.out), contactSheet(sheet.names.map(load), sheet));
  for (const mockup of job.mockups ?? []) {
    writePng(path.join(outDir, mockup.out), streamMockup({
      base: mockup.base.startsWith('#') ? mockup.base : load(mockup.base),
      width: mockup.width, height: mockup.height, maxWidth: mockup.maxWidth,
      layers: mockup.layers.map((layer) => ({image: load(layer.name), x: layer.x, y: layer.y, bleed: byName.get(layer.name)!.bleed})),
    }));
  }
  if (logs.size > 0) report.browserLogs = [...logs].slice(0, 20);
  writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);

  console.log(`${prepared.length} stills, ${job.sheets?.length ?? 0} sheets, ${job.mockups?.length ?? 0} mockups → ${shown}/`);
  const seams = Object.entries((report.seams ?? {}) as Record<string, {ok: boolean; ratio: number | null}>);
  for (const [ref, verdict] of seams) if (!verdict.ok) console.log(`Seam: ${ref} jumps ${verdict.ratio ?? '∞'}× a normal step (see seams/${ref}.png).`);
  if (job.baseline) {
    const changed = Object.entries((report.baseline as {results: Record<string, {identical?: boolean}>}).results)
      .filter(([, result]) => result.identical !== true).map(([ref]) => ref);
    console.log(changed.length === 0 ? `Baseline ${job.baseline.ref}: every still is identical.` : `Baseline ${job.baseline.ref}: ${changed.length} changed (compare/): ${changed.slice(0, 12).join(', ')}${changed.length > 12 ? ', …' : ''}`);
  }
  console.log(`Report: ${path.join(shown, 'report.json')}`);
  return report;
};
