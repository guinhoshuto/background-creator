import {createHash} from 'node:crypto';
import {createReadStream, existsSync} from 'node:fs';
import {lstat, mkdir, open, readFile, readdir, rename, rm, type FileHandle} from 'node:fs/promises';
import path from 'node:path';
import {crc32} from 'node:zlib';
import {outputFormatSchema, type OutputFormat} from '../src/settings';
import {SCRATCH_PREFIX} from './export';
import {START_MIN_FREE_BYTES, gibibytes} from './disk';
import {BUYER_PATH, packPropsHash, type PlannedFile} from './pack-plan';

/*
 * The buyer zip of a finished pack (npm run zip:pack). The list of files comes from the whole plan,
 * never from the folder or the manifest: those two are only checked against it. The zip is stored
 * (method 0), with a fixed date, mode and order, so the same files always give the same bytes; no
 * ZIP64, so a pack stays under 4 GiB and 65,535 files.
 */

/** A buyer path inside the zip, with the root folder left out, has at most this many characters. */
export const MAX_BUYER_PATH = 100;
/** Etsy caps a digital file name at 70 characters; the zip keeps to it wherever it is sold. */
export const MAX_ZIP_NAME = 70;
/** Free space the zip must leave on top of its own size before it is written. */
export const ZIP_DISK_MARGIN = 1024 ** 3;
/** Sizes and offsets are 32-bit without ZIP64: the whole zip stays below 4 GiB. */
export const ZIP32_LIMIT = 2 ** 32;
/** Entry counts are 16-bit without ZIP64. */
export const ZIP_MAX_ENTRIES = 0xffff;

const ZIP_NAME = /^[a-z0-9-]+\.zip$/;
/** A sidecar is the export's JSON next to its file (`<file>.<ext>.json`); the pack build folds it into the manifest. */
const SIDECAR = new RegExp(`\\.(${outputFormatSchema.options.join('|')})\\.json$`);
/** 1980-01-01 00:00 in DOS format: the earliest date a zip holds, the same in every build. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
/** Version made by: Unix (3), spec 2.0 (20); needed to extract: 1.0, a stored file. */
const MADE_BY = 0x0314;
const NEEDED = 10;
/** A regular file, rw-r--r--, in the high half of the external attributes (Unix). */
const EXTERNAL_ATTRIBUTES = (0o100644 << 16) >>> 0;
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;

/** The zip a pack is sold as: out/deliveries/<pack>-overlay-pack.zip. */
export const zipFileName = (pack: string) => `${pack}-overlay-pack.zip`;

/** Where an interrupted write leaves its bytes; the next run removes it first. */
export const partialFileName = (pack: string) => `.${zipFileName(pack)}.partial`;

export class PackContentsError extends Error {}

const fail = (lines: readonly string[]): never => {
  throw new PackContentsError(lines.join('\n'));
};

const MAGIC: Record<OutputFormat, (head: Buffer) => boolean> = {
  webm: (head) => head.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')),
  png: (head) => head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  gif: (head) => ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('latin1')),
  mp4: (head) => head.subarray(4, 8).toString('latin1') === 'ftyp',
  mov: (head) => head.subarray(4, 8).toString('latin1') === 'ftyp',
};

/** Whether a file's first bytes are those of its format (it was not renamed from another one). */
export const magicMatches = (format: OutputFormat, head: Buffer) => MAGIC[format](head);

/** The buyer-name rules the planner's paths must keep: the pattern, the length and no two alike. */
export const buyerPathIssues = (names: readonly string[]): string[] => {
  const issues: string[] = [];
  const lower = new Map<string, string>();
  const base = new Map<string, string>();
  for (const name of names) {
    if (!BUYER_PATH.test(name)) issues.push(`${name}: not a buyer file name (<folder>/<pack>-<piece>[-<variant>].<ext>, lowercase letters, digits and single hyphens).`);
    if (name.length > MAX_BUYER_PATH) issues.push(`${name}: ${name.length} characters, over the ${MAX_BUYER_PATH} a buyer path may have.`);
    const folded = name.toLowerCase();
    if (lower.has(folded)) issues.push(`${name}: the same path as ${lower.get(folded)} on a case-insensitive disk.`);
    else lower.set(folded, name);
    const file = path.posix.basename(folded);
    if (base.has(file)) issues.push(`${name}: the same file name as ${base.get(file)}; every file name in a pack is unique.`);
    else base.set(file, name);
  }
  return issues;
};

