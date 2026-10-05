// The command line of `npm run validate:exports`, apart from the script so tests read it without rendering.
import path from 'node:path';
import {parseArgs} from 'node:util';

/** Validation output is scratch: it goes under out/.scratch, never next to what the owner opens. */
export const DEFAULT_VALIDATION_OUT = path.join('out', '.scratch', 'validation');

export const VALIDATE_HELP_TEXT = `usage: npm run validate:exports -- [options]

Renders a short sample of each composition in every export profile (backgrounds: MP4, opaque and
alpha WebM, GIF; overlays: WebM, MOV, PNG, MP4) at its smallest and tallest size, reads each file back
and compares it with a reference PNG: codec, size, FPS, frames, alpha and colour. Waits for the render
slot. Does not validate packs (npm run validate:pack -- <name>).

Options:
  --kind <kind>          only one asset kind (background, chat, block, border)
  --composition <id>     only one composition, for example ChatLoop
  --only <text>          only the files whose name contains the text
  --props <file.json>    validates these props instead of the defaults (needs --composition)
  --presets              validates every preset a pack in packs/ ships with its composition,
                         instead of the defaults (the preset name goes in the file name)
  --duration <s>         sample length in seconds (default 0.4)
  --reuse-existing       checks files already in the output folder instead of rendering them
  --out <dir>            output folder (default ${DEFAULT_VALIDATION_OUT})
  -h, --help             shows this help`;

/** `root` resolves a relative --out (and the default); an absolute --out stays as given. */
export const parseValidateArgs = (args: string[], root: string) => {
  const {values} = parseArgs({args, options: {
    duration: {type: 'string', default: '0.4'},
    'reuse-existing': {type: 'boolean', default: false},
    kind: {type: 'string'},
    composition: {type: 'string'},
    only: {type: 'string'},
    props: {type: 'string'},
    presets: {type: 'boolean', default: false},
    out: {type: 'string'},
    help: {type: 'boolean', short: 'h'},
  }});
  if (values.out !== undefined && values.out.trim() === '') throw new Error('Use --out <dir>: the folder for the samples and report.json.');
  if (values.props !== undefined && values.props.trim() === '') throw new Error('Use --props <file.json>: saved parameters for --composition.');
  if (values.props !== undefined && values.presets) throw new Error('Use --props or --presets, not both.');
  if (values.props !== undefined && values.composition === undefined) throw new Error('--props needs --composition <id>: a props file belongs to one composition.');
  return {
    values, destination: path.resolve(root, values.out ?? DEFAULT_VALIDATION_OUT),
    propsFile: values.props === undefined ? undefined : path.resolve(root, values.props),
  };
};
