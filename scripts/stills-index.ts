import {readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

/**
 * `npm run stills -- index`: one HTML page over the PNGs of one or more stills folders, each image
 * under a short caption the owner quotes back in a review ("HM-03 looks lost"). The tag is the
 * initials of the folder's name after its date and the words every folder shares (2026-10-04-qa-
 * halloween-haunted-mansion → HM); the number counts that folder's images in page order (mockups,
 * then contact sheets, then the rest), so a rerun with the same files keeps every caption. CPU only,
 * no render slot.
 */

const HELP_TEXT = `npm run stills -- index <out.html> <dir>... [options]

Writes one review page over the PNGs of the given stills folders, each image captioned with a short
id (HM-03 · mock-gameplay-0) to quote back in a review. Ids are stable across reruns of the same job.

Options:
  --title <text>  page title (default: Review)
  -h, --help      show this help`;

export type IndexImage = {id: string; file: string; caption: string};
export type IndexSection = {name: string; tag: string; dir: string; images: IndexImage[]};

const DATE = /^\d{4}-\d{2}-\d{2}-/;

/** The words of each folder's name after its date, minus the leading words every folder shares (kept when nothing else is left). */
export const sectionNames = (dirs: readonly string[]): string[] => {
  const words = dirs.map((dir) => path.basename(path.resolve(dir)).replace(DATE, '').split('-').filter(Boolean));
  let shared = 0;
  while (words.every((w) => w.length > shared + 1 && w[shared] === words[0]![shared])) shared++;
  return words.map((w) => w.slice(dirs.length > 1 ? shared : 0).join('-'));
};

/** HM for haunted-mansion; a second folder with the same initials gets a digit (C, C2). */
export const sectionTags = (names: readonly string[]): string[] => {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const initials = name.split('-').map((word) => word[0]!.toUpperCase()).join('') || 'X';
    const count = (seen.get(initials) ?? 0) + 1;
    seen.set(initials, count);
    return count === 1 ? initials : `${initials}${count}`;
  });
};

const ORDER = [/^mock-/, /^sheet-/];
const rank = (file: string) => {
  const index = ORDER.findIndex((pattern) => pattern.test(file));
  return index === -1 ? ORDER.length : index;
};

/** The folder's PNGs in page order (mockups, sheets, the rest; by name inside each), captioned. */
export const captionImages = (tag: string, files: readonly string[]): IndexImage[] =>
  files.filter((file) => file.endsWith('.png') && !file.endsWith('.base.png'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((file, index) => {
      const id = `${tag}-${String(index + 1).padStart(2, '0')}`;
      return {id, file, caption: `${id} · ${file.replace(/\.png$/, '')}`};
    });

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const renderIndex = (title: string, sections: readonly IndexSection[], outFile: string): string => {
  const base = path.dirname(path.resolve(outFile));
  const href = (dir: string, file: string) => path.relative(base, path.join(path.resolve(dir), file)).split(path.sep).map(encodeURIComponent).join('/');
  const nav = sections.map((s) => `<a href="#${s.tag}">${s.tag} · ${escape(s.name)}</a>`).join(' ');
  const body = sections.map((s) => [
    `<h2 id="${s.tag}">${s.tag} · ${escape(s.name)}</h2>`,
    '<div class="grid">',
    ...s.images.map((image) => `<figure id="${image.id}"><a href="${href(s.dir, image.file)}"><img src="${href(s.dir, image.file)}" alt="${escape(image.caption)}" loading="lazy"></a><figcaption>${escape(image.caption)}</figcaption></figure>`),
    '</div>',
  ].join('\n')).join('\n');
  return `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
body{background:#111;color:#ddd;font:14px system-ui;margin:16px}
nav{position:sticky;top:0;background:#111;padding:8px 0;z-index:1}nav a{color:#9cf;margin-right:12px}
h2{margin-top:32px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,640px),1fr));gap:12px}
figure{margin:0}img{width:100%;border:1px solid #333;display:block}
figcaption{font:600 15px ui-monospace,monospace;color:#fff;background:#222;padding:6px 8px}
</style>
<h1>${escape(title)}</h1>
<nav>${nav}</nav>
${body}
`;
};

export const stillsIndex = (args: readonly string[]): string => {
  const {values, positionals} = parseArgs({
    args: [...args], allowPositionals: true,
    options: {title: {type: 'string', default: 'Review'}, help: {type: 'boolean', short: 'h'}},
  });
  if (values.help) return HELP_TEXT;
  const [outFile, ...dirs] = positionals;
  if (!outFile?.endsWith('.html') || dirs.length === 0) throw new Error('Pass the page and at least one folder: npm run stills -- index <out.html> <dir>... Use --help.');
  const names = sectionNames(dirs);
  const tags = sectionTags(names);
  const sections = dirs.map((dir, index): IndexSection => ({
    name: names[index]!, tag: tags[index]!, dir, images: captionImages(tags[index]!, readdirSync(dir)),
  }));
  writeFileSync(outFile, renderIndex(values.title!, sections, outFile));
  const count = sections.reduce((sum, s) => sum + s.images.length, 0);
  return `${outFile}: ${count} images in ${sections.length} section(s) (${sections.map((s) => `${s.tag} ${s.name}`).join(', ')}).`;
};