/** The zip name keeps to what every shop and disk accepts. */
export const assertZipName = (name: string) => {
  if (!ZIP_NAME.test(name)) fail([`The zip name ${name} is not lowercase letters, digits and hyphens.`]);
  if (name.length > MAX_ZIP_NAME) fail([`The zip name ${name} has ${name.length} characters, over the ${MAX_ZIP_NAME} Etsy accepts.`]);
};

export type ZipSource = {
  /** The path inside the zip: relative to the pack folder, POSIX separators. */
  name: string;
  /** The file on disk. */
  file: string;
};

type ManifestEntry = {
  file?: unknown; format?: unknown; propsHash?: unknown; role?: unknown; mask?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every file and folder under the pack folder, relative to it; empty when there is no folder. */
const walk = async (root: string, relative = ''): Promise<{files: string[]; scratch: string[]}> => {
  const found = {files: [] as string[], scratch: [] as string[]};
  let entries;
  try {
    entries = await readdir(path.join(root, relative), {withFileTypes: true});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return found;
    throw error;
  }
  for (const entry of entries) {
    const name = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.name.startsWith(SCRATCH_PREFIX)) found.scratch.push(name);
    else if (entry.isDirectory()) {
      const inner = await walk(root, name);
      found.files.push(...inner.files);
      found.scratch.push(...inner.scratch);
    } else found.files.push(name);
  }
  return found;
};

