import {existsSync} from 'node:fs';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {projectRoot} from './export';
import {PackContentsError, checkPackContents} from './pack-contents';
import {existingManifestFile, parsePackManifest, planPack, realPackDeps} from './pack-plan';
import {byteTotals, mediaIssues, probeMedia} from './pack-validate';
import {ffmpegPath, ffprobePath, runProcess} from './process';
import {DEFAULT_VALIDATION_OUT} from './validate-args';

const HELP_TEXT = `usage: npm run validate:pack -- <name|file.json>

Reads back every file of the finished pack in out/packs/<name>/ and compares it with the plan:
first the zip checks (every planned file there, its format's bytes, the manifest and props hashes),
then each file with ffprobe and its first frame decoded: codec, width and height, FPS, frame count,
duration, no audio, alpha (VP9 alpha tag and a transparent pixel, or fully opaque), a GIF that loops
forever and the Twitch panel under 2.9 MB. Renders nothing and does not wait for the render slot.

Writes ${DEFAULT_VALIDATION_OUT}/<name>-pack.json (every file, its bytes and its issues).
Exit 0: the pack is what the plan says; 1: something differs (all listed at once).

Options:
  -h, --help   shows this help`;

const mib = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

const main = async () => {
  const {values, positionals} = parseArgs({args: process.argv.slice(2), allowPositionals: true, options: {help: {type: 'boolean', short: 'h'}}});
  if (values.help) {console.log(HELP_TEXT); return;}
  if (positionals.length !== 1) throw new Error('Name one pack: npm run validate:pack -- <name|file.json>. Use --help.');
  // Tools first: a missing decoder fails before reading 100 files.
  await runProcess(ffprobePath(), ['-version']);
  const decoders = (await runProcess(ffmpegPath(), ['-hide_banner', '-decoders'])).toString();
  if (!/\blibvpx-vp9\b/.test(decoders)) {
    throw new Error(`${ffmpegPath()} has no libvpx-vp9 decoder, so VP9 alpha cannot be read back. Use the full FFmpeg in /opt/homebrew/bin (FFMPEG_PATH).`);
  }
  const manifest = parsePackManifest(JSON.parse(await readFile(existingManifestFile(positionals[0]!), 'utf8')));
  const plan = planPack(manifest, realPackDeps);
  const packLabel = path.posix.join('out', 'packs', manifest.name);
  const packDirectory = path.join(projectRoot, packLabel);

  const problems: string[] = [];
  try {
    const {warnings} = await checkPackContents({pack: manifest.name, plan, packDirectory, packLabel});
    for (const line of warnings) console.log(line);
  } catch (error) {
    if (!(error instanceof PackContentsError)) throw error;
    problems.push(...error.message.split('\n'));
  }

  const rows = [];
  for (const [index, file] of plan.entries()) {
    const relative = path.posix.relative(packLabel, file.output);
    const target = path.join(projectRoot, file.output);
    if (!existsSync(target)) continue; // checkPackContents already listed it as missing.
    const probe = await probeMedia(target, file.format);
    const issues = mediaIssues(file, probe);
    rows.push({file: relative, format: file.format, bytes: probe.bytes, probe, issues});
    for (const issue of issues) problems.push(`${relative}: ${issue}`);
    process.stdout.write(`\r  read ${index + 1}/${plan.length}`);
  }
  if (plan.length > 0) process.stdout.write('\n');

  const totals = byteTotals(rows);
  const destination = path.join(projectRoot, DEFAULT_VALIDATION_OUT);
  await mkdir(destination, {recursive: true});
  const reportPath = path.join(destination, `${manifest.name}-pack.json`);
  const report = {pack: manifest.name, checkedAt: new Date().toISOString(), planned: plan.length, read: rows.length, ok: problems.length === 0, problems, totals, files: rows};
  // Written whole, then renamed: a stopped run never leaves half a report.
  await writeFile(`${reportPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  await rename(`${reportPath}.tmp`, reportPath);

  const perFormat = Object.entries(totals.perFormat).map(([format, bytes]) => `${format} ${mib(bytes)}`).join(', ');
  const reportLabel = path.relative(process.cwd(), reportPath);
  if (problems.length > 0) {
    console.error([`${manifest.name}: ${problems.length} problem(s):`, ...problems.map((line) => `  ${line}`)].join('\n'));
    console.error(`Report: ${reportLabel}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${manifest.name}: ${rows.length} files match the plan, ${mib(totals.total)} (${perFormat}). Report: ${reportLabel}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
