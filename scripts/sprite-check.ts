// What packs and validate:exports check before a render that shows Blender sprites: the registry,
// the set's Python files and each manifest, read from disk for spriteProblems (blender-sprites-plan.ts).
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {getAsset, getSpritesOf, type SpriteNeed} from '../src/catalog';
import {SPRITES_ROOT, parseSpriteRegistry, spriteProblems, type PythonFile, type SpriteRegistry} from './blender-sprites-plan';

/** The sprite sets and assets these files show, merged per set, each asset once. */
export const spriteNeedsOf = (files: readonly {composition: string; exportProps: Record<string, unknown>}[]): SpriteNeed[] => {
  const sets = new Map<string, Set<string>>();
  for (const file of files) {
    const need = getSpritesOf(getAsset(file.composition))?.(file.exportProps);
    if (!need) continue;
    const assets = sets.get(need.set) ?? new Set<string>();
    for (const asset of need.assets) assets.add(asset);
    sets.set(need.set, assets);
  }
  return [...sets].map(([set, assets]) => ({set, assets: [...assets].sort()}));
};

const readJson = (file: string): unknown => {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch {
    return 'unreadable';
  }
};

/** spriteProblems for every need, from the project at root; ship (a pack) also wants them complete and current. */
export const checkSprites = (root: string, needs: readonly SpriteNeed[], ship: boolean): string[] => needs.flatMap((need) => {
  const setDirectory = path.join(root, 'scripts', 'blender', need.set);
  const registryFile = path.join(setDirectory, 'sprites.json');
  // The registry and the Python only matter to a pack: they give the hash a current sprite carries.
  const registry: SpriteRegistry | null = ship && existsSync(registryFile)
    ? parseSpriteRegistry(JSON.parse(readFileSync(registryFile, 'utf8')), need.set)
    : null;
  const pythonFiles: PythonFile[] = ship && existsSync(setDirectory)
    ? readdirSync(setDirectory).filter((name) => name.endsWith('.py')).sort()
      .map((name) => ({name, content: readFileSync(path.join(setDirectory, name))}))
    : [];
  return spriteProblems({
    need, registry, pythonFiles, ship,
    readManifest: (asset) => readJson(path.join(root, SPRITES_ROOT, need.set, asset, 'manifest.json')),
  });
});

/** One refusal: the headline, a line per asset, then the command that renders them all. */
export const spriteRefusalText = (headline: string, problems: readonly string[], needs: readonly SpriteNeed[]) => [
  `${headline}:`,
  ...problems.map((problem) => `  ${problem}`),
  `Render them all: ${needs.map((need) => `npm run blender:sprites -- ${need.set}`).join(', then ')} (it renders only what is missing, partial or stale).`,
].join('\n');
