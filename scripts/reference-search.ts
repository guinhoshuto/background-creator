// npm run reference -- search <query...> | fetch <list.json> --out <dir>: licensed visual reference from
// Wikimedia Commons and Openverse (scripts/reference-plan.ts).
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_LICENSES, LICENSES, MAX_LIMIT, SOURCES, checkOutDir, fetchReferences, formatSearch, httpWith, mergeSources,
  parseFetchList, readSources, realFetchEffects, realGit, searchReferences, type License, type Source,
} from './reference-plan';

const HELP = `Usage:
  npm run reference -- search <query...> [--source commons|openverse|both] [--limit N] [--license ${DEFAULT_LICENSES.join(',')}] [--json]
  npm run reference -- fetch <list.json> --out <dir> [--width 1600] [--license …] [--overwrite]

search  lists each query's files on Wikimedia Commons and Openverse with size, licence, creator and the page
        that shows the licence; files outside --license (or with no licence) are left out and counted.
fetch   downloads the files a list names, one request at a time, into <dir>/<name>.<ext>, and records the
        licence, creator, credit and page of each in <dir>/sources.json (merged by name).
        The list: [{"name": "01_whirlpool-m51", "commons": "File:Messier51 sRGB.jpg", "width": 1800},
                   {"name": "02_nebula", "openverse": "<id>"}]
        <dir> must not be tracked by git: the vault (~/obsidian/Visual Ref/<theme>/) or out/.scratch/reference/.
  --license   allowed licences, from ${LICENSES.join(', ')} (default ${DEFAULT_LICENSES.join(',')}, free for commercial use)
  --limit     results per query and service (default 8, at most ${MAX_LIMIT})
  --width     Commons thumbnail width in px (default 1600); Openverse downloads the original

Every request carries the store's contact in the User-Agent (Wikimedia's policy), never a personal e-mail.`;

type Parsed = {command: string; positional: string[]; flags: Map<string, string | true>};

const VALUED = new Set(['--source', '--limit', '--license', '--width', '--out']);
const BOOLEAN = new Set(['--json', '--overwrite', '--help']);

const parse = (args: string[]): Parsed => {
  const [command = '', ...rest] = args[0]?.startsWith('--') ? ['', ...args] : args;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (VALUED.has(arg)) {
      const value = rest[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value.`);
      flags.set(arg, value);
    } else if (BOOLEAN.has(arg)) {
      flags.set(arg, true);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      positional.push(arg);
    }
  }
  return {command, positional, flags};
};

const positiveInt = (value: string | true | undefined, fallback: number, name: string, max = Infinity) => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) throw new Error(`${name} must be an integer from 1 to ${max === Infinity ? 'any' : max}.`);
  return number;
};

const licensesOf = (value: string | true | undefined): License[] => {
  if (value === undefined) return [...DEFAULT_LICENSES];
  const codes = String(value).split(',').map((code) => code.trim()).filter(Boolean);
  const unknown = codes.filter((code) => !(LICENSES as readonly string[]).includes(code));
  if (codes.length === 0 || unknown.length > 0) throw new Error(`Unknown licence ${unknown.join(', ') || '(empty)'}: pick from ${LICENSES.join(', ')}.`);
  return codes as License[];
};

const sourcesOf = (value: string | true | undefined): Source[] => {
  if (value === undefined || value === 'both') return [...SOURCES];
  if ((SOURCES as readonly string[]).includes(String(value))) return [value as Source];
  throw new Error(`--source is commons, openverse or both.`);
};

const main = async () => {
  const {command, positional, flags} = parse(process.argv.slice(2));
  if (flags.has('--help') || command === '' || command === 'help') {
    console.log(HELP);
    return;
  }
  const licenses = licensesOf(flags.get('--license'));
  const width = positiveInt(flags.get('--width'), 1600, '--width');
  if (command === 'search') {
    if (positional.length === 0) throw new Error(`search needs at least one query.\n\n${HELP}`);
    const effects = realFetchEffects();
    const results = await searchReferences(positional, {
      sources: sourcesOf(flags.get('--source')), limit: positiveInt(flags.get('--limit'), 8, '--limit', MAX_LIMIT), width, licenses,
    }, httpWith(fetch), effects.pause);
    console.log(flags.has('--json') ? JSON.stringify(results, null, 2) : formatSearch(results, licenses));
    return;
  }
  if (command === 'fetch') {
    const out = flags.get('--out');
    if (positional.length !== 1 || typeof out !== 'string') throw new Error(`fetch takes one list file and --out <dir>.\n\n${HELP}`);
    const outDir = path.resolve(out);
    checkOutDir(outDir, realGit);
    const items = parseFetchList(JSON.parse(readFileSync(positional[0], 'utf8')));
    const outcome = await fetchReferences(items, {outDir, width, licenses, overwrite: flags.has('--overwrite')}, realFetchEffects());
    if (outcome.written.length > 0) {
      const sources = path.join(outDir, 'sources.json');
      mkdirSync(outDir, {recursive: true});
      writeFileSync(sources, `${JSON.stringify(mergeSources(readSources(sources), outcome.written), null, 1)}\n`);
    }
    for (const record of outcome.written) console.log(`${record.file} ${record.bytes} B | ${record.licenseLabel} | ${record.creator || record.credit}`);
    for (const {name, why} of outcome.refused) console.log(`refused ${name}: ${why}`);
    console.log(`${outcome.written.length} fetched into ${outDir}, ${outcome.refused.length} refused.`);
    if (outcome.refused.length > 0) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command ${command}.\n\n${HELP}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
