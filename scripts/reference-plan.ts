// Licensed visual reference from Wikimedia Commons and Openverse: search, then fetch each file with its
// licence and credit in sources.json. BGC-35 (2026-10-14): the Galaxy reference came from throwaway
// scripts in a scratchpad, gone at the next reboot, and two of them sent a personal e-mail in the
// User-Agent. The contact is the store's address (decided on 2026-10-15). A file without a known
// licence from the allowed list is never downloaded, and nothing downloaded lands where git tracks it.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

/**
 * Wikimedia asks every client for a User-Agent with a way to reach whoever runs it
 * (https://meta.wikimedia.org/wiki/User-Agent_policy): the store, never a person's e-mail.
 */
export const USER_AGENT = 'CacarecoVisualRef/1.0 (https://cacare.co) background-creator';

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
export const OPENVERSE_API = 'https://api.openverse.org/v1/images/';

/** Licence codes as Openverse writes them; Commons labels are mapped onto them by normalizeLicense. */
export const LICENSES = ['cc0', 'pdm', 'by', 'by-sa', 'by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd'] as const;
export type License = typeof LICENSES[number];
/** Free for commercial use: the store sells what a reference teaches. */
export const DEFAULT_LICENSES: readonly License[] = ['cc0', 'pdm', 'by', 'by-sa'];
export const SOURCES = ['commons', 'openverse'] as const;
export type Source = typeof SOURCES[number];

/** Between two requests to the same service, as the case did by hand; the APIs ask for serial requests. */
export const PAUSE_MS = 1000;
/** At most this many results per query and service. */
export const MAX_LIMIT = 50;

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/tiff': '.tif',
};

export type Reference = {
  source: Source;
  /** The Commons file title or the Openverse id: what a fetch list names. */
  id: string;
  title: string;
  width: number | null;
  height: number | null;
  /** null: no licence from LICENSES, so never fetched. */
  license: License | null;
  /** The licence as the source wrote it. */
  licenseLabel: string;
  licenseUrl: string | null;
  creator: string;
  credit: string;
  /** The page that shows the licence: the citation in the Visual Ref note. */
  page: string;
  /** What fetch downloads: the Commons thumbnail at the asked width, the Openverse original. */
  download: string | null;
};

export type Http = {
  getJson: (url: string) => Promise<unknown>;
  getBytes: (url: string) => Promise<{bytes: Uint8Array; type: string}>;
};

/** Plain text from the HTML Commons puts in Artist and Credit. */
export const stripHtml = (value: unknown): string => typeof value !== 'string' ? '' : value
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/** A Commons LicenseShortName ("CC BY-SA 4.0", "Public domain") or an Openverse code, as a code; null when unknown. */
export const normalizeLicense = (label: string): License | null => {
  const text = label.trim().toLowerCase().replace(/_/g, ' ');
  if (/^(cc0|cc-zero|cc zero)(\s|$)/.test(text)) return 'cc0';
  if (/^(public domain|pdm|pd)(\s|-|$)/.test(text)) return 'pdm';
  const match = /^(?:cc[ -])?by((?:-(?:nc|nd|sa))*)(\s|$)/.exec(text);
  if (!match) return null;
  const parts = match[1].split('-').filter(Boolean);
  if (parts.includes('nd') && parts.includes('sa')) return null;
  const code = ['by', parts.includes('nc') ? 'nc' : '', parts.includes('nd') ? 'nd' : parts.includes('sa') ? 'sa' : '']
    .filter(Boolean).join('-');
  return (LICENSES as readonly string[]).includes(code) ? code as License : null;
};

type CommonsPage = {
  title?: string;
  index?: number;
  imageinfo?: Array<{
    width?: number; height?: number; thumburl?: string; url?: string; descriptionurl?: string;
    extmetadata?: Record<string, {value?: unknown} | undefined>;
  }>;
};

const commonsParams = (extra: Record<string, string>, width: number) => new URLSearchParams({
  action: 'query', format: 'json', ...extra, prop: 'imageinfo', iiprop: 'url|size|extmetadata',
  iiurlwidth: String(width), iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit',
});

export const commonsSearchUrl = (query: string, limit: number, width: number) =>
  `${COMMONS_API}?${commonsParams({generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: String(limit)}, width)}`;

export const commonsFileUrl = (title: string, width: number) => `${COMMONS_API}?${commonsParams({titles: title}, width)}`;

