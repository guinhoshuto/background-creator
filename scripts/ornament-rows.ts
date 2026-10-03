import {planPack, type PackDeps, type PackManifest, type PlannedFile} from './pack-plan';
import {getBlockLayout, type BlockLoopProps} from '../src/overlays/block';
import {getBorderGeometry, type BorderLoopProps} from '../src/overlays/border';
import {getChatLayout, type ChatLoopProps} from '../src/overlays/chat';
import {maxExtentAt, type OrnamentLayout, type OrnamentSlotId} from '../src/overlays/shared/ornaments';

/**
 * The ornaments report (`npm run ornaments:report -- <pack>`): where each set puts its motifs on
 * every file of a pack, from the placement alone (place(), through the kinds' layouts). No render,
 * no browser, no render slot: it reads the same plan as render:pack and the same layouts as the
 * compositions, so what it prints is what the files draw.
 */

/** Each overlay kind's ornament layout, from the props the pack plan exports. */
const LAYOUTS: Record<string, (props: Record<string, unknown>) => OrnamentLayout> = {
  ChatLoop: (props) => getChatLayout(props as ChatLoopProps).ornamentLayout,
  BlockLoop: (props) => getBlockLayout(props as BlockLoopProps).ornamentLayout,
  BorderLoop: (props) => getBorderGeometry(props as BorderLoopProps).ornamentLayout,
};

export type OrnamentMotifRow = {
  motif: string;
  slot: OrnamentSlotId;
  layer: 'back' | 'front';
  /** The motif's own size parameter (moon diameter, bat wingspan…), in the file's px. */
  size: number;
  /** The radius of the circle that holds the motif, its motion and its light, in the file's px. */
  extent: number;
  /** The largest extent that fits at the motif's centre on its layer (maxExtentAt), down to 0.5 px of the set's space, in the file's px. */
  room: number;
};

export type OrnamentFileRow = {
  /** The file without pack folder and extension, as the buyer sees it: chat/halloween-midnight-chat-compact. */
  name: string;
  composition: string;
  size?: string;
  canvas: {width: number; height: number};
  box: {width: number; height: number};
  set: string;
  ornamentSize: number;
  ornamentScale: number;
  motifs: OrnamentMotifRow[];
  /** Motifs this set places on another file of the same composition in the pack but not on this one, sorted. */
  dropped: string[];
};

/**
 * Down to the half pixel with a micro-pixel of slack: a motif placed by bisection sits right at the
 * edge of its room (34.999999999 for 35), which a plain floor would report half a pixel short.
 */
const roomHalf = (value: number) => Math.floor(value * 2 + 1e-6) / 2;

const fileName = (file: PlannedFile) => file.output.replace(/^out\/packs\/[^/]+\//, '').replace(/\.[a-z0-9]+$/, '');

/**
 * One row per pack file with ornaments (one format per file name; masks, backgrounds and
 * `ornaments: "none"` are left out), in plan order.
 */
export const ornamentRows = (manifest: PackManifest, deps: PackDeps): OrnamentFileRow[] => {
  const rows: OrnamentFileRow[] = [];
  const seen = new Set<string>();
  for (const file of planPack(manifest, deps)) {
    const layoutOf = LAYOUTS[file.composition];
    const props = file.exportProps;
    if (!layoutOf || file.role === 'mask' || props.ornaments === 'none' || props.ornaments === undefined) continue;
    const name = fileName(file);
    if (seen.has(name)) continue;
    seen.add(name);
    const layout = layoutOf(props);
    const scale = layout.scale ?? 1;
    const {frame} = layout;
    rows.push({
      name, composition: file.composition, ...(file.size === undefined ? {} : {size: file.size}),
      canvas: {...file.canvas}, box: {width: frame.box.width * scale, height: frame.box.height * scale},
      set: String(props.ornaments), ornamentSize: Number(props.ornamentSize), ornamentScale: scale,
      motifs: layout.placements.map((placement) => ({
        motif: placement.motif, slot: placement.slot, layer: placement.layer,
        size: placement.size * scale, extent: placement.extent * scale,
        room: roomHalf(maxExtentAt(frame, placement.x, placement.y, placement.layer)) * scale,
      })),
      dropped: [],
    });
  }
  // A set draws different motifs per kind (a border's fence, a chat's stars): drops are measured
  // against the other files of the same composition and set.
  const groupOf = (row: OrnamentFileRow) => `${row.composition}|${row.set}`;
  const motifsByGroup = new Map<string, Set<string>>();
  for (const row of rows) {
    const motifs = motifsByGroup.get(groupOf(row)) ?? new Set<string>();
    for (const {motif} of row.motifs) motifs.add(motif);
    motifsByGroup.set(groupOf(row), motifs);
  }
  for (const row of rows) {
    const here = new Set(row.motifs.map(({motif}) => motif));
    row.dropped = [...motifsByGroup.get(groupOf(row))!].filter((motif) => !here.has(motif)).sort();
  }
  return rows;
};

const px = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** The report as text: one block per file, a motif per line, then the totals. */
export const ornamentReportText = (pack: string, rows: readonly OrnamentFileRow[]) => {
  if (rows.length === 0) return `${pack}: no file with ornaments (every item is a background, a mask or uses ornaments "none").`;
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(
      `${row.name}  ${row.canvas.width}×${row.canvas.height} file, ${px(row.box.width)}×${px(row.box.height)} box`
      + `  ${row.set}, ornamentSize ${px(row.ornamentSize)}, ornamentScale ${px(row.ornamentScale)}`,
    );
    if (row.motifs.length === 0) lines.push('  (nothing placed: the schema refuses this size)');
    else {
      const width = Math.max(5, ...row.motifs.map(({motif}) => motif.length));
      lines.push(`  ${'slot'.padEnd(7)}${'motif'.padEnd(width + 2)}${'layer'.padEnd(7)}${'size'.padStart(7)}${'extent'.padStart(8)}${'room'.padStart(8)}`);
      for (const motif of row.motifs) {
        lines.push(`  ${motif.slot.padEnd(7)}${motif.motif.padEnd(width + 2)}${motif.layer.padEnd(7)}`
          + `${px(motif.size).padStart(7)}${px(motif.extent).padStart(8)}${px(motif.room).padStart(8)}`);
      }
    }
    if (row.dropped.length > 0) lines.push(`  dropped here: ${row.dropped.join(', ')}`);
    lines.push('');
  }
  const motifs = rows.reduce((total, row) => total + row.motifs.length, 0);
  const withDrops = rows.filter((row) => row.dropped.length > 0).length;
  lines.push(`${pack}: ${rows.length} files with ornaments, ${motifs} motifs; ${withDrops} files drop a motif the set places on another file of the same kind.`);
  lines.push('Sizes in px of the file: size is the motif\'s own measure (moon diameter, wingspan, width), extent the radius that holds it with its motion and light, room the largest extent that fits at its centre.');
  return lines.join('\n');
};