const readHead = async (file: string) => {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(12);
    const {bytesRead} = await handle.read(head, 0, head.length, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const listText = (items: readonly string[], limit = 10) =>
  [...items.slice(0, limit).map((item) => `  ${item}`), ...(items.length > limit ? [`  …and ${items.length - limit} more`] : [])];

/**
 * Checks a finished pack folder against the whole plan and returns what goes into the zip: exactly
 * the planned files, masks included, sorted by the bytes of their path. Refuses (PackContentsError,
 * every problem at once) a missing, empty or non-regular planned file, a file whose bytes are not
 * its format, a stale or incomplete manifest, a props hash that is not the plan's, a name outside
 * the buyer rule and any sign of an interrupted build (sidecars, .asset-render-*, manifest.json.tmp).
 * Loose files only warn and stay out; .DS_Store and ._* pass in silence.
 */
export const checkPackContents = async ({pack, plan, packDirectory, packLabel = packDirectory}: {
  pack: string; plan: readonly PlannedFile[]; packDirectory: string; packLabel?: string;
}): Promise<{entries: ZipSource[]; warnings: string[]}> => {
  const packRoot = path.posix.join('out', 'packs', pack);
  const relativeOf = (output: string) => path.posix.relative(packRoot, output);
  const planned = new Map(plan.map((file) => [relativeOf(file.output), file]));
  const issues: string[] = [];
  const warnings: string[] = [];

  issues.push(...buyerPathIssues([...planned.keys()]));

  // The folder: an interrupted build is refused, anything else unplanned only warns.
  const {files, scratch} = await walk(packDirectory);
  const interrupted = [
    ...scratch,
    ...files.filter((name) => name === 'manifest.json.tmp' || SIDECAR.test(name)),
  ];
  if (interrupted.length > 0) {
    issues.push(`An interrupted build left files in ${packLabel}:`, ...listText(interrupted),
      `Run npm run render:pack -- ${pack} to finish it.`);
  }
  const quiet = (name: string) => {
    const base = path.posix.basename(name);
    return base === '.DS_Store' || base.startsWith('._');
  };
  const loose = files.filter((name) => !planned.has(name) && name !== 'manifest.json'
    && !interrupted.includes(name) && !quiet(name));
  if (loose.length > 0) warnings.push(`Warning: ${loose.length} file(s) in ${packLabel} are not in the plan and stay out of the zip:`, ...listText(loose));

  // Every planned file: there, a regular non-empty file, and its bytes are its format.
  const missing: string[] = [];
  for (const [name, file] of planned) {
    const target = path.join(packDirectory, name);
    let stats;
    try {
      stats = await lstat(target);
    } catch {
      missing.push(name);
      continue;
    }
    if (!stats.isFile()) issues.push(`${name}: not a regular file (a link or a folder); the zip takes real files only.`);
    else if (stats.size === 0) issues.push(`${name}: empty file. Run npm run render:pack -- ${pack} --overwrite --only ${name}.`);
    else if (!magicMatches(file.format, await readHead(target))) issues.push(`${name}: its first bytes are not those of a ${file.format} file.`);
  }
  if (missing.length > 0) {
    issues.push(`Missing ${missing.length} planned files in ${packLabel}:`, ...listText(missing),
      `Run npm run render:pack -- ${pack} to finish the pack.`);
  }

  // The manifest: the plan's name, the plan's files both ways, formats, masks and props hashes.
  const manifestPath = path.join(packDirectory, 'manifest.json');
  let manifest: unknown = null;
  if (!existsSync(manifestPath)) issues.push(`No manifest.json in ${packLabel}. Run npm run render:pack -- ${pack}.`);
  else {
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
    } catch {
      issues.push(`${packLabel}/manifest.json is not valid JSON. Run npm run render:pack -- ${pack}.`);
    }
  }
  if (manifest !== null) {
    if (!isRecord(manifest) || !Array.isArray(manifest.files)) issues.push(`${packLabel}/manifest.json has no files list.`);
    else {
      if (manifest.name !== pack) issues.push(`${packLabel}/manifest.json names the pack ${String(manifest.name)}, not ${pack}.`);
      const entries = new Map<string, ManifestEntry>();
      for (const entry of manifest.files as unknown[]) {
        if (isRecord(entry) && typeof entry.file === 'string') entries.set(entry.file, entry);
      }
      const unrecorded = [...planned.keys()].filter((name) => !entries.has(name));
      const stale = [...entries.keys()].filter((name) => !planned.has(name));
      if (unrecorded.length > 0) issues.push(`${unrecorded.length} planned files have no manifest entry:`, ...listText(unrecorded));
      if (stale.length > 0) {
        issues.push(`${stale.length} manifest entries are not in the plan:`, ...listText(stale),
          `Run npm run render:pack -- ${pack}: it prunes them.`);
      }
      for (const [name, entry] of entries) {
        const file = planned.get(name);
        if (!file) continue;
        const extension = path.posix.extname(name).slice(1);
        if (entry.format !== file.format || extension !== file.format) {
          issues.push(`${name}: the manifest says ${String(entry.format)}, the file is .${extension} and the plan ${file.format}.`);
        }
        if (file.mask !== undefined) {
          const mask = relativeOf(file.mask);
          const target = entries.get(mask);
          if (entry.mask !== mask || target?.role !== 'mask') issues.push(`${name}: its mask must be ${mask}, recorded with role mask.`);
        }
        if (entry.propsHash === undefined) {
          issues.push(`${name}: no props hash is recorded, so it may not match the plan. Run npm run render:pack -- ${pack} --overwrite --only ${name}.`);
        } else if (entry.propsHash !== packPropsHash(file)) {
          issues.push(`${name}: rendered from other props than the plan. Run npm run render:pack -- ${pack} to render it again.`);
        }
      }
    }
  }

  if (issues.length > 0) fail(issues);
  const sources = [...planned.keys()]
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map((name) => ({name, file: path.join(packDirectory, name)}));
  return {entries: sources, warnings};
};

export type MeasuredSource = ZipSource & {size: number; crc: number};

type Layout = {offsets: number[]; centralOffset: number; centralSize: number; totalBytes: number};

/** Where every header lands: stored data, no extra fields, no comment. */
export const zipLayout = (entries: readonly Pick<MeasuredSource, 'name' | 'size'>[]): Layout => {
  const offsets: number[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.byteLength(entry.name);
    offsets.push(offset);
    offset += LOCAL_HEADER + nameBytes + entry.size;
    centralSize += CENTRAL_HEADER + nameBytes;
  }
  return {offsets, centralOffset: offset, centralSize, totalBytes: offset + centralSize + END_RECORD};
};

/** No ZIP64: every size and offset is 32-bit, and the entry count 16-bit. */
export const assertZip32 = (entries: readonly Pick<MeasuredSource, 'name' | 'size'>[]) => {
  const layout = zipLayout(entries);
  if (layout.totalBytes >= ZIP32_LIMIT) fail(['The pack is over 4 GiB: ZIP64 is not supported; split the formats into another pack.']);
  if (entries.length >= ZIP_MAX_ENTRIES) fail([`The pack has ${entries.length} files: ZIP64 is not supported; split it into smaller packs.`]);
  return layout;
};

const localHeader = (entry: MeasuredSource) => {
  const name = Buffer.from(entry.name);
  const header = Buffer.alloc(LOCAL_HEADER);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(NEEDED, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name]);
};