/** Every file of a Commons query response, in the search's own order. */
export const parseCommons = (data: unknown): Reference[] => {
  const pages = Object.values(((data as {query?: {pages?: Record<string, CommonsPage>}})?.query?.pages) ?? {});
  return pages
    .filter((page) => page.title && page.imageinfo?.length)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => {
      const info = page.imageinfo![0];
      const meta = info.extmetadata ?? {};
      const licenseLabel = stripHtml(meta.LicenseShortName?.value);
      return {
        source: 'commons',
        id: page.title!,
        title: page.title!,
        width: info.width ?? null,
        height: info.height ?? null,
        license: normalizeLicense(licenseLabel),
        licenseLabel,
        licenseUrl: stripHtml(meta.LicenseUrl?.value) || null,
        creator: stripHtml(meta.Artist?.value),
        credit: stripHtml(meta.Credit?.value),
        page: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title!.replace(/ /g, '_'))}`,
        download: info.thumburl ?? info.url ?? null,
      };
    });
};

type OpenverseImage = {
  id?: string; title?: string; width?: number; height?: number; license?: string; license_version?: string;
  license_url?: string; creator?: string; attribution?: string; foreign_landing_url?: string; url?: string;
};

export const openverseSearchUrl = (query: string, limit: number, licenses: readonly License[]) =>
  `${OPENVERSE_API}?${new URLSearchParams({q: query, license: licenses.join(','), page_size: String(limit)})}`;

export const openverseImageUrl = (id: string) => `${OPENVERSE_API}${encodeURIComponent(id)}/`;

export const parseOpenverseImage = (image: OpenverseImage): Reference => ({
  source: 'openverse',
  id: image.id ?? '',
  title: image.title ?? '',
  width: image.width ?? null,
  height: image.height ?? null,
  license: normalizeLicense(image.license ?? ''),
  licenseLabel: [image.license, image.license_version].filter(Boolean).join(' '),
  licenseUrl: image.license_url ?? null,
  creator: image.creator ?? '',
  credit: image.attribution ?? '',
  page: image.foreign_landing_url ?? '',
  download: image.url ?? null,
});

export const parseOpenverse = (data: unknown): Reference[] =>
  ((data as {results?: OpenverseImage[]})?.results ?? []).map(parseOpenverseImage);

export type SearchOptions = {sources: readonly Source[]; limit: number; width: number; licenses: readonly License[]};
export type SearchResult = {query: string; source: Source; kept: Reference[]; dropped: Reference[]};

const allowed = (reference: Reference, licenses: readonly License[]) =>
  reference.license !== null && licenses.includes(reference.license);

/** One request per query and service, in order, with PAUSE_MS between them. */
export const searchReferences = async (
  queries: readonly string[], options: SearchOptions, http: Http, pause: (ms: number) => Promise<void>,
): Promise<SearchResult[]> => {
  const results: SearchResult[] = [];
  for (const query of queries) {
    for (const source of options.sources) {
      if (results.length > 0) await pause(PAUSE_MS);
      const found = source === 'commons'
        ? parseCommons(await http.getJson(commonsSearchUrl(query, options.limit, options.width)))
        : parseOpenverse(await http.getJson(openverseSearchUrl(query, options.limit, options.licenses)));
      results.push({
        query, source,
        kept: found.filter((reference) => allowed(reference, options.licenses)),
        dropped: found.filter((reference) => !allowed(reference, options.licenses)),
      });
    }
  }
  return results;
};

const short = (text: string, size: number) => text.length > size ? `${text.slice(0, size - 1)}…` : text;

export const formatSearch = (results: readonly SearchResult[], licenses: readonly License[]): string => results.map(({query, source, kept, dropped}) => {
  const lines = [`== ${query} (${source})`];
  for (const item of kept) {
    const size = item.width && item.height ? `${item.width}x${item.height}` : '?';
    lines.push(`  ${item.id} | ${size} | ${item.licenseLabel} (${item.license}) | ${short(item.creator || item.credit, 70)} | ${item.page}`);
  }
  if (kept.length === 0) lines.push('  (nothing with an allowed licence)');
  if (dropped.length > 0) {
    const labels = [...new Set(dropped.map((item) => item.licenseLabel || 'no licence'))].join(', ');
    lines.push(`  left out ${dropped.length}: outside ${licenses.join(',')} (${labels})`);
  }
  return lines.join('\n');
}).join('\n');

export type FetchItem = {name: string; commons?: string; openverse?: string; width?: number};
export type FetchedRecord = Reference & {name: string; file: string; bytes: number};
export type FetchOutcome = {written: FetchedRecord[]; refused: Array<{name: string; why: string}>};

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The fetch list: `[{"name": "01_whirlpool-m51", "commons": "File:Messier51 sRGB.jpg", "width": 1800}, {"name": "…", "openverse": "<id>"}]`. */
export const parseFetchList = (data: unknown): FetchItem[] => {
  if (!Array.isArray(data) || data.length === 0) throw new Error('The fetch list must be a non-empty JSON array of {name, commons | openverse, width?}.');
  const seen = new Set<string>();
  return data.map((entry, index) => {
    const item = entry as FetchItem;
    const where = `item ${index + 1}`;
    if (typeof item?.name !== 'string' || !NAME.test(item.name)) throw new Error(`${where}: name must be letters, digits, dot, dash or underscore (it becomes the file name).`);
    if (seen.has(item.name)) throw new Error(`${where}: the name ${item.name} repeats.`);
    seen.add(item.name);
    if ((typeof item.commons === 'string') === (typeof item.openverse === 'string')) throw new Error(`${where} (${item.name}): give exactly one of commons (a File: title) or openverse (an id).`);
    if (item.width !== undefined && !(Number.isInteger(item.width) && item.width > 0)) throw new Error(`${where} (${item.name}): width must be a positive integer.`);
    return item;
  });
};

export type FetchEffects = Http & {
  pause: (ms: number) => Promise<void>;
  exists: (file: string) => boolean;
  writeFile: (file: string, bytes: Uint8Array) => void;
};

/**
 * Downloads every item whose licence is allowed into `outDir` as `<name><ext>`, one request at a time.
 * An item without an allowed licence, or whose download is not an image, is refused and nothing of it is written.
 */
export const fetchReferences = async (
  items: readonly FetchItem[], options: {outDir: string; width: number; licenses: readonly License[]; overwrite: boolean}, effects: FetchEffects,
): Promise<FetchOutcome> => {
  const outcome: FetchOutcome = {written: [], refused: []};
  let requests = 0;
  const get = async <T>(call: () => Promise<T>) => {
    if (requests++ > 0) await effects.pause(PAUSE_MS);
    return call();
  };
  for (const item of items) {
    const width = item.width ?? options.width;
    const found = item.commons !== undefined
      ? parseCommons(await get(() => effects.getJson(commonsFileUrl(item.commons!, width))))[0]
      : parseOpenverseImage(await get(() => effects.getJson(openverseImageUrl(item.openverse!))) as OpenverseImage);
    if (!found?.download) {
      outcome.refused.push({name: item.name, why: `nothing to download on ${item.commons !== undefined ? 'Commons' : 'Openverse'}`});
      continue;
    }
    if (!allowed(found, options.licenses)) {
      outcome.refused.push({name: item.name, why: `licence ${found.licenseLabel || 'missing'} is outside ${options.licenses.join(',')}`});
      continue;
    }
    const {bytes, type} = await get(() => effects.getBytes(found.download!));
    const ext = IMAGE_TYPES[type.split(';')[0].trim().toLowerCase()];
    if (!ext) {
      outcome.refused.push({name: item.name, why: `the download is ${type || 'untyped'}, not an image`});
      continue;
    }
    const file = path.join(options.outDir, `${item.name}${ext}`);
    if (effects.exists(file) && !options.overwrite) {
      outcome.refused.push({name: item.name, why: `${file} exists (pass --overwrite)`});
      continue;
    }
    effects.writeFile(file, bytes);
    outcome.written.push({...found, name: item.name, file: path.basename(file), bytes: bytes.length});
  }
  return outcome;
};

/** sources.json after a fetch: earlier records kept, the ones fetched again replaced by name. */
export const mergeSources = (previous: readonly FetchedRecord[], written: readonly FetchedRecord[]): FetchedRecord[] => {
  const names = new Set(written.map((record) => record.name));
  return [...previous.filter((record) => !names.has(record.name)), ...written]
    .sort((a, b) => a.name.localeCompare(b.name));
};

export type GitProbe = {
  /** The top level of the git repo holding `dir`, or null outside any. */
  repoOf: (dir: string) => string | null;
  isIgnored: (repo: string, target: string) => boolean;
};

/** Refuses an output folder that git would track: a downloaded reference never goes into a repo. */
export const checkOutDir = (outDir: string, git: GitProbe): void => {
  let probe = path.resolve(outDir);
  while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const repo = git.repoOf(probe);
  if (repo && !git.isIgnored(repo, path.resolve(outDir))) {
    throw new Error(`Refusing ${outDir}: git would track it in ${repo}, and a downloaded reference never goes into git. `
      + 'Fetch into the vault (~/obsidian/Visual Ref/<theme>/) or an ignored folder such as out/.scratch/reference/.');
  }
};

export const realGit: GitProbe = {
  repoOf: (dir) => {
    try {
      return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null;
    } catch {
      return null;
    }
  },
  isIgnored: (repo, target) => {
    try {
      execFileSync('git', ['-C', repo, 'check-ignore', '-q', target], {stdio: 'ignore'});
      return true;
    } catch {
      return false;
    }
  },
};

/** The real requests: every one carries USER_AGENT, and a non-2xx answer stops the run (no retry loop on a 429). */
export const httpWith = (fetchImpl: typeof fetch): Http => {
  const request = async (url: string) => {
    const response = await fetchImpl(url, {headers: {'User-Agent': USER_AGENT}, signal: AbortSignal.timeout(120_000)});
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      throw new Error(`${response.status} ${response.statusText} from ${url}${retry ? ` (retry after ${retry} s)` : ''}`);
    }
    return response;
  };
  return {
    getJson: async (url) => (await request(url)).json(),
    getBytes: async (url) => {
      const response = await request(url);
      return {bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get('content-type') ?? ''};
    },
  };
};

export const realFetchEffects = (): FetchEffects => ({
  ...httpWith(fetch),
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  exists: existsSync,
  writeFile: (file, bytes) => {
    mkdirSync(path.dirname(file), {recursive: true});
    writeFileSync(file, bytes);
  },
});

export const readSources = (file: string): FetchedRecord[] => {
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  return Array.isArray(data) ? data as FetchedRecord[] : [];
};
