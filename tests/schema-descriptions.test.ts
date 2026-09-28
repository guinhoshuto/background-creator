import assert from 'node:assert/strict';
import {test} from 'node:test';
import {zColor} from '@remotion/zod-types';
import {backgroundCatalog, overlayCatalog} from '../src/catalog';

/**
 * The Studio's ZodDefaultEditor hands the field to the editor of its innerType, and that editor
 * reads the innerType's description: `X.default(d).describe(s)` puts the text on the ZodDefault,
 * where nobody reads it. So it is `X.describe(s).default(d)`. A colour is the exception: the
 * description of `zColor()` is the brand that picks the colour picker, and describing it swaps
 * the picker for a text field, so a colour carries no `.describe()` at all.
 */

type Node = {
  description?: string;
  _zod: {def: {type: string; innerType?: Node; shape?: Record<string, Node>; element?: Node; in?: Node; checks?: {_zod: {def: {check?: string; fn?: unknown}}}[]}};
};

const COLOR_BRAND = zColor().description;
const colorFingerprint = (schema: Node): string | null => {
  const custom = (schema._zod.def.checks ?? []).find((check) => check._zod.def.check === 'custom');
  return custom ? String(custom._zod.def.fn) : null;
};
const COLOR_REFINE = colorFingerprint(zColor() as unknown as Node);
const isColor = (schema: Node) => schema._zod.def.type === 'string' && colorFingerprint(schema) === COLOR_REFINE;

type Report = {problems: string[]; described: number; colors: number; texts: string[]};

const inspect = (schema: Node, where: string, report: Report): void => {
  const {def} = schema._zod;
  if (schema.description !== undefined && schema.description !== COLOR_BRAND) report.texts.push(`${where}: ${schema.description}`);
  switch (def.type) {
    case 'object':
      for (const [key, field] of Object.entries(def.shape ?? {})) inspect(field, `${where}.${key}`, report);
      return;
    case 'default': {
      if (schema.description !== undefined) {
        report.problems.push(`${where}: ZodDefault com descrição (use .describe() antes de .default())`);
      }
      let inner = def.innerType as Node;
      const chain = [schema];
      while (inner._zod.def.type === 'default') {
        chain.push(inner);
        inner = inner._zod.def.innerType as Node;
      }
      if (chain.some((node) => node.description !== undefined) && inner.description === undefined) {
        report.problems.push(`${where}: campo descrito com o innerType sem descrição`);
      }
      if (inner.description !== undefined && !isColor(inner)) report.described++;
      // The chain's defaults were checked here; only look inside what they wrap.
      for (const node of chain.slice(1)) {
        if (node.description !== undefined) report.problems.push(`${where}: ZodDefault aninhado com descrição`);
      }
      inspect(inner, where, report);
      return;
    }
    case 'optional':
    case 'nullable':
    case 'readonly':
      inspect(def.innerType as Node, where, report);
      return;
    case 'pipe':
      inspect(def.in as Node, where, report);
      return;
    case 'array':
      inspect(def.element as Node, `${where}[]`, report);
      return;
    case 'string':
      if (isColor(schema)) {
        report.colors++;
        if (schema.description !== COLOR_BRAND) {
          report.problems.push(`${where}: zColor com descrição (${JSON.stringify(schema.description)}); cor fica sem .describe()`);
        }
      }
      return;
    default:
      return;
  }
};

const catalog = {...backgroundCatalog, ...overlayCatalog};

for (const [id, entry] of Object.entries(catalog)) {
  test(`${id}: descriptions sit where the Studio reads them`, () => {
    const report: Report = {problems: [], described: 0, colors: 0, texts: []};
    inspect(entry.schema as unknown as Node, id, report);
    assert.deepEqual(report.problems, []);
    assert.ok(report.colors > 0, `${id}: nenhum zColor encontrado; o percurso do schema quebrou`);
  });
}

test('the walk reaches the described fields of every composition', () => {
  let described = 0;
  for (const [id, entry] of Object.entries(catalog)) {
    const report: Report = {problems: [], described: 0, colors: 0, texts: []};
    inspect(entry.schema as unknown as Node, id, report);
    described += report.described;
  }
  assert.ok(described >= 100, `só ${described} campos descritos encontrados`);
});

/**
 * The Studio shows these texts to whoever edits a preset, so they are English like the rest of the
 * repo, and so are the ids quoted inside them (rectangle, none, dashes, circle-sm...).
 */
const PORTUGUESE = /[áàâãéêíóôõúç]|\b(de|da|do|das|dos|para|com|em|ou|sem|uma|cada|quando|pelo|pela|entre|mais|menos|não|só)\b/i;

test('every Studio description is in English', () => {
  const texts: string[] = [];
  for (const [id, entry] of Object.entries(catalog)) {
    const report: Report = {problems: [], described: 0, colors: 0, texts: []};
    inspect(entry.schema as unknown as Node, id, report);
    texts.push(...report.texts);
  }
  assert.ok(texts.length >= 100, `only ${texts.length} descriptions found`);
  assert.deepEqual(texts.filter((text) => PORTUGUESE.test(text.slice(text.indexOf(': ') + 2))), []);
});
