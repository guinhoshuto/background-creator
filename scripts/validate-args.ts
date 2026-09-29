// The command line of `npm run validate:exports`, apart from the script so tests read it without rendering.
import path from 'node:path';
import {parseArgs} from 'node:util';

/** Validation output is scratch: it goes under out/.scratch, never next to what the owner opens. */
export const DEFAULT_VALIDATION_OUT = path.join('out', '.scratch', 'validation');

/** `root` resolves a relative --out (and the default); an absolute --out stays as given. */
export const parseValidateArgs = (args: string[], root: string) => {
  const {values} = parseArgs({args, options: {
    duration: {type: 'string', default: '0.4'},
    'reuse-existing': {type: 'boolean', default: false},
    kind: {type: 'string'},
    only: {type: 'string'},
    out: {type: 'string'},
  }});
  if (values.out !== undefined && values.out.trim() === '') throw new Error('Use --out <dir>: the folder for the samples and report.json.');
  return {values, destination: path.resolve(root, values.out ?? DEFAULT_VALIDATION_OUT)};
};