const centralDirectory = (entries: readonly MeasuredSource[], layout: Layout) => {
  const records = entries.map((entry, index) => {
    const name = Buffer.from(entry.name);
    const header = Buffer.alloc(CENTRAL_HEADER);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(MADE_BY, 4);
    header.writeUInt16LE(NEEDED, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.size, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(EXTERNAL_ATTRIBUTES, 38);
    header.writeUInt32LE(layout.offsets[index]!, 42);
    return Buffer.concat([header, name]);
  });
  const end = Buffer.alloc(END_RECORD);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(layout.centralSize, 12);
  end.writeUInt32LE(layout.centralOffset, 16);
  return Buffer.concat([...records, end]);
};

/** Streams one file, checking it still has the size (and CRC) the first pass measured. */
const streamSource = async (entry: MeasuredSource, sink: (chunk: Buffer) => Promise<void>) => {
  let size = 0;
  let crc = 0;
  for await (const chunk of createReadStream(entry.file) as AsyncIterable<Buffer>) {
    size += chunk.length;
    crc = crc32(chunk, crc);
    await sink(chunk);
  }
  if (size !== entry.size) {
    fail([`${entry.name} changed size between passes (${entry.size} B, then ${size} B): something is writing to the pack folder. Wait for it and run again.`]);
  }
  if (crc !== entry.crc) fail([`${entry.name} changed between passes: something is writing to the pack folder. Wait for it and run again.`]);
};

/** First pass: the size and CRC of every file, read as a stream. */
export const measureSources = async (sources: readonly ZipSource[]): Promise<MeasuredSource[]> => {
  const measured: MeasuredSource[] = [];
  for (const source of sources) {
    let size = 0;
    let crc = 0;
    for await (const chunk of createReadStream(source.file) as AsyncIterable<Buffer>) {
      size += chunk.length;
      crc = crc32(chunk, crc);
    }
    measured.push({...source, size, crc});
  }
  return measured;
};

/** The zip's bytes, in order, handed to `sink`: local header and data per file, then the central directory. */
export const streamZip = async (entries: readonly MeasuredSource[], sink: (chunk: Buffer) => Promise<void>) => {
  const layout = assertZip32(entries);
  for (const entry of entries) {
    await sink(localHeader(entry));
    await streamSource(entry, sink);
  }
  await sink(centralDirectory(entries, layout));
  return layout;
};

/**
 * Reads a zip's central directory back: name, size, CRC, offset and method of every entry. `zip`
 * is the end of the file from byte `start` on (the whole file by default), central directory included.
 */
export const readCentralDirectory = (zip: Buffer, start = 0) => {
  const end = zip.length - END_RECORD;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) fail(['The written zip has no end record.']);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16) - start;
  const entries: {name: string; size: number; crc: number; offset: number; method: number}[] = [];
  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) fail(['The written zip has a broken central directory.']);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    entries.push({
      name: zip.toString('utf8', at + CENTRAL_HEADER, at + CENTRAL_HEADER + nameLength),
      method: zip.readUInt16LE(at + 10), crc: zip.readUInt32LE(at + 16), size: zip.readUInt32LE(at + 24),
      offset: zip.readUInt32LE(at + 42),
    });
    at += CENTRAL_HEADER + nameLength + extra + comment;
  }
  return entries;
};

/** Reads the central directory from the end of a file on disk, without loading the data. */
const readCentralDirectoryOf = async (file: string, layout: Layout) => {
  const handle = await open(file, 'r');
  try {
    const length = layout.centralSize + END_RECORD;
    const tail = Buffer.alloc(length);
    await handle.read(tail, 0, length, layout.centralOffset);
    return readCentralDirectory(tail, layout.centralOffset);
  } finally {
    await handle.close();
  }
};

const sha256Of = async (file: string) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file) as AsyncIterable<Buffer>) hash.update(chunk);
  return hash.digest('hex');
};

const mebibytes = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

export type ZipPackEffects = {
  /** Free bytes on the disk that holds the deliveries folder. */
  freeBytes: () => Promise<number>;
  log: (message: string) => void;
  /** Writes one chunk of the partial zip; tests use it to fail a write halfway. */
  writeChunk?: (handle: FileHandle, chunk: Buffer) => Promise<void>;
  /** Runs between the measuring pass and the next; tests use it to change a file under the zip. */
  betweenPasses?: () => Promise<void>;
};

/**
 * Checks the pack and builds (or, with `check`, only compares) its buyer zip. Returns the exit code:
 * 0 written or already up to date; with `check`, 0 up to date and 2 missing or different. Throws
 * PackContentsError when a check fails (exit 1): nothing is written then.
 */
export const zipPack = async ({pack, plan, packDirectory, deliveriesDirectory, packLabel, zipLabel, check, effects}: {
  pack: string; plan: readonly PlannedFile[]; packDirectory: string; deliveriesDirectory: string;
  packLabel?: string; zipLabel?: string; check: boolean; effects: ZipPackEffects;
}): Promise<{code: 0 | 2; sha256: string; zip: string}> => {
  const name = zipFileName(pack);
  assertZipName(name);
  const zip = path.join(deliveriesDirectory, name);
  const label = zipLabel ?? zip;
  const partial = path.join(deliveriesDirectory, partialFileName(pack));
  if (!check) await rm(partial, {force: true});

  const {entries, warnings} = await checkPackContents({pack, plan, packDirectory, ...(packLabel === undefined ? {} : {packLabel})});
  for (const warning of warnings) effects.log(warning);
  const measured = await measureSources(entries);
  const layout = assertZip32(measured);
  await effects.betweenPasses?.();

  // Second pass: the hash of the zip these files make, without writing it.
  const planned = createHash('sha256');
  await streamZip(measured, async (chunk) => {
    planned.update(chunk);
  });
  const sha256 = planned.digest('hex');
  const current = existsSync(zip) ? await sha256Of(zip) : null;
  const summary = `${measured.length} files, ${mebibytes(layout.totalBytes)}, sha256 ${sha256}`;
  if (current === sha256) {
    effects.log(`Already up to date. Zip: ${label}, ${summary}`);
    return {code: 0, sha256, zip};
  }
  if (check) {
    effects.log(current === null ? `No zip yet: ${label} would have ${summary}.` : `The zip ${label} differs: the pack now makes ${summary}.`);
    return {code: 2, sha256, zip};
  }

  const free = await effects.freeBytes();
  if (free < layout.totalBytes + ZIP_DISK_MARGIN) {
    fail([`Not enough free space for ${label}: ${gibibytes(free)} free, and the zip needs ${gibibytes(layout.totalBytes + ZIP_DISK_MARGIN)} (its size plus 1 GiB). Free up space and run again.`]);
  }

  // Third pass: write to a partial file, flush it, then rename it over the old zip in one step.
  await mkdir(deliveriesDirectory, {recursive: true});
  const written = createHash('sha256');
  const handle = await open(partial, 'w', 0o644);
  const write = effects.writeChunk ?? (async (target: FileHandle, chunk: Buffer) => {
    await target.write(chunk);
  });
  try {
    await streamZip(measured, async (chunk) => {
      written.update(chunk);
      await write(handle, chunk);
    });
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(partial, {force: true});
    throw error;
  }
  if (written.digest('hex') !== sha256) {
    await rm(partial, {force: true});
    fail(['The pack folder changed while the zip was written. Wait for any render and run again.']);
  }
  const readBack = await readCentralDirectoryOf(partial, layout);
  const expected = measured.map((entry, index) => ({name: entry.name, size: entry.size, crc: entry.crc, offset: layout.offsets[index]!}));
  const got = readBack.map(({name: entryName, size, crc, offset}) => ({name: entryName, size, crc, offset}));
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    await rm(partial, {force: true});
    fail(['The written zip does not read back as planned; nothing was replaced.']);
  }
  await rename(partial, zip);
  effects.log(`Zip: ${label}, ${summary}`);
  const after = await effects.freeBytes();
  if (after < START_MIN_FREE_BYTES) effects.log(`Warning: ${gibibytes(after)} free after the zip; a render needs at least ${gibibytes(START_MIN_FREE_BYTES)} to start.`);
  return {code: 0, sha256, zip};
};
